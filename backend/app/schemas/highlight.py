"""Pydantic schemas for highlight models."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HighlightCreate(BaseModel):
    text: str
    note: Optional[str] = None
    position: Optional[int] = None


class HighlightOut(BaseModel):
    id: int
    text: str
    note: Optional[str] = None
    position: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}
