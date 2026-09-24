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

        # Settings table for auth (key-value store) — kept for backward compatibility
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """))

        # Users table — supports multiple accounts with roles
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'sub',
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()

    # Re-index all articles if schema was migrated
    if needs_rebuild:
        _rebuild_fts_index()

    # Migrate default admin from app_settings to users table if needed
    _migrate_admin_to_users()


def _migrate_admin_to_users():
    """Create default admin in users table if it doesn't exist yet."""
    from app.auth import hash_password

    db = SessionLocal()
    try:
        # Check if admin already exists in users table
        row = db.execute(
            text("SELECT id FROM users WHERE username = :u"),
            {"u": "admin"},
        ).fetchone()

        if row is None:
            # Try to migrate from app_settings (backward compatibility)
            settings_row = db.execute(
                text("SELECT value FROM app_settings WHERE key = 'admin_username'"),
            ).fetchone()

            if settings_row and settings_row[0] == "admin":
                # Migrate existing admin
                hash_row = db.execute(
                    text("SELECT value FROM app_settings WHERE key = 'admin_password_hash'"),
                ).fetchone()
                salt_row = db.execute(
                    text("SELECT value FROM app_settings WHERE key = 'admin_salt'"),
                ).fetchone()

                if hash_row and salt_row:
                    db.execute(
                        text("""
                            INSERT INTO users (username, password_hash, salt, role, created_by)
                            VALUES (:username, :hash, :salt, :role, :created_by)
                        """),
                        {"username": "admin", "hash": hash_row[0], "salt": salt_row[0], "role": "admin", "created_by": None},
                    )
                    db.commit()
            else:
                # Create fresh default admin
                hashed, salt = hash_password("admin123456")
                db.execute(
                    text("""
                        INSERT INTO users (username, password_hash, salt, role, created_by)
                        VALUES (:username, :hash, :salt, :role, :created_by)
                    """),
                    {"username": "admin", "hash": hashed, "salt": salt, "role": "admin", "created_by": None},
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
