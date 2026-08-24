from uuid import uuid4

import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

try:
    from .society_db import get_conn
    from .society_security import authenticate_user, create_access_token
except ImportError:
    from society_db import get_conn
    from society_security import authenticate_user, create_access_token

router = APIRouter(prefix="/society/auth", tags=["society-auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


@router.post("/register", status_code=201)
def register(body: RegisterRequest):
    email = str(body.email).strip().lower()
    user_id = str(uuid4())
    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM users WHERE LOWER(email)=LOWER(%s) LIMIT 1", (email,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="An account already exists for this email")

        cur.execute(
            """
            INSERT INTO users (user_id, email, password_hash, role)
            VALUES (%s, %s, %s, 'resident')
            """,
            (user_id, email, password_hash),
        )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    token = create_access_token(user_id, "resident", email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"user_id": user_id, "email": email, "role": "resident"},
    }


@router.post("/login")
def login(body: LoginRequest):
    user = authenticate_user(str(body.email), body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user["user_id"], user["role"], user["email"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }
