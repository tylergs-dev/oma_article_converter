import os
import re
from dataclasses import dataclass
import httpx
import markdown
from bs4 import BeautifulSoup

from app.extractor import FetchError, _domain_from_url, _format_date, sanitize_html

JINA_BASE_URL = "https://r.jina.ai/"
JINA_TIMEOUT = 60.0

BOT_MARKERS = (
    "cf-browser-verification",
    "challenge-platform",
    "cdn-cgi/challenge",
    "g-recaptcha",
    "hcaptcha",
)

BOT_TITLE_PATTERNS = re.compile(
    r"just a moment|access denied|attention required|please wait",
    re.I,
)


@dataclass
class JinaArticle:
    title: str | None
    url: str | None
    content: str
    published_time: str | None = None


def is_bot_page(html: str) -> bool:
    if not html or not html.strip():
        return True

    sample = html[:8000].lower()
    if any(marker in sample for marker in BOT_MARKERS):
        return True

    soup = BeautifulSoup(html[:8000], "html.parser")
    title_tag = soup.find("title")
    if title_tag:
        title_text = title_tag.get_text(strip=True)
        if title_text and BOT_TITLE_PATTERNS.search(title_text):
            return True

    body_text = soup.get_text(strip=True)
    if len(body_text) < 200 and any(marker in sample for marker in BOT_MARKERS):
        return True

    return False


def _jina_fallback_enabled() -> bool:
    return os.getenv("JINA_FALLBACK_ENABLED", "true").lower() not in (
        "0",
        "false",
        "no",
    )


def _jina_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "X-Respond-With": "frontmatter",
        "X-Engine": "browser",
        "X-Retain-Images": "none",
    }
    api_key = os.getenv("JINA_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["X-Proxy"] = "auto"
    return headers


def _parse_jina_payload(payload: dict) -> JinaArticle:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload

    title = data.get("title")
    if isinstance(title, str):
        title = title.strip() or None

    url = data.get("url")
    if isinstance(url, str):
        url = url.strip() or None

    content = (
        data.get("content")
        or data.get("text")
        or data.get("markdown")
        or ""
    )
    if not isinstance(content, str) or not content.strip():
        raise FetchError("Jina Reader returned empty content")

    published = data.get("publishedTime") or data.get("published_time")
    if isinstance(published, str):
        published = published.strip() or None
    else:
        published = None

    return JinaArticle(
        title=title,
        url=url,
        content=content.strip(),
        published_time=published,
    )


def _markdown_to_html(md: str) -> str:
    return markdown.markdown(
        md,
        extensions=["tables", "nl2br", "sane_lists"],
    )


async def fetch_jina_article(url: str) -> JinaArticle:
    jina_url = f"{JINA_BASE_URL}{url}"
    try:
        async with httpx.AsyncClient(timeout=JINA_TIMEOUT) as client:
            response = await client.get(jina_url, headers=_jina_headers())
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise FetchError(
            f"Jina Reader returned {exc.response.status_code}"
        ) from exc
    except httpx.RequestError as exc:
        raise FetchError(f"Jina Reader request failed: {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise FetchError("Jina Reader returned invalid JSON") from exc

    if isinstance(payload, dict) and payload.get("code", 200) >= 400:
        message = payload.get("message") or payload.get("detail") or "unknown error"
        raise FetchError(f"Jina Reader error: {message}")

    return _parse_jina_payload(payload)


def jina_article_to_response(url: str, article: JinaArticle) -> dict[str, str | None]:
    body_html = sanitize_html(_markdown_to_html(article.content))
    if not body_html:
        raise FetchError("Jina Reader content could not be converted to HTML")

    title = (article.title or "").strip() or "Untitled Article"
    source = _domain_from_url(article.url or url)

    return {
        "title": title,
        "author": None,
        "source": source or None,
        "date": _format_date(article.published_time),
        "html": body_html,
    }


def should_use_jina_fallback(status_code: int | None, html: str | None = None) -> bool:
    if not _jina_fallback_enabled():
        return False
    if status_code in (403, 429):
        return True
    if html is not None and is_bot_page(html):
        return True
    return False
