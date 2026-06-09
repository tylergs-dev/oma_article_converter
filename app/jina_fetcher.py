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


def _has_jina_api_key() -> bool:
    return bool(os.getenv("JINA_API_KEY", "").strip())


def _jina_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"Jina Reader returned HTTP {response.status_code}"

    if not isinstance(payload, dict):
        return f"Jina Reader returned HTTP {response.status_code}"

    detail = (
        payload.get("readableMessage")
        or payload.get("message")
        or payload.get("detail")
        or f"HTTP {response.status_code}"
    )
    code = payload.get("code", response.status_code)
    http_status = response.status_code

    is_blocked = (
        http_status == 451
        or code == 451
        or (isinstance(code, int) and 45100 <= code <= 45199)
    )
    if is_blocked and not _has_jina_api_key():
        return (
            f"{detail} "
            "Jina blocks some domains for anonymous requests. "
            "Set JINA_API_KEY (free at https://jina.ai/reader) and redeploy to bypass."
        )

    if http_status == 429 or code == 429:
        return (
            f"{detail} "
            "Jina rate limit reached — wait a moment or set JINA_API_KEY for higher quota."
        )

    if is_blocked:
        return str(detail)

    return f"Jina Reader error: {detail}"


def _raise_jina_api_error(response: httpx.Response) -> None:
    raise FetchError(_jina_error_message(response))


async def fetch_jina_article(url: str) -> JinaArticle:
    jina_url = f"{JINA_BASE_URL}{url}"
    try:
        async with httpx.AsyncClient(timeout=JINA_TIMEOUT) as client:
            response = await client.get(jina_url, headers=_jina_headers())
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        _raise_jina_api_error(exc.response)
    except httpx.RequestError as exc:
        raise FetchError(f"Jina Reader request failed: {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise FetchError("Jina Reader returned invalid JSON") from exc

    if isinstance(payload, dict) and payload.get("code", 200) >= 400:
        _raise_jina_api_error(response)

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
