"""FastAPI application entry point."""

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.responses import JSONResponse

from app.database import init_db

# Import models so Base.metadata is populated
from app.models import Article, Tag, Highlight  # noqa: F401

# Create all tables + FTS5 virtual table + settings on startup
init_db()

app = FastAPI(
    title="Reading Brain API",
    description="轻量版 Readwise / 第二大脑 — AI 稍后读 + 个人知识库",
    version="0.3.0",
)

# Register routers
from app.routers.auth import router as auth_router
from app.routers.articles import router as articles_router
from app.routers.tags import router as tags_router
app.include_router(auth_router)
app.include_router(articles_router)
app.include_router(tags_router)

# CORS — allow frontend dev server + production
_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Serve frontend static files (production)
# ---------------------------------------------------------------------------
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_DIST / "assets")), name="static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve index.html for all non-API routes (SPA fallback)."""
        file = _FRONTEND_DIST / full_path
        if file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(_FRONTEND_DIST / "index.html"))


# ---------------------------------------------------------------------------
# Public paths (no auth required)
# ---------------------------------------------------------------------------
_PUBLIC_PATHS = {
    "/api/health",
    "/api/auth/login",
    "/docs",
    "/openapi.json",
    "/redoc",
}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Require a valid JWT token for all API paths except public ones."""
    path = request.url.path

    # Skip auth for public paths and non-API paths
    if path in _PUBLIC_PATHS or not path.startswith("/api/"):
        return await call_next(request)

    # Check Authorization header
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"detail": "未登录，请先登录"},
        )

    # Validate token
    token = auth_header[7:]  # strip "Bearer "
    try:
        import jwt
        from app.config import settings

        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"]
        )
        request.state.username = payload["sub"]
    except jwt.ExpiredSignatureError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Token 已过期，请重新登录"},
        )
    except jwt.InvalidTokenError:
        return JSONResponse(
            status_code=401,
            content={"detail": "无效的认证信息，请重新登录"},
        )

    return await call_next(request)


@app.get("/api/health")
def health_check():
    """Health check endpoint — public, no auth required."""
    return {"status": "ok"}
