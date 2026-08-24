import json
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

try:
    from .society_db import get_conn
    from .society_email import important_notice_email, send_email, status_change_email
    from .society_logic import ALLOWED_STATUS_TRANSITIONS
    from .society_models import (
        ComplaintCreate, ComplaintHistoryOut, ComplaintOut, ComplaintPriority,
        ComplaintPriorityUpdate, ComplaintStatus, ComplaintStatusUpdate,
        NoticeCreate, NoticeOut, NoticeUpdate, UploadSignatureOut,
    )
    from .society_security import require_admin, require_resident, require_resident_or_admin
    from .society_storage import create_upload_signature, upload_photo, validate_uploaded_photo_url
except ImportError:
    from society_db import get_conn
    from society_email import important_notice_email, send_email, status_change_email
    from society_logic import ALLOWED_STATUS_TRANSITIONS
    from society_models import (
        ComplaintCreate, ComplaintHistoryOut, ComplaintOut, ComplaintPriority,
        ComplaintPriorityUpdate, ComplaintStatus, ComplaintStatusUpdate,
        NoticeCreate, NoticeOut, NoticeUpdate, UploadSignatureOut,
    )
    from society_security import require_admin, require_resident, require_resident_or_admin
    from society_storage import create_upload_signature, upload_photo, validate_uploaded_photo_url

router = APIRouter(prefix="/society", tags=["society-maintenance"])
OVERDUE_THRESHOLD_DAYS = int(os.environ.get("OVERDUE_THRESHOLD_DAYS", "3"))


def _overdue_sql() -> str:
    return "status <> 'Resolved' AND CURRENT_TIMESTAMP > created_at + (%s * INTERVAL '1 day')"


def _fetch_complaint(cur, complaint_id: int, user: dict, for_update: bool = False):
    query = f"""
        SELECT complaint_id, resident_id, category, description, photo_url, status,
               priority, created_at, updated_at, resolved_at, ({_overdue_sql()}) AS overdue
        FROM society_complaints WHERE complaint_id=%s
    """
    params = [OVERDUE_THRESHOLD_DAYS, complaint_id]
    if user["role"] == "resident":
        query += " AND resident_id=%s"
        params.append(user["user_id"])
    if for_update:
        query += " FOR UPDATE"
    cur.execute(query, params)
    return cur.fetchone()


def _complaint(row):
    return ComplaintOut(
        id=row[0], resident_id=str(row[1]), category=row[2], description=row[3], photo_url=row[4],
        status=row[5], priority=row[6], created_at=row[7], updated_at=row[8], resolved_at=row[9], overdue=bool(row[10])
    )


def _dispatch_event(conn, notification_id: int):
    cur = conn.cursor()
    try:
        cur.execute("SELECT event_key, recipient_email, event_type, payload, status FROM society_notification_events WHERE notification_id=%s", (notification_id,))
        row = cur.fetchone()
        if not row or row[4] == "sent":
            return
        event_key, recipient, event_type, payload, _ = row
        payload = payload if isinstance(payload, dict) else json.loads(payload)
        if event_type == "status_change":
            subject, html, _ = status_change_email(recipient, payload["complaint_id"], payload["status"], payload.get("note"))
        elif event_type == "important_notice":
            subject, html, _ = important_notice_email(recipient, payload["notice_id"], payload["title"], payload["content"])
        else:
            return
        ok, error = send_email(recipient, subject, html)
        if ok:
            cur.execute("UPDATE society_notification_events SET status='sent', sent_at=CURRENT_TIMESTAMP, last_error=NULL WHERE notification_id=%s", (notification_id,))
        else:
            cur.execute("UPDATE society_notification_events SET status='failed', last_error=%s WHERE notification_id=%s", (error, notification_id))
        conn.commit()
    finally:
        cur.close()


@router.post("/uploads/signature", response_model=UploadSignatureOut)
def upload_signature(user: dict = Depends(require_resident_or_admin)):
    return create_upload_signature()

@router.post("/uploads/photo")
async def upload_photo_endpoint(file: UploadFile = File(...), user: dict = Depends(require_resident_or_admin)):
    return await upload_photo(file)


@router.post("/complaints", response_model=ComplaintOut, status_code=201)
def create_complaint(body: ComplaintCreate, user: dict = Depends(require_resident)):
    validate_uploaded_photo_url(str(body.photo_url) if body.photo_url else None, body.photo_public_id)
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO society_complaints
              (resident_id, category, description, photo_url, photo_public_id, status, priority)
            VALUES (%s,%s,%s,%s,%s,'Open','Medium') RETURNING complaint_id
        """, (user["user_id"], body.category, body.description, str(body.photo_url) if body.photo_url else None, body.photo_public_id))
        complaint_id = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO society_complaint_status_history
              (complaint_id, previous_status, new_status, actor_id, note)
            VALUES (%s,NULL,'Open',%s,'Complaint created')
        """, (complaint_id, user["user_id"]))
        conn.commit()
        row = _fetch_complaint(cur, complaint_id, user)
        return _complaint(row)
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


@router.get("/complaints", response_model=list[ComplaintOut])
def list_complaints(
    category: Optional[str] = None,
    status: Optional[ComplaintStatus] = None,
    priority: Optional[ComplaintPriority] = None,
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    user: dict = Depends(require_resident_or_admin),
):
    conditions, params = [], []
    if user["role"] == "resident":
        conditions.append("resident_id=%s"); params.append(user["user_id"])
    if category: conditions.append("category=%s"); params.append(category)
    if status: conditions.append("status=%s"); params.append(status.value)
    if priority: conditions.append("priority=%s"); params.append(priority.value)
    if date_from: conditions.append("created_at >= %s"); params.append(date_from)
    if date_to: conditions.append("created_at <= %s"); params.append(date_to)
    where = " AND ".join(conditions) or "TRUE"
    query = f"""
      SELECT complaint_id,resident_id,category,description,photo_url,status,priority,created_at,updated_at,resolved_at,({_overdue_sql()})
      FROM society_complaints WHERE {where}
      ORDER BY CASE WHEN {_overdue_sql()} THEN 0 ELSE 1 END,
               CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,
               created_at DESC
    """
    query_params = [OVERDUE_THRESHOLD_DAYS, *params, OVERDUE_THRESHOLD_DAYS, OVERDUE_THRESHOLD_DAYS]
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute(query, query_params)
        return [_complaint(row) for row in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.get("/complaints/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: int, user: dict = Depends(require_resident_or_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        row = _fetch_complaint(cur, complaint_id, user)
        if not row: raise HTTPException(404, "Complaint not found")
        return _complaint(row)
    finally:
        cur.close(); conn.close()


@router.get("/complaints/{complaint_id}/history", response_model=list[ComplaintHistoryOut])
def get_history(complaint_id: int, user: dict = Depends(require_resident_or_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        if not _fetch_complaint(cur, complaint_id, user): raise HTTPException(404, "Complaint not found")
        cur.execute("""
          SELECT h.history_id,h.complaint_id,h.previous_status,h.new_status,h.actor_id,u.email,h.note,h.created_at
          FROM society_complaint_status_history h LEFT JOIN users u ON u.user_id=h.actor_id
          WHERE h.complaint_id=%s ORDER BY h.created_at ASC,h.history_id ASC
        """, (complaint_id,))
        return [ComplaintHistoryOut(id=r[0],complaint_id=r[1],previous_status=r[2],new_status=r[3],actor_id=str(r[4]),actor_email=r[5],note=r[6],created_at=r[7]) for r in cur.fetchall()]
    finally:
        cur.close(); conn.close()


@router.patch("/complaints/{complaint_id}/priority", response_model=ComplaintOut)
def update_priority(complaint_id: int, body: ComplaintPriorityUpdate, user: dict = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        row = _fetch_complaint(cur, complaint_id, user, True)
        if not row: raise HTTPException(404, "Complaint not found")
        if row[5] == ComplaintStatus.RESOLVED.value: raise HTTPException(409, "Resolved complaints are closed")
        cur.execute("UPDATE society_complaints SET priority=%s,updated_at=CURRENT_TIMESTAMP WHERE complaint_id=%s", (body.priority.value, complaint_id))
        conn.commit(); return _complaint(_fetch_complaint(cur, complaint_id, user))
    except HTTPException: conn.rollback(); raise
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


@router.patch("/complaints/{complaint_id}/status", response_model=ComplaintOut)
def update_status(complaint_id: int, body: ComplaintStatusUpdate, user: dict = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    notification_id = None
    try:
        row = _fetch_complaint(cur, complaint_id, user, True)
        if not row: raise HTTPException(404, "Complaint not found")
        previous, new = row[5], body.status.value
        if new == previous: raise HTTPException(409, "Complaint is already in that status")
        if new not in ALLOWED_STATUS_TRANSITIONS.get(previous, set()):
            raise HTTPException(409, f"Invalid status transition: {previous} -> {new}")
        if new == ComplaintStatus.RESOLVED.value:
            cur.execute("UPDATE society_complaints SET status=%s,resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE complaint_id=%s", (new, complaint_id))
        else:
            cur.execute("UPDATE society_complaints SET status=%s,resolved_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE complaint_id=%s", (new, complaint_id))
        cur.execute("""
          INSERT INTO society_complaint_status_history(complaint_id,previous_status,new_status,actor_id,note)
          VALUES(%s,%s,%s,%s,%s)
        """, (complaint_id, previous, new, user["user_id"], body.note))
        cur.execute("SELECT email FROM users WHERE user_id=(SELECT resident_id FROM society_complaints WHERE complaint_id=%s)", (complaint_id,))
        resident = cur.fetchone()
        if resident and resident[0]:
            _, _, event_key = status_change_email(resident[0], complaint_id, new, body.note)
            cur.execute("""
              INSERT INTO society_notification_events(event_key,recipient_email,event_type,payload)
              VALUES(%s,%s,'status_change',%s::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING notification_id
            """, (event_key, resident[0], json.dumps({"complaint_id":complaint_id,"status":new,"note":body.note})))
            event_row = cur.fetchone(); notification_id = event_row[0] if event_row else None
        conn.commit()
        if notification_id: _dispatch_event(conn, notification_id)
        return _complaint(_fetch_complaint(cur, complaint_id, user))
    except HTTPException: conn.rollback(); raise
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


@router.get("/admin/overdue", response_model=list[ComplaintOut])
def list_overdue(user: dict = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute(f"""
          SELECT complaint_id,resident_id,category,description,photo_url,status,priority,created_at,updated_at,resolved_at,({_overdue_sql()})
          FROM society_complaints WHERE {_overdue_sql()} ORDER BY created_at ASC
        """, (OVERDUE_THRESHOLD_DAYS, OVERDUE_THRESHOLD_DAYS))
        return [_complaint(r) for r in cur.fetchall()]
    finally: cur.close(); conn.close()


@router.get("/admin/dashboard")
def dashboard(user: dict = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("SELECT status,COUNT(*) FROM society_complaints GROUP BY status")
        by_status = {r[0]: r[1] for r in cur.fetchall()}
        cur.execute("SELECT category,COUNT(*) FROM society_complaints GROUP BY category ORDER BY COUNT(*) DESC,category ASC")
        by_category = {r[0]: r[1] for r in cur.fetchall()}
        cur.execute(f"SELECT COUNT(*) FROM society_complaints WHERE {_overdue_sql()}", (OVERDUE_THRESHOLD_DAYS,))
        overdue = cur.fetchone()[0]
        return {"total":sum(by_status.values()),"by_status":{"Open":by_status.get("Open",0),"In Progress":by_status.get("In Progress",0),"Resolved":by_status.get("Resolved",0)},"by_category":by_category,"overdue":overdue,"overdue_threshold_days":OVERDUE_THRESHOLD_DAYS}
    finally: cur.close(); conn.close()


@router.get("/notices", response_model=list[NoticeOut])
def list_notices(user: dict = Depends(require_resident_or_admin)):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("""
          SELECT n.notice_id,n.title,n.content,n.important,n.author_id,u.email,n.created_at,n.updated_at
          FROM society_notices n LEFT JOIN users u ON u.user_id=n.author_id
          ORDER BY n.important DESC,n.created_at DESC
        """)
        return [NoticeOut(id=r[0],title=r[1],content=r[2],important=r[3],author_id=str(r[4]),author_email=r[5],created_at=r[6],updated_at=r[7]) for r in cur.fetchall()]
    finally: cur.close(); conn.close()


@router.post("/notices", response_model=NoticeOut, status_code=201)
def create_notice(body: NoticeCreate, user: dict = Depends(require_admin)):
    conn = get_conn(); cur = conn.cursor(); notification_ids=[]
    try:
        cur.execute("INSERT INTO society_notices(title,content,important,author_id) VALUES(%s,%s,%s,%s) RETURNING notice_id", (body.title,body.content,body.important,user["user_id"]))
        notice_id=cur.fetchone()[0]
        if body.important:
            cur.execute("SELECT email FROM users WHERE role='resident' AND email IS NOT NULL")
            for (email,) in cur.fetchall():
                _, _, event_key = important_notice_email(email, notice_id, body.title, body.content)
                cur.execute("""
                  INSERT INTO society_notification_events(event_key,recipient_email,event_type,payload)
                  VALUES(%s,%s,'important_notice',%s::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING notification_id
                """, (event_key,email,json.dumps({"notice_id":notice_id,"title":body.title,"content":body.content})))
                x=cur.fetchone();
                if x: notification_ids.append(x[0])
        conn.commit()
        for nid in notification_ids: _dispatch_event(conn,nid)
        cur.execute("SELECT n.notice_id,n.title,n.content,n.important,n.author_id,u.email,n.created_at,n.updated_at FROM society_notices n LEFT JOIN users u ON u.user_id=n.author_id WHERE n.notice_id=%s", (notice_id,))
        r=cur.fetchone(); return NoticeOut(id=r[0],title=r[1],content=r[2],important=r[3],author_id=str(r[4]),author_email=r[5],created_at=r[6],updated_at=r[7])
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


@router.patch("/notices/{notice_id}", response_model=NoticeOut)
def update_notice(notice_id:int, body:NoticeUpdate, user:dict=Depends(require_admin)):
    fields=[]; params=[]
    if body.title is not None: fields.append("title=%s"); params.append(body.title.strip())
    if body.content is not None: fields.append("content=%s"); params.append(body.content.strip())
    if body.important is not None: fields.append("important=%s"); params.append(body.important)
    if not fields: raise HTTPException(400,"No fields supplied")
    fields.append("updated_at=CURRENT_TIMESTAMP"); params.append(notice_id)
    conn=get_conn(); cur=conn.cursor(); notification_ids=[]
    try:
        cur.execute("SELECT important,title,content FROM society_notices WHERE notice_id=%s FOR UPDATE",(notice_id,))
        before=cur.fetchone()
        if not before: raise HTTPException(404,"Notice not found")
        cur.execute(f"UPDATE society_notices SET {','.join(fields)} WHERE notice_id=%s",params)
        if body.important is True and before[0] is False:
            title = body.title.strip() if body.title is not None else before[1]
            content = body.content.strip() if body.content is not None else before[2]
            cur.execute("SELECT email FROM users WHERE role='resident' AND email IS NOT NULL")
            for (email,) in cur.fetchall():
                _, _, event_key = important_notice_email(email, notice_id, title, content)
                cur.execute("""
                  INSERT INTO society_notification_events(event_key,recipient_email,event_type,payload)
                  VALUES(%s,%s,'important_notice',%s::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING notification_id
                """, (event_key,email,json.dumps({"notice_id":notice_id,"title":title,"content":content})))
                x=cur.fetchone()
                if x: notification_ids.append(x[0])
        conn.commit()
        for nid in notification_ids: _dispatch_event(conn,nid)
        cur.execute("SELECT n.notice_id,n.title,n.content,n.important,n.author_id,u.email,n.created_at,n.updated_at FROM society_notices n LEFT JOIN users u ON u.user_id=n.author_id WHERE n.notice_id=%s",(notice_id,))
        r=cur.fetchone(); return NoticeOut(id=r[0],title=r[1],content=r[2],important=r[3],author_id=str(r[4]),author_email=r[5],created_at=r[6],updated_at=r[7])
    except HTTPException: conn.rollback(); raise
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()

@router.delete("/notices/{notice_id}", status_code=204)
def delete_notice(notice_id:int,user:dict=Depends(require_admin)):
    conn=get_conn();cur=conn.cursor()
    try:
        cur.execute("DELETE FROM society_notices WHERE notice_id=%s",(notice_id,))
        if cur.rowcount==0: raise HTTPException(404,"Notice not found")
        conn.commit()
    except HTTPException: conn.rollback(); raise
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


@router.post("/admin/notifications/retry")
def retry_failed_notifications(user:dict=Depends(require_admin)):
    conn=get_conn();cur=conn.cursor()
    try:
        cur.execute("SELECT notification_id FROM society_notification_events WHERE status IN ('pending','failed') ORDER BY created_at ASC LIMIT 50")
        ids=[r[0] for r in cur.fetchall()]
    finally: cur.close()
    for nid in ids: _dispatch_event(conn,nid)
    conn.close()
    return {"attempted":len(ids)}
