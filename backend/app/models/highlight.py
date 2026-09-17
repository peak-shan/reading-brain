"""Highlight ORM model — user-selected text snippets within an article."""

from datetime import datetime

from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Highlight(Base):
    """A highlighted text passage inside an article."""

    __tablename__ = "highlights"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    note = Column(Text, nullable=True)
    position = Column(Integer, nullable=True)          # character offset in content
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    article = relationship("Article", back_populates="highlights")

    def __repr__(self) -> str:
        return f"<Highlight id={self.id} article_id={self.article_id}>"
