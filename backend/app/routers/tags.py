"""Tag management API — list, update, delete."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.article import article_tags
from app.models.tag import Tag
from app.schemas.tag import TagWithCount, TagUpdate, TagOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["tags"])


# ---------------------------------------------------------------------------
# GET /api/tags — tag list with article count
# ---------------------------------------------------------------------------

@router.get("/tags", response_model=list[TagWithCount])
def list_tags(db: Session = Depends(get_db)):
    """Return all tags with the number of articles associated with each."""
    # Left join tags → article_tags to count articles per tag
    rows = (
        db.query(
            Tag.id,
            Tag.name,
            Tag.color,
            func.count(article_tags.c.article_id).label("article_count"),
        )
        .outerjoin(article_tags, Tag.id == article_tags.c.tag_id)
        .group_by(Tag.id, Tag.name, Tag.color)
        .order_by(Tag.name)
        .all()
    )
    return [
        TagWithCount(
            id=r.id,
            name=r.name,
            color=r.color,
            article_count=r.article_count,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# PUT /api/tags/{id} — update tag name or color
# ---------------------------------------------------------------------------

@router.put("/tags/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, req: TagUpdate, db: Session = Depends(get_db)):
    """Update tag name and/or color.

    - If name is provided and already exists on another tag, return 409 Conflict.
    """
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if req.name is not None:
        new_name = req.name.strip()[:128]
        if not new_name:
            raise HTTPException(status_code=422, detail="Tag name cannot be empty")
        # Check uniqueness
        dup = db.query(Tag).filter(Tag.name == new_name, Tag.id != tag_id).first()
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Tag name '{new_name}' already exists",
            )
        tag.name = new_name

    if req.color is not None:
        tag.color = req.color

    db.commit()
    db.refresh(tag)
    return tag


# ---------------------------------------------------------------------------
# DELETE /api/tags/{id} — delete tag (detach from articles, don't delete articles)
# ---------------------------------------------------------------------------

@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    """Delete a tag. Articles are NOT deleted; only the association is removed."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Detach from all articles (the association table rows)
    # SQLAlchemy relationship handles this, but let's be explicit
    tag.articles.clear()
    db.delete(tag)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# POST /api/tags/merge — merge two tags into one
# ---------------------------------------------------------------------------

class MergeTagsRequest(BaseModel):
    source_id: int      # tag to merge FROM (will be deleted)
    target_id: int      # tag to merge INTO (will be kept)


@router.post("/tags/merge", response_model=TagWithCount)
def merge_tags(req: MergeTagsRequest, db: Session = Depends(get_db)):
    """Merge source tag into target tag.

    - All articles tagged with source are re-tagged with target.
    - If an article already has both tags, just remove the source association.
    - The source tag is deleted after merging.
    """
    if req.source_id == req.target_id:
        raise HTTPException(status_code=422, detail="Cannot merge a tag into itself")

    source = db.query(Tag).filter(Tag.id == req.source_id).first()
    target = db.query(Tag).filter(Tag.id == req.target_id).first()

    if not source or not target:
        raise HTTPException(status_code=404, detail="One or both tags not found")

    # Get article IDs that have the source tag
    source_article_ids = [
        row[0]
        for row in db.execute(
            text("SELECT article_id FROM article_tags WHERE tag_id = :tid"),
            {"tid": source.id},
        ).fetchall()
    ]

    # Get article IDs that already have the target tag
    target_article_ids = set(
        row[0]
        for row in db.execute(
            text("SELECT article_id FROM article_tags WHERE tag_id = :tid"),
            {"tid": target.id},
        ).fetchall()
    )

    # Move articles that don't already have the target tag
    for aid in source_article_ids:
        if aid not in target_article_ids:
            db.execute(
                article_tags.insert().values(article_id=aid, tag_id=target.id)
            )

    # Remove all source associations
    db.execute(
        text("DELETE FROM article_tags WHERE tag_id = :tid"),
        {"tid": source.id},
    )

    # Delete source tag
    db.delete(source)
    db.commit()
    db.refresh(target)

    # Return updated target with count
    count = db.execute(
        text("SELECT COUNT(*) FROM article_tags WHERE tag_id = :tid"),
        {"tid": target.id},
    ).scalar()

    return TagWithCount(
        id=target.id,
        name=target.name,
        color=target.color,
        article_count=count or 0,
    )
