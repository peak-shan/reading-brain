"""Authentication module — password hashing, JWT token, dependency injection."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

# ---------------------------------------------------------------------------
# User model (for dependency injection)
# ---------------------------------------------------------------------------

@dataclass
class CurrentUser:
    """Authenticated user info extracted from JWT."""
    username: str
    role: str  # 'admin' or 'sub'


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2-HMAC-SHA256, 100k iterations)
# ---------------------------------------------------------------------------

_ITERATIONS = 100_000


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Hash a password with PBKDF2-HMAC-SHA256.

    Returns (hashed_hex, salt). If salt is None, a random one is generated.
    """
    salt = salt or secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _ITERATIONS,
    )
    return hashed.hex(), salt


def verify_password(password: str, hashed: str, salt: str) -> bool:
    """Verify a password against a stored hash."""
    h, _ = hash_password(password, salt)
    return h == hashed


# ---------------------------------------------------------------------------
# JWT token
# ---------------------------------------------------------------------------

_TOKEN_EXPIRY_DAYS = 7


def create_access_token(username: str, role: str) -> str:
    """Create a JWT token for the given username and role."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(days=_TOKEN_EXPIRY_DAYS),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


# ---------------------------------------------------------------------------
# Dependency: get current authenticated user
# ---------------------------------------------------------------------------

_security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> CurrentUser:
    """Extract and validate the JWT token, return CurrentUser.

    Raises 401 if the token is missing, invalid, or expired.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"]
        )
        return CurrentUser(
            username=payload["sub"],
            role=payload.get("role", "sub"),
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401, detail="Token 已过期，请重新登录"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401, detail="无效的认证信息，请重新登录"
        )


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Require the current user to be an admin.

    Raises 403 if the user is not an admin.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403, detail="只有管理员可以执行此操作"
        )
    return current_user
