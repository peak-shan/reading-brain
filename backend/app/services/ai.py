"""AI summary + auto-tagging service — powered by Volcano Ark (火山方舟)."""

import json
import re
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Truncation strategy
# ---------------------------------------------------------------------------

MAX_CONTENT_CHARS = 8000
HEAD_CHARS = 6000
TAIL_CHARS = 2000
OMITTED_MARKER = "\n\n[...内容已省略...]\n\n"


def _truncate(content: str) -> str:
    """Truncate article content to fit within model token limits.

    - ≤ 8000 chars → return as-is
    - > 8000 chars → first 6000 + [...内容已省略...] + last 2000
    """
    if len(content) <= MAX_CONTENT_CHARS:
        return content
    head = content[:HEAD_CHARS]
    tail = content[-TAIL_CHARS:]
    return head + OMITTED_MARKER + tail


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "你是一个知识管理助手，擅长提取文章核心信息。"
    "请根据用户提供的文章正文，输出一个 JSON 对象，包含以下字段：\n"
    '- "summary": 用 2-3 句话概括文章主要内容（中文）\n'
    '- "key_insight": 提炼出文章最核心的一个观点或洞见（一句话）\n'
    '- "tags": 3-5 个关键词标签，用于分类和检索\n\n'
    "只输出 JSON，不要输出其他内容。"
)


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

async def analyze_article(content: str) -> dict:
    """Call Volcano Ark LLM to generate summary, key_insight, and tags.

    Returns:
        dict with keys: summary (str), key_insight (str), tags (list[str])

    Raises:
        RuntimeError if the API is unavailable or returns an error.
        The caller (router) decides how to handle this — typically by setting
        summary="生成失败，请重试" and leaving tags empty.
    """
    if not settings.volcano_api_key or settings.volcano_api_key == "your_api_key_here":
        raise RuntimeError("Volcano Ark API key not configured")

    truncated = _truncate(content)
    payload = {
        "model": settings.volcano_model_id,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"以下是文章正文：\n\n{truncated}"},
        ],
        "temperature": 0.3,
        "max_tokens": 1024,
    }
    headers = {
        "Authorization": f"Bearer {settings.volcano_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.volcano_base_url}/chat/completions",
                json=payload,
                headers=headers,
                timeout=httpx.Timeout(30.0, connect=5.0),
            )

        if resp.status_code != 200:
            logger.error("Volcano Ark API returned HTTP %d: %s", resp.status_code, resp.text[:500])
            raise RuntimeError(f"AI API returned HTTP {resp.status_code}")

        data = resp.json()
        reply = data["choices"][0]["message"]["content"]
        logger.info("Volcano Ark reply length: %d chars", len(reply))

        return _parse_ai_response(reply, content)

    except httpx.TimeoutException:
        logger.error("Volcano Ark API request timed out")
        raise RuntimeError("AI API request timed out")
    except RuntimeError:
        raise  # Re-raise our own RuntimeErrors
    except Exception as exc:
        logger.error("Volcano Ark API error: %s", exc)
        raise RuntimeError(f"AI API error: {exc}")


# ---------------------------------------------------------------------------
# JSON parsing with tolerance
# ---------------------------------------------------------------------------

def _parse_ai_response(reply: str, original_content: str) -> dict:
    """Parse AI JSON response with fallback strategies."""
    # Strategy 1: direct JSON parse
    try:
        parsed = json.loads(reply)
        return _validate_and_clean(parsed, original_content)
    except (json.JSONDecodeError, TypeError):
        pass

    # Strategy 2: extract JSON object from text
    match = re.search(r"\{[\s\S]*\}", reply)
    if match:
        try:
            parsed = json.loads(match.group())
            return _validate_and_clean(parsed, original_content)
        except (json.JSONDecodeError, TypeError):
            pass

    # Strategy 3: give up
    logger.warning("Failed to parse AI response as JSON")
    raise RuntimeError("Failed to parse AI response as JSON")


def _validate_and_clean(parsed: dict, original_content: str) -> dict:
    """Validate fields and clean tags."""
    summary = str(parsed.get("summary", "")).strip()
    key_insight = str(parsed.get("key_insight", "")).strip()
    raw_tags = parsed.get("tags", [])

    # Clean tags
    tags = _clean_tags(raw_tags)

    # Fallback for empty fields
    if not summary:
        summary = original_content[:200] + ("..." if len(original_content) > 200 else "")
    if not key_insight:
        key_insight = summary.split("。")[0] if "。" in summary else summary[:50]

    return {
        "summary": summary,
        "key_insight": key_insight,
        "tags": tags,
    }


def _clean_tags(raw_tags) -> list[str]:
    """Deduplicate, truncate length, and limit count."""
    if not isinstance(raw_tags, list):
        return []

    seen = set()
    cleaned = []
    for tag in raw_tags:
        t = str(tag).strip()
        if not t or len(t) < 1:
            continue
        # Truncate to 20 chars
        t = t[:20]
        # Deduplicate (case-insensitive)
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(t)

    # Limit to 3-5 tags
    if len(cleaned) > 5:
        cleaned = cleaned[:5]

    return cleaned


# ---------------------------------------------------------------------------
# Fallback (no API key or parse failure)
# ---------------------------------------------------------------------------

def _fallback_analyze(content: str) -> dict:
    """Simple local extraction when AI is unavailable."""
    summary = content[:200].strip()
    if len(content) > 200:
        summary += "..."

    # Extract rough keywords by frequency (very basic)
    # Split by common separators and filter short/common words
    import re as _re
    words = _re.findall(r"[一-鿿]{2,6}|[a-zA-Z]{3,}", content)
    # Remove very common words
    stopwords = {
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人",
        "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去",
        "你", "会", "着", "没有", "看", "好", "自己", "这", "他", "她",
        "the", "and", "for", "that", "this", "with", "from", "have",
        "was", "are", "but", "not", "you", "all", "can", "her",
    }
    freq = {}
    for w in words:
        w_lower = w.lower()
        if w_lower in stopwords:
            continue
        freq[w_lower] = freq.get(w_lower, 0) + 1

    # Top 5 by frequency
    top_tags = sorted(freq, key=freq.get, reverse=True)[:5]

    key_insight = summary.split("。")[0] if "。" in summary else summary[:50]

    return {
        "summary": summary,
        "key_insight": key_insight,
        "tags": top_tags,
    }
