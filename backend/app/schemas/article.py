"""Pydantic schemas for article request/response models."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, HttpUrl


# ---------------------------------------------------------------------------
# Tag schemas
# ---------------------------------------------------------------------------

class TagOut(BaseModel):
    id: int
    name: str
    color: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Article schemas
# ---------------------------------------------------------------------------

class ArticleCreate(BaseModel):
    url: str


class ArticleOut(BaseModel):
    id: int
    url: str
    title: Optional[str] = None
    content: Optional[str] = None
    content_html: Optional[str] = None
    summary: Optional[str] = None
    key_insight: Optional[str] = None
    author: Optional[str] = None
    site_name: Optional[str] = None
    published_at: Optional[datetime] = None
    saved_at: datetime
    read_status: str
    favorite: bool
    note: Optional[str] = None
    tags: list[TagOut] = []

    model_config = {"from_attributes": True}


class ArticleUpdate(BaseModel):
    summary: Optional[str] = None
    key_insight: Optional[str] = None
    tags: Optional[list[str]] = None
    read_status: Optional[str] = None
    favorite: Optional[bool] = None
    note: Optional[str] = None


class PaginatedArticles(BaseModel):
    items: list[ArticleOut]
    total: int
    page: int
    page_size: int
    pages: int


class SearchItem(BaseModel):
    """A single search result with snippet and match info."""
    id: int
    url: str
    title: Optional[str] = None
    summary: Optional[str] = None
    read_status: Optional[str] = None
    favorite: Optional[bool] = None
    saved_at: Optional[str] = None
    site_name: Optional[str] = None
    author: Optional[str] = None
    snippet: str = ""
    matched_in: str = ""
    tags: list[TagOut] = []


class SearchResult(BaseModel):
    items: list[SearchItem]
    total: int
    query: str
    page: int
    page_size: int
    pages: int
