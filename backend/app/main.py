"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db

# Import models so Base.metadata is populated
from app.models import Article, Tag, Highlight  # noqa: F401

# Create all tables + FTS5 virtual table on startup
init_db()

app = FastAPI(
    title="Reading Brain API",
    description="轻量版 Readwise / 第二大脑 — AI 稍后读 + 个人知识库",
    version="0.2.0",
)

# Register routers
from app.routers.articles import router as articles_router
from app.routers.tags import router as tags_router
app.include_router(articles_router)
app.include_router(tags_router)

# CORS — allow frontend dev server (add your production domain here)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
