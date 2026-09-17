"""Article management API — CRUD + search, wired to fetcher & AI services."""

import logging
from math import ceil
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text, func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.article import Article, article_tags
from app.models.tag import Tag
from app.schemas.article import (
    ArticleCreate,
    ArticleOut,
    ArticleUpdate,
    PaginatedArticles,
    SearchResult,
    TagOut,
)
from app.services.fetcher import fetch_article
from app.services.ai import analyze_article
from app.services.search import search_articles as fts_search
from app.services.search import sync_article_to_fts, remove_article_from_fts

logger = logging.getLogger(__name__)

# Content length limits
MIN_CONTENT_LENGTH = 100   # Below this → skip AI, mark as "内容过短"
MAX_CONTENT_LENGTH = 50000  # Above this → truncate

router = APIRouter(prefix="/api", tags=["articles"])


# ---------------------------------------------------------------------------
# POST /api/articles — add article
# ---------------------------------------------------------------------------

@router.post("/articles", response_model=ArticleOut, status_code=201)
async def create_article(req: ArticleCreate, db: Session = Depends(get_db)):
    """Add a new article by URL.

    - If URL already exists, return the existing record.
    - Fetch content → AI analyse → save to DB.
    - Handles: invalid URL, fetch failure, AI failure, short/long content.
    """
    # --- URL validation ---
    url = req.url.strip()
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise HTTPException(
            status_code=422,
            detail="请输入有效的链接（需包含 http:// 或 https://）",
        )
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=422,
            detail="仅支持 http 或 https 链接",
        )

    # Check for duplicate URL
    existing = db.query(Article).filter(Article.url == url).first()
    if existing:
        return existing

    # Create stub first so we have an ID
    article = Article(url=url, read_status="processing")
    db.add(article)
    db.commit()
    db.refresh(article)

    # --- Fetch content ---
    fetched = None
    fetch_error = None
    try:
        fetched = fetch_article(url)
        article.title = fetched.get("title")
        article.content = fetched.get("content")
        article.author = fetched.get("author")
        article.site_name = fetched.get("site_name")
    except Exception as exc:
        fetch_error = str(exc)
        logger.warning("Fetch failed for %s: %s", url, exc)

    # --- Content length handling ---
    content = article.content or ""
    content_too_short = False
    if content and len(content) < MIN_CONTENT_LENGTH:
        content_too_short = True
        # Keep the content but mark it
        article.summary = "内容过短，已跳过 AI 分析"
    elif len(content) > MAX_CONTENT_LENGTH:
        # Truncate long content
        article.content = content[:MAX_CONTENT_LENGTH]
        logger.info("Content truncated from %d to %d chars for %s",
                     len(content), MAX_CONTENT_LENGTH, url)

    # --- AI analysis (skip if fetch failed or content too short) ---
    ai_failed = False
    if not fetch_error and not content_too_short and article.content:
        try:
            ai_result = await analyze_article(article.content)
            article.summary = ai_result.get("summary")
            article.key_insight = ai_result.get("key_insight")

            # Attach tags
            for tag_name in ai_result.get("tags", []):
                tag = db.query(Tag).filter(Tag.name == tag_name).first()
                if not tag:
                    tag = Tag(name=tag_name)
                    db.add(tag)
                    db.flush()
                article.tags.append(tag)
        except Exception as exc:
            ai_failed = True
            logger.warning("AI analysis failed for %s: %s", url, exc)
            article.summary = "生成失败，请重试"
            # Leave tags empty on AI failure

    # If fetch failed entirely, set a clear error message
    if fetch_error and not article.title:
        # Use the fetcher's user-friendly message if available, else generic
        if "403" in fetch_error or "反爬" in fetch_error or "拒绝" in fetch_error:
            article.summary = "该网站拒绝了自动抓取，您可以手动粘贴文章内容"
        else:
            article.summary = "抓取失败，请检查链接是否正确"

    # Update status
    article.read_status = "unread"
    db.commit()
    db.refresh(article)

    # Sync to FTS index with jieba tokenization
    sync_article_to_fts(db, article.id)
    db.commit()

    return article


# ---------------------------------------------------------------------------
# GET /api/articles — list with pagination / filters
# ---------------------------------------------------------------------------

@router.get("/articles", response_model=PaginatedArticles)
def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    status: str | None = Query(None),
    favorite: bool | None = Query(None),
    sort: str = Query("desc"),
    db: Session = Depends(get_db),
):
    """Return paginated article list with optional filters."""
    q = db.query(Article).options(joinedload(Article.tags))

    # Tag filter
    if tag:
        q = q.join(Article.tags).filter(Tag.name == tag)

    # Status filter
    if status:
        q = q.filter(Article.read_status == status)

    # Favorite filter
    if favorite is not None:
        q = q.filter(Article.favorite == favorite)

    # Sort
    if sort == "asc":
        q = q.order_by(Article.saved_at.asc())
    else:
        q = q.order_by(Article.saved_at.desc())

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    # Deduplicate items (joinedload can produce duplicates)
    seen = set()
    unique_items = []
    for item in items:
        if item.id not in seen:
            seen.add(item.id)
            unique_items.append(item)

    return PaginatedArticles(
        items=unique_items,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total > 0 else 0,
    )


# ---------------------------------------------------------------------------
# GET /api/articles/search?q=... — full-text search
# ---------------------------------------------------------------------------

@router.get("/articles/search", response_model=SearchResult)
def search_articles(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Full-text search using FTS5 + jieba Chinese tokenization.

    Weighted scoring: title ×10, tags ×8, summary ×5, content ×1.
    Returns highlighted snippets via FTS5 snippet() function.
    """
    result = fts_search(db=db, query=q, page=page, page_size=page_size)

    # Enrich results with tags from DB
    if result["results"]:
        ids = [r["id"] for r in result["results"]]
        articles_with_tags = (
            db.query(Article)
            .options(joinedload(Article.tags))
            .filter(Article.id.in_(ids))
            .all()
        )
        tag_map = {a.id: [TagOut.model_validate(t).model_dump() for t in a.tags] for a in articles_with_tags}
        for r in result["results"]:
            r["tags"] = tag_map.get(r["id"], [])

    return SearchResult(
        items=result["results"],
        total=result["total"],
        query=result["query"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


# ---------------------------------------------------------------------------
# GET /api/articles/{id} — article detail
# ---------------------------------------------------------------------------

@router.get("/articles/{article_id}", response_model=ArticleOut)
def get_article(article_id: int, db: Session = Depends(get_db)):
    """Return full article data including content, summary, tags."""
    article = (
        db.query(Article)
        .options(joinedload(Article.tags))
        .filter(Article.id == article_id)
        .first()
    )
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


# ---------------------------------------------------------------------------
# PUT /api/articles/{id} — update article
# ---------------------------------------------------------------------------

@router.put("/articles/{article_id}", response_model=ArticleOut)
def update_article(
    article_id: int,
    req: ArticleUpdate,
    db: Session = Depends(get_db),
):
    """Update article fields. Tags are synced: new tags created, removed tags detached."""
    article = (
        db.query(Article)
        .options(joinedload(Article.tags))
        .filter(Article.id == article_id)
        .first()
    )
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Simple field updates
    if req.summary is not None:
        article.summary = req.summary
    if req.key_insight is not None:
        article.key_insight = req.key_insight
    if req.read_status is not None:
        article.read_status = req.read_status
    if req.favorite is not None:
        article.favorite = req.favorite
    if req.note is not None:
        article.note = req.note

    # Tag sync
    if req.tags is not None:
        # Build the new set of tags
        new_tags = []
        for tag_name in req.tags:
            tag_name = tag_name.strip()[:20]
            if not tag_name:
                continue
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                db.flush()
            new_tags.append(tag)
        article.tags = new_tags

    db.commit()
    db.refresh(article)

    # Re-sync FTS index if text fields may have changed
    sync_article_to_fts(db, article.id)
    db.commit()

    return article


# ---------------------------------------------------------------------------
# DELETE /api/articles/{id} — delete article
# ---------------------------------------------------------------------------

@router.delete("/articles/{article_id}", status_code=204)
def delete_article(article_id: int, db: Session = Depends(get_db)):
    """Delete article and all related data (tags, highlights, FTS index)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Remove FTS entry before deleting article
    remove_article_from_fts(db, article_id)
    db.delete(article)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Highlights
# ---------------------------------------------------------------------------

from app.models.highlight import Highlight
from app.schemas.highlight import HighlightCreate, HighlightOut


@router.get("/articles/{article_id}/highlights", response_model=list[HighlightOut])
def list_highlights(article_id: int, db: Session = Depends(get_db)):
    """Return all highlights for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return (
        db.query(Highlight)
        .filter(Highlight.article_id == article_id)
        .order_by(Highlight.position.asc().nullslast(), Highlight.created_at.asc())
        .all()
    )


@router.post(
    "/articles/{article_id}/highlights",
    response_model=HighlightOut,
    status_code=201,
)
def create_highlight(
    article_id: int,
    req: HighlightCreate,
    db: Session = Depends(get_db),
):
    """Add a highlight to an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    highlight = Highlight(
        article_id=article_id,
        text=req.text,
        note=req.note,
        position=req.position,
    )
    db.add(highlight)
    db.commit()
    db.refresh(highlight)
    return highlight


@router.delete("/articles/{article_id}/highlights/{highlight_id}", status_code=204)
def delete_highlight(
    article_id: int,
    highlight_id: int,
    db: Session = Depends(get_db),
):
    """Delete a highlight."""
    highlight = (
        db.query(Highlight)
        .filter(Highlight.id == highlight_id, Highlight.article_id == article_id)
        .first()
    )
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")
    db.delete(highlight)
    db.commit()
    return None
