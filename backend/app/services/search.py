"""Full-text search service — SQLite FTS5 + jieba Chinese tokenization."""

import re
import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# FTS index sync — jieba pre-tokenization for Chinese support
# ---------------------------------------------------------------------------

def _jieba_tokenize(text_content: str) -> str:
    """Tokenize text with jieba and return space-separated tokens.

    FTS5's default unicode61 tokenizer splits on character boundaries,
    which doesn't work for Chinese. By pre-tokenizing with jieba and
    storing space-separated words, FTS5 correctly indexes Chinese words.
    """
    if not text_content:
        return ""
    import jieba
    words = jieba.lcut(text_content)
    # Keep only alphanumeric tokens, join with spaces
    return " ".join(w for w in words if w.strip() and any(c.isalnum() for c in w))


def sync_article_to_fts(db: Session, article_id: int):
    """Sync a single article's text to the FTS index with jieba tokenization.

    Call this after creating or updating an article.
    Uses INSERT OR REPLACE to handle both new and existing entries.
    """
    from app.models.article import Article

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        return

    # Pre-tokenize with jieba
    title_tokens = _jieba_tokenize(article.title or "")
    content_tokens = _jieba_tokenize(article.content or "")
    summary_tokens = _jieba_tokenize(article.summary or "")

    # Insert or replace tokenized text
    db.execute(
        text("INSERT OR REPLACE INTO articles_fts(rowid, title, content, summary) "
             "VALUES (:id, :title, :content, :summary)"),
        {
            "id": article_id,
            "title": title_tokens,
            "content": content_tokens,
            "summary": summary_tokens,
        },
    )


def remove_article_from_fts(db: Session, article_id: int):
    """Remove an article from the FTS index.

    Call this before deleting an article.
    """
    try:
        db.execute(
            text("DELETE FROM articles_fts WHERE rowid = :id"),
            {"id": article_id},
        )
    except Exception as exc:
        logger.warning("FTS delete for article %d failed: %s", article_id, exc)

# ---------------------------------------------------------------------------
# Weighted scoring
# ---------------------------------------------------------------------------

# Weights: title ×10, tags ×8, summary ×5, content ×1
WEIGHT_TITLE = 10
WEIGHT_TAGS = 8
WEIGHT_SUMMARY = 5
WEIGHT_CONTENT = 1

# Snippet configuration
SNIPPET_SIZE = 30          # ~30 tokens around the match
SNIPPET_START = "<mark>"
SNIPPET_END = "</mark>"
SNIPPET_ELLIPSIS = "…"


def search_articles(
    db: Session,
    query: str,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Full-text search across articles with weighted scoring.

    Uses jieba to tokenize the Chinese query, searches FTS5 in each column
    separately for weighted ranking, and returns highlighted snippets.

    Returns:
        dict with keys:
        - results: list of article dicts with snippet and score
        - total: total matching count
        - page: current page
        - page_size: page size
        - pages: total pages
        - query: original query string
    """
    if not query or not query.strip():
        return {
            "results": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 0,
            "query": query,
        }

    # Tokenize query with jieba
    tokens = _tokenize_query(query)
    if not tokens:
        return {
            "results": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 0,
            "query": query,
        }

    logger.info("Search tokens: %s", tokens)

    # Collect scored results using per-column searches for weighting
    scored: dict[int, dict] = {}  # article_id -> {article, score}

    # Search title (weight ×10)
    fts_match_title = _build_fts_match(tokens, column_prefix="title")
    _search_column(
        db, scored, fts_match_title, column="title", weight=WEIGHT_TITLE,
        query_tokens=tokens,
    )

    # Search summary (weight ×5)
    fts_match_summary = _build_fts_match(tokens, column_prefix="summary")
    _search_column(
        db, scored, fts_match_summary, column="summary", weight=WEIGHT_SUMMARY,
        query_tokens=tokens,
    )

    # Search content (weight ×1)
    fts_match_content = _build_fts_match(tokens, column_prefix="content")
    _search_column(
        db, scored, fts_match_content, column="content", weight=WEIGHT_CONTENT,
        query_tokens=tokens,
    )

    # Search tags (weight ×8) — via articles→article_tags→tags
    _search_tags(db, scored, tokens, weight=WEIGHT_TAGS)

    # Sort by score descending
    ranked = sorted(scored.values(), key=lambda x: x["score"], reverse=True)
    total = len(ranked)
    pages = (total + page_size - 1) // page_size if total > 0 else 0

    # Paginate
    start = (page - 1) * page_size
    end = start + page_size
    page_results = ranked[start:end]

    return {
        "results": [r["article"] for r in page_results],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "query": query,
    }


# ---------------------------------------------------------------------------
# Column search
# ---------------------------------------------------------------------------

def _search_column(
    db: Session,
    scored: dict,
    fts_match: str,
    column: str,
    weight: int,
    query_tokens: list[str] | None = None,
):
    """Search a specific FTS5 column and add weighted results to scored dict.

    FTS5 is used for matching and bm25 ranking only. Snippets are generated
    from the original article text (not from FTS, which stores pre-tokenized text).
    """
    sql = text("""
        SELECT
            a.id, a.url, a.title, a.summary, a.read_status,
            a.favorite, a.saved_at, a.site_name, a.author,
            a.content,
            bm25(articles_fts) AS rank
        FROM articles_fts
        JOIN articles a ON a.id = articles_fts.rowid
        WHERE articles_fts MATCH :match_query
        ORDER BY rank
    """)

    try:
        rows = db.execute(sql, {"match_query": fts_match}).fetchall()
    except Exception as exc:
        logger.warning("FTS5 search on %s failed: %s", column, exc)
        rows = []

    for row in rows:
        aid = row[0]
        # Generate snippet from original text
        original_text = {
            "title": row[2] or "",
            "content": row[9] or "",
            "summary": row[3] or "",
        }.get(column, "")
        snippet = _generate_snippet(original_text, query_tokens or [])

        article_data = {
            "id": row[0],
            "url": row[1],
            "title": row[2],
            "summary": row[3],
            "read_status": row[4],
            "favorite": row[5],
            "saved_at": str(row[6]) if row[6] else None,
            "site_name": row[7],
            "author": row[8],
            "snippet": snippet,
            "matched_in": column,
        }
        # bm25 returns negative values; more negative = better match
        rank_score = abs(row[10]) if row[10] else 1.0

        if aid in scored:
            scored[aid]["score"] += weight * rank_score
            # Append matched column
            if column not in scored[aid]["article"]["matched_in"]:
                scored[aid]["article"]["matched_in"] += f", {column}"
            # Prefer the most relevant snippet
            if weight > scored[aid].get("_snippet_weight", 0):
                scored[aid]["article"]["snippet"] = article_data["snippet"]
                scored[aid]["_snippet_weight"] = weight
        else:
            scored[aid] = {
                "article": article_data,
                "score": weight * rank_score,
                "_snippet_weight": weight if article_data["snippet"] else 0,
            }


# ---------------------------------------------------------------------------
# Tag search
# ---------------------------------------------------------------------------

def _search_tags(db: Session, scored: dict, tokens: list[str], weight: int):
    """Search article tags for matching keywords."""
    for token in tokens:
        sql = text("""
            SELECT DISTINCT a.id, a.url, a.title, a.summary, a.read_status,
                   a.favorite, a.saved_at, a.site_name, a.author,
                   GROUP_CONCAT(t.name, ', ') AS matched_tags
            FROM articles a
            JOIN article_tags at ON at.article_id = a.id
            JOIN tags t ON t.id = at.tag_id
            WHERE t.name LIKE :pattern
            GROUP BY a.id
        """)
        try:
            rows = db.execute(sql, {"pattern": f"%{token}%"}).fetchall()
        except Exception as exc:
            logger.warning("Tag search failed for token '%s': %s", token, exc)
            continue

        for row in rows:
            aid = row[0]
            article_data = {
                "id": row[0],
                "url": row[1],
                "title": row[2],
                "summary": row[3],
                "read_status": row[4],
                "favorite": row[5],
                "saved_at": str(row[6]) if row[6] else None,
                "site_name": row[7],
                "author": row[8],
                "snippet": f"标签匹配: {row[9]}",
                "matched_in": "tags",
            }
            if aid in scored:
                scored[aid]["score"] += weight
                if "tags" not in scored[aid]["article"]["matched_in"]:
                    scored[aid]["article"]["matched_in"] += ", tags"
            else:
                scored[aid] = {
                    "article": article_data,
                    "score": weight,
                    "_snippet_weight": 0,
                }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tokenize_query(query: str) -> list[str]:
    """Tokenize the search query using jieba for Chinese support."""
    import jieba

    # Clean query
    query = query.strip()
    if not query:
        return []

    # Split by spaces first (user may provide pre-separated tokens)
    parts = query.split()
    tokens = []
    for part in parts:
        # Use jieba to cut Chinese text
        words = jieba.lcut(part)
        for w in words:
            w = w.strip()
            if not w:
                continue
            # Skip pure punctuation / whitespace
            if all(c.isspace() or not c.isalnum() for c in w):
                continue
            tokens.append(w)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            unique.append(t)

    return unique


def _build_fts_match(tokens: list[str], column_prefix: str | None = None) -> str:
    """Build an FTS5 MATCH expression from tokens.

    Uses OR logic so that any token matching counts.
    Quotes each token to handle special characters.
    If column_prefix is given, restricts search to that FTS5 column.
    """
    # Escape double quotes in tokens
    escaped = [t.replace('"', '""') for t in tokens]
    if column_prefix:
        return " OR ".join(f'{column_prefix}:"{t}"' for t in escaped)
    return " OR ".join(f'"{t}"' for t in escaped)


def _fallback_search(db: Session, fts_match: str, column: str):
    """Simpler FTS5 search without snippet when the full query fails."""
    return []


# ---------------------------------------------------------------------------
# Snippet generation from original text
# ---------------------------------------------------------------------------

def _generate_snippet(text_content: str, tokens: list[str], max_len: int = 200) -> str:
    """Generate a highlighted snippet from original text around the first token match.

    Searches for any of the query tokens in the original text and extracts a
    window of text around the match with <mark> tags around matched tokens.
    """
    if not text_content or not tokens:
        return ""

    text_lower = text_content.lower()
    best_pos = -1

    # Find the earliest token match position
    for token in tokens:
        pos = text_lower.find(token.lower())
        if pos != -1 and (best_pos == -1 or pos < best_pos):
            best_pos = pos

    if best_pos == -1:
        # No match found in text — return the beginning
        snippet = text_content[:max_len]
        if len(text_content) > max_len:
            snippet += SNIPPET_ELLIPSIS
        return snippet

    # Calculate window around the match
    half_window = max_len // 2
    start = max(0, best_pos - half_window)
    end = min(len(text_content), start + max_len)
    # Adjust start if we hit the end
    if end - start < max_len:
        start = max(0, end - max_len)

    snippet = text_content[start:end]

    # Highlight matched tokens in the snippet
    for token in tokens:
        # Case-insensitive replacement
        pattern = re.compile(re.escape(token), re.IGNORECASE)
        snippet = pattern.sub(f"{SNIPPET_START}{token}{SNIPPET_END}", snippet)

    # Add ellipsis
    prefix = SNIPPET_ELLIPSIS if start > 0 else ""
    suffix = SNIPPET_ELLIPSIS if end < len(text_content) else ""
    return prefix + snippet + suffix
