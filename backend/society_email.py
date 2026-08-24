import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
GMAIL_SENDER = os.environ.get("GMAIL_SENDER", "")
GMAIL_APP_PASS = os.environ.get("GMAIL_APP_PASS", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def send_email(recipient: str, subject: str, html: str) -> tuple[bool, Optional[str]]:
    if not GMAIL_SENDER or not GMAIL_APP_PASS:
        return False, "Email credentials are not configured"
    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = GMAIL_SENDER
        message["To"] = recipient
        message.attach(MIMEText(html, "html"))
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(GMAIL_SENDER, GMAIL_APP_PASS)
            server.sendmail(GMAIL_SENDER, recipient, message.as_string())
        return True, None
    except Exception as exc:
        return False, str(exc)


def status_change_email(recipient: str, complaint_id: int, status: str, note: Optional[str]) -> tuple[str, str, str]:
    subject = f"Society Maintenance: Complaint #{complaint_id} updated"
    note_html = f"<p><strong>Admin note:</strong> {note}</p>" if note else ""
    html = f"""
    <div style='font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033'>
      <h2>Complaint #{complaint_id} updated</h2>
      <p>Your maintenance complaint status is now <strong>{status}</strong>.</p>
      {note_html}
      <p><a href='{FRONTEND_URL}/complaints/{complaint_id}'>Open complaint</a></p>
    </div>
    """
    return subject, html, f"status_change:{complaint_id}:{status}"


def important_notice_email(recipient: str, notice_id: int, title: str, content: str) -> tuple[str, str, str]:
    subject = f"IMPORTANT Society Notice: {title}"
    html = f"""
    <div style='font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033'>
      <h2>IMPORTANT: {title}</h2>
      <p>{content}</p>
      <p><a href='{FRONTEND_URL}/notices'>Open notice board</a></p>
    </div>
    """
    return subject, html, f"important_notice:{notice_id}:{recipient.lower()}"
