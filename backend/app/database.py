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
    """Create all tables (ORM + FTS5 virtual table + settings) on application startup."""
    Base.metadata.create_all(bind=engine)

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

        # Settings table for auth (key-value store)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """))
        conn.commit()

    # Re-index all articles if schema was migrated
    if needs_rebuild:
        _rebuild_fts_index()

    # Initialize default admin account if settings table is empty
    _init_default_admin()


def _init_default_admin():
    """Create default admin account if no auth settings exist yet."""
    from app.auth import hash_password

    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT value FROM app_settings WHERE key = 'admin_username'")
        ).fetchone()
        if row is None:
            hashed, salt = hash_password("admin123456")
            db.execute(
                text("INSERT INTO app_settings (key, value) VALUES (:k, :v)"),
                {"k": "admin_username", "v": "admin"},
            )
            db.execute(
                text("INSERT INTO app_settings (key, value) VALUES (:k, :v)"),
                {"k": "admin_password_hash", "v": hashed},
            )
            db.execute(
                text("INSERT INTO app_settings (key, value) VALUES (:k, :v)"),
                {"k": "admin_salt", "v": salt},
            )
            db.commit()
    finally:
        db.close()


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
