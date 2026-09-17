"""SQLAlchemy engine, session factory, and DB initialisation."""

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

# SQLite needs check_same_thread=False for multi-threaded access
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def get_db():
    """FastAPI dependency that yields a DB session and ensures cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables (ORM + FTS5 virtual table) on application startup."""
    Base.metadata.create_all(bind=engine)

    # Create FTS5 virtual table for full-text search.
    # Standalone table (no content= link) so we can store jieba-pre-tokenized text.
    with engine.connect() as conn:
        # Drop old triggers if they exist (from previous schema with content= link)
        conn.execute(text("DROP TRIGGER IF EXISTS articles_fts_ai"))
        conn.execute(text("DROP TRIGGER IF EXISTS articles_fts_ad"))
        conn.execute(text("DROP TRIGGER IF EXISTS articles_fts_au"))

        # Check if FTS table uses old schema (content='articles' link)
        needs_rebuild = False
        try:
            sql = conn.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='articles_fts'")
            ).fetchone()
            if sql and "content=" in (sql[0] or ""):
                needs_rebuild = True
                conn.execute(text("DROP TABLE IF EXISTS articles_fts"))
        except Exception:
            pass

        conn.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts
            USING fts5(title, content, summary)
        """))
        conn.commit()

    # Re-index all articles if schema was migrated
    if needs_rebuild:
        _rebuild_fts_index()


def _rebuild_fts_index():
    """Re-index all articles into FTS with jieba tokenization."""
    from app.services.search import sync_article_to_fts
    from app.models.article import Article

    db = SessionLocal()
    try:
        for article in db.query(Article).all():
            sync_article_to_fts(db, article.id)
        db.commit()
    finally:
        db.close()
