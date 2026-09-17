"""Article ORM model."""

from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean,
    Table, ForeignKey,
)
from sqlalchemy.orm import relationship

from app.database import Base

# Many-to-many association table
article_tags = Table(
    "article_tags",
    Base.metadata,
    Column("article_id", Integer, ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Article(Base):
    """Represents a saved article / web page."""

    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), unique=True, nullable=False, index=True)
    title = Column(String(512), nullable=True)
    content = Column(Text, nullable=True)            # plain text
    content_html = Column(Text, nullable=True)       # original HTML (if any)
    summary = Column(Text, nullable=True)            # AI-generated summary
    key_insight = Column(Text, nullable=True)        # AI-generated key insight
    author = Column(String(256), nullable=True)
    site_name = Column(String(256), nullable=True)
    published_at = Column(DateTime, nullable=True)
    saved_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    read_status = Column(String(16), default="unread", nullable=False)   # unread / reading / read
    favorite = Column(Boolean, default=False, nullable=False)
    note = Column(Text, nullable=True)

    tags = relationship("Tag", secondary=article_tags, back_populates="articles")
    highlights = relationship("Highlight", back_populates="article", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Article id={self.id} title={self.title!r}>"
