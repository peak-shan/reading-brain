"""Web article fetcher — Jina Reader API (primary) + Trafilatura (fallback)."""

import re
import time
import logging
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

JINA_TIMEOUT = 15.0
TRAFA_TIMEOUT = 10.0
TOTAL_TIMEOUT = 30.0

# Common browser-like user agent
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


def fetch_article(url: str) -> dict:
    """Fetch an article by URL.

    Returns a dict with keys: title, content, author, site_name.
    Falls back from Jina Reader → Trafilatura → direct httpx if earlier methods fail.
    Raises RuntimeError with detail message if all methods fail.
    """
    t0 = time.time()
    errors = []
    blocked_403 = False

    # --- Primary: Jina Reader API ---
    try:
        elapsed = time.time() - t0
        result = _fetch_jina(url, timeout=min(JINA_TIMEOUT, TOTAL_TIMEOUT - elapsed))
        if result and _valid_content(result.get("content", "")):
            logger.info("Jina succeeded: %d chars", len(result["content"]))
            return result
        msg = "Jina returned empty/short content"
        logger.warning(msg)
        errors.append(f"jina: {msg}")
    except Exception as exc:
        msg = f"Jina error: {exc}"
        logger.warning(msg)
        errors.append(msg)

    # --- Fallback 1: Trafilatura ---
    remaining = TOTAL_TIMEOUT - (time.time() - t0)
    if remaining > 1:
        try:
            result = _fetch_trafilatura(url, timeout=min(TRAFA_TIMEOUT, remaining))
            if result and _valid_content(result.get("content", "")):
                logger.info("Trafilatura succeeded: %d chars", len(result["content"]))
                return result
            msg = "Trafilatura returned empty/short content"
            logger.warning(msg)
            errors.append(f"trafilatura: {msg}")
        except Exception as exc:
            msg = f"Trafilatura error: {exc}"
            if "403" in msg:
                blocked_403 = True
            logger.warning(msg)
            errors.append(msg)
    else:
        errors.append("trafilatura: skipped (timeout)")

    # --- Fallback 2: Direct httpx + simple HTML extraction ---
    remaining = TOTAL_TIMEOUT - (time.time() - t0)
    if remaining > 1:
        try:
            result = _fetch_direct(url, timeout=min(TRAFA_TIMEOUT, remaining))
            if result and _valid_content(result.get("content", "")):
                logger.info("Direct fetch succeeded: %d chars", len(result["content"]))
                return result
            msg = "Direct fetch returned empty/short content"
            logger.warning(msg)
            errors.append(f"direct: {msg}")
        except Exception as exc:
            msg = f"Direct fetch error: {exc}"
            if "403" in msg:
                blocked_403 = True
            logger.warning(msg)
            errors.append(msg)
    else:
        errors.append("direct: skipped (timeout)")

    # Build user-friendly error message
    if blocked_403:
        raise RuntimeError("该网站拒绝了自动抓取（403 反爬），您可以手动粘贴文章内容")
    detail = " | ".join(errors)
    raise RuntimeError(f"All fetch methods failed: {detail}")


# ---------------------------------------------------------------------------
# Method 1: Jina Reader API
# ---------------------------------------------------------------------------

def _fetch_jina(url: str, timeout: float) -> dict | None:
    """Fetch via Jina Reader API (https://r.jina.ai)."""
    jina_url = f"https://r.jina.ai/{url}"
    headers = {
        "Accept": "text/markdown",
        "X-Return-Format": "markdown",
        "X-No-Cache": "true",
    }

    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        resp = client.get(jina_url, headers=headers)

    if resp.status_code != 200:
        logger.warning("Jina returned HTTP %d", resp.status_code)
        return None

    md = resp.text.strip()
    if not md:
        return None

    return _parse_jina_markdown(md, url)


def _parse_jina_markdown(md: str, original_url: str) -> dict:
    """Extract title, content, author, site_name from Jina's markdown response."""
    lines = md.split("\n")
    title = ""
    content_lines = []
    author = ""

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("# ") and not title:
            title = stripped[2:].strip()
        else:
            content_lines.append(line)

    content = "\n".join(content_lines).strip()

    # Try to extract author from metadata lines
    for line in lines[:30]:
        low = line.lower().strip()
        if low.startswith("author"):
            author = line.split(":", 1)[-1].strip() if ":" in line else ""

    site_name = _domain_of(original_url)

    return {
        "title": title or _first_n_words(content, 10),
        "content": _clean_content(content),
        "author": author or None,
        "site_name": site_name,
    }


# ---------------------------------------------------------------------------
# Method 2: Trafilatura
# ---------------------------------------------------------------------------

def _fetch_trafilatura(url: str, timeout: float) -> dict | None:
    """Fetch via Trafilatura (HTML → text extraction)."""
    try:
        import trafilatura
    except ImportError:
        logger.error("trafilatura not installed")
        return None

    # Use httpx for download so we control timeout
    with httpx.Client(follow_redirects=True, timeout=timeout, headers={"User-Agent": _UA}) as client:
        resp = client.get(url)
    if resp.status_code == 403:
        raise RuntimeError("Site returned 403 (access blocked)")
    if resp.status_code != 200:
        return None

    html = resp.text

    # Try bare_extraction first for metadata
    metadata_dict = trafilatura.bare_extraction(html, include_comments=False)
    text_content = ""
    title = ""
    author = None
    site_name = None

    if metadata_dict:
        title = metadata_dict.get("title") or ""
        text_content = metadata_dict.get("text") or ""
        author = metadata_dict.get("author")
        site_name = metadata_dict.get("sitename")

    if not text_content:
        text_content = trafilatura.extract(
            html, include_comments=False, include_tables=True, output_format="txt",
        ) or ""

    if not text_content.strip():
        return None

    return {
        "title": title,
        "content": _clean_content(text_content),
        "author": author or None,
        "site_name": site_name or _domain_of(url),
    }


# ---------------------------------------------------------------------------
# Method 3: Direct httpx + lightweight HTML parsing
# ---------------------------------------------------------------------------

def _fetch_direct(url: str, timeout: float) -> dict | None:
    """Direct HTTP fetch with basic HTML text extraction (no JS rendering)."""
    with httpx.Client(
        follow_redirects=True,
        timeout=timeout,
        headers={"User-Agent": _UA},
    ) as client:
        resp = client.get(url)

    if resp.status_code == 403:
        raise RuntimeError("Site returned 403 (access blocked)")
    if resp.status_code != 200:
        return None

    html = resp.text

    # Extract title from <title> tag
    title = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    if m:
        title = m.group(1).strip()

    # Remove <script> and <style> blocks
    html_no_js = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)

    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", html_no_js)

    # Decode HTML entities
    import html as html_lib
    text = html_lib.unescape(text)

    # Collapse whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n", "\n\n", text)
    text = text.strip()

    if len(text) < 100:
        return None

    return {
        "title": title or _first_n_words(text, 10),
        "content": _clean_content(text[:10000]),  # limit to first 10K chars
        "author": None,
        "site_name": _domain_of(url),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _valid_content(text: str) -> bool:
    """Check if extracted content is long enough to be useful."""
    return len(text.strip()) >= 100


def _clean_content(text: str) -> str:
    """Remove excessive blank lines and common noise."""
    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if len(stripped) < 3 and stripped and not stripped.isspace():
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def _domain_of(url: str) -> str | None:
    """Extract domain name from URL."""
    try:
        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "") or None
    except Exception:
        return None


def _first_n_words(text: str, n: int) -> str:
    """Use first N words as a fallback title."""
    words = text.split()[:n]
    return " ".join(words) if words else "Untitled"
