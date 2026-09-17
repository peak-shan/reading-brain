"""Pydantic schemas for tag request/response models."""

from typing import Optional

from pydantic import BaseModel


class TagOut(BaseModel):
    """Tag response — already defined in article schema, re-exported here."""
    id: int
    name: str
    color: Optional[str] = None

    model_config = {"from_attributes": True}


class TagWithCount(BaseModel):
    """Tag response with article count."""
    id: int
    name: str
    color: Optional[str] = None
    article_count: int = 0


class TagUpdate(BaseModel):
    """Request body for updating a tag."""
    name: Optional[str] = None
    color: Optional[str] = None
