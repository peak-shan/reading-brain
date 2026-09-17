"""Tag ORM model."""

from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Tag(Base):
    """A label with optional colour that can be attached to articles."""

    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), unique=True, nullable=False, index=True)
    color = Column(String(7), nullable=True)   # hex colour e.g. "#3458d4"

    articles = relationship("Article", secondary="article_tags", back_populates="tags")

    def __repr__(self) -> str:
        return f"<Tag id={self.id} name={self.name!r}>"
