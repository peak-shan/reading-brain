"""Authentication API — login, change password, user management."""

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.database import get_db
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_admin,
    CurrentUser,
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
    role: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UserInfo(BaseModel):
    username: str
    role: str


class CreateUserRequest(BaseModel):
    username: str
    password: str


class UserInfoResponse(BaseModel):
    id: int
    username: str
    role: str
    created_by: str | None
    created_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db=Depends(get_db)):
    """Verify username/password and return a JWT token."""
    # Query users table
    row = db.execute(
        text("SELECT id, username, password_hash, salt, role FROM users WHERE username = :u"),
        {"u": req.username},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    _, username, password_hash, salt, role = row

    if not verify_password(req.password, password_hash, salt):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_access_token(username, role)
    return LoginResponse(token=token, username=username, role=role)


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    db=Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Change the current user's password. Requires valid token."""
    # Fetch current user's hash and salt
    row = db.execute(
        text("SELECT password_hash, salt FROM users WHERE username = :u"),
        {"u": current_user.username},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=500, detail="用户数据异常")

    password_hash, salt = row

    if not verify_password(req.old_password, password_hash, salt):
        raise HTTPException(status_code=400, detail="原密码错误")

    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少需要 6 个字符")

    # Hash and store new password
    new_hash, new_salt = hash_password(req.new_password)
    db.execute(
        text("UPDATE users SET password_hash = :h, salt = :s WHERE username = :u"),
        {"h": new_hash, "s": new_salt, "u": current_user.username},
    )
    db.commit()

    return {"message": "密码修改成功"}


@router.get("/me", response_model=UserInfo)
def get_me(current_user: CurrentUser = Depends(get_current_user)):
    """Return the current authenticated user."""
    return UserInfo(username=current_user.username, role=current_user.role)


# ---------------------------------------------------------------------------
# User management (admin only)
# ---------------------------------------------------------------------------

@router.post("/users", response_model=UserInfoResponse)
def create_user(
    req: CreateUserRequest,
    db=Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    """Create a new sub-account. Admin only."""
    # Validate username
    if len(req.username) < 3 or len(req.username) > 20:
        raise HTTPException(status_code=400, detail="用户名需要 3-20 个字符")

    if req.username == "admin":
        raise HTTPException(status_code=400, detail="不能使用 admin 作为子账号用户名")

    # Check if username already exists
    existing = db.execute(
        text("SELECT id FROM users WHERE username = :u"),
        {"u": req.username},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")

    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少需要 6 个字符")

    # Hash password and insert
    hashed, salt = hash_password(req.password)
    result = db.execute(
        text("""
            INSERT INTO users (username, password_hash, salt, role, created_by)
            VALUES (:username, :hash, :salt, :role, :created_by)
        """),
        {"username": req.username, "hash": hashed, "salt": salt, "role": "sub", "created_by": current_user.username},
    )
    db.commit()

    # Fetch the created user
    row = db.execute(
        text("SELECT id, username, role, created_by, created_at FROM users WHERE id = :id"),
        {"id": result.lastrowid},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=500, detail="创建失败")

    user_id, username, role, created_by, created_at = row
    return UserInfoResponse(id=user_id, username=username, role=role, created_by=created_by, created_at=created_at)


@router.get("/users", response_model=list[UserInfoResponse])
def list_users(
    db=Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    """List all users. Admin only."""
    rows = db.execute(
        text("SELECT id, username, role, created_by, created_at FROM users ORDER BY id"),
    ).fetchall()

    return [
        UserInfoResponse(id=r[0], username=r[1], role=r[2], created_by=r[3], created_at=r[4])
        for r in rows
    ]


@router.delete("/users/{username}")
def delete_user(
    username: str,
    db=Depends(get_db),
    current_user: CurrentUser = Depends(require_admin),
):
    """Delete a sub-account. Admin only. Cannot delete admin account."""
    if username == "admin":
        raise HTTPException(status_code=400, detail="不能删除管理员账号")

    row = db.execute(
        text("SELECT id FROM users WHERE username = :u"),
        {"u": username},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")

    db.execute(
        text("DELETE FROM users WHERE username = :u"),
        {"u": username},
    )
    db.commit()

    return {"message": f"用户 {username} 已删除"}
