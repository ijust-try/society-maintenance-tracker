import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    from .society_db import get_conn
except ImportError:
    from society_db import get_conn

JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "60"))

bearer_scheme = HTTPBearer(auto_error=False)

# Existing hostel accounts use owner/staff. For the Society API those existing
# privileged accounts are treated as admin without changing their old role.
ADMIN_ROLES = {"admin", "owner", "staff"}
SOCIETY_ROLES = {"resident", "admin"}


def _get_jwt_secret() -> str:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET must be configured for the Society API")
    return JWT_SECRET


def normalize_society_role(database_role: str) -> str:
    return "admin" if database_role in ADMIN_ROLES else database_role


def create_access_token(user_id: str, role: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": normalize_society_role(role),
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, _get_jwt_secret(), algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, _get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(credentials.credentials)
    user_id = payload.get("sub")
    role = payload.get("role")

    if not user_id or role not in SOCIETY_ROLES:
        raise HTTPException(status_code=401, detail="Invalid user session")

    return {
        "user_id": str(user_id),
        "role": role,
        "email": payload.get("email", ""),
    }


def require_resident(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user["role"] != "resident":
        raise HTTPException(status_code=403, detail="Resident access required")
    return user


def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_resident_or_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return user


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def authenticate_user(email: str, password: str) -> Dict[str, Any] | None:
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT user_id, email, password_hash, role
            FROM users
            WHERE LOWER(email)=LOWER(%s)
              AND role IN ('resident', 'admin', 'owner', 'staff')
            LIMIT 1
            """,
            (email.strip(),),
        )
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    if not row or not verify_password(password, row[2]):
        return None

    return {
        "user_id": str(row[0]),
        "email": row[1],
        "role": normalize_society_role(row[3]),
    }
