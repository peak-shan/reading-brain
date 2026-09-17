"""Authentication API — login, change password, get current user."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.database import get_db
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UserInfo(BaseModel):
    username: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db=Depends(get_db)):
    """Verify username/password and return a JWT token."""
    row = db.execute(
        text("SELECT value FROM app_settings WHERE key = :k"),
        {"k": "admin_username"},
    ).fetchone()

    if not row or row[0] != req.username:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    # Fetch stored hash and salt
    hash_row = db.execute(
        text("SELECT value FROM app_settings WHERE key = :k"),
        {"k": "admin_password_hash"},
    ).fetchone()
    salt_row = db.execute(
        text("SELECT value FROM app_settings WHERE key = :k"),
        {"k": "admin_salt"},
    ).fetchone()

    if not hash_row or not salt_row:
        raise HTTPException(status_code=500, detail="认证配置异常")

    if not verify_password(req.password, hash_row[0], salt_row[0]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_access_token(req.username)
    return LoginResponse(token=token, username=req.username)


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    db=Depends(get_db),
    _user: str = Depends(get_current_user),
):
    """Change the admin password. Requires valid token."""
    # Verify old password
    hash_row = db.execute(
        text("SELECT value FROM app_settings WHERE key = :k"),
        {"k": "admin_password_hash"},
    ).fetchone()
    salt_row = db.execute(
        text("SELECT value FROM app_settings WHERE key = :k"),
        {"k": "admin_salt"},
    ).fetchone()

    if not hash_row or not salt_row:
        raise HTTPException(status_code=500, detail="认证配置异常")

    if not verify_password(req.old_password, hash_row[0], salt_row[0]):
        raise HTTPException(status_code=400, detail="原密码错误")

    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少需要 6 个字符")

    # Hash and store new password
    new_hash, new_salt = hash_password(req.new_password)
    db.execute(
        text("UPDATE app_settings SET value = :v WHERE key = :k"),
        {"v": new_hash, "k": "admin_password_hash"},
    )
    db.execute(
        text("UPDATE app_settings SET value = :v WHERE key = :k"),
        {"v": new_salt, "k": "admin_salt"},
    )
    db.commit()

    return {"message": "密码修改成功"}


@router.get("/me", response_model=UserInfo)
def get_me(_user: str = Depends(get_current_user)):
    """Return the current authenticated user."""
    return UserInfo(username=_user)
