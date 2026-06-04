import ipaddress
import json
import re
import socket
from datetime import datetime
from urllib.parse import urlparse

import httpx
import trafilatura
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

FETCH_TIMEOUT = 15.0
MAX_REDIRECTS = 5

REMOVE_TAGS = {
    "img",
    "picture",
    "svg",
    "video",
    "iframe",
    "aside",
    "nav",
    "script",
    "style",
    "form",
    "button",
    "input",
    "noscript",
    "figure",
    "figcaption",
    "object",
    "embed",
    "canvas",
    "audio",
    "source",
    "track",
}

ALLOWED_TAGS = {
    "p",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "strong",
    "b",
    "em",
    "i",
    "a",
    "br",
    "div",
    "span",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}


class ExtractError(Exception):
    pass


class FetchError(Exception):
    pass


class InvalidUrlError(Exception):
    pass


def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise InvalidUrlError("URL must use http or https")
    if not parsed.hostname:
        raise InvalidUrlError("URL must include a hostname")

    hostname = parsed.hostname.lower()
    blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
    if hostname in blocked_hosts or hostname.endswith(".local"):
        raise InvalidUrlError("URL hostname is not allowed")

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise InvalidUrlError("Could not resolve hostname") from exc

    for info in addr_infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        ):
            raise InvalidUrlError("URL resolves to a private or reserved address")

    return url


async def fetch_html(url: str) -> str:
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    try:
        async with httpx.AsyncClient(
            timeout=FETCH_TIMEOUT,
            follow_redirects=True,
            max_redirects=MAX_REDIRECTS,
        ) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise FetchError(f"Server returned {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise FetchError(str(exc)) from exc

    content_type = response.headers.get("content-type", "")
    if "html" not in content_type and "text" not in content_type:
        if response.text and "<html" in response.text[:2000].lower():
            pass
        else:
            raise FetchError("Response is not HTML")

    return response.text


def _strip_unwanted(soup: BeautifulSoup) -> None:
    for tag_name in REMOVE_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    for tag in soup.find_all(True):
        if tag.name not in ALLOWED_TAGS:
            tag.unwrap()
        else:
            attrs = dict(tag.attrs)
            for attr in attrs:
                del tag[attr]
            if tag.name == "a":
                href = attrs.get("href", "")
                if href:
                    tag["href"] = href


def sanitize_html(html: str) -> str:
    if not html or not html.strip():
        return ""

    soup = BeautifulSoup(html, "html.parser")
    _strip_unwanted(soup)

    text = soup.get_text(strip=True)
    if not text:
        return ""

    return str(soup)


def _format_date(date_str: str | None) -> str | None:
    if not date_str:
        return None
    cleaned = date_str.strip()
    for fmt in (
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
    ):
        try:
            dt = datetime.strptime(cleaned[: len(fmt.replace("%z", ""))], fmt.replace("%z", ""))
            return dt.strftime("%B %d, %Y")
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        return dt.strftime("%B %d, %Y")
    except ValueError:
        pass
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})", cleaned)
    if match:
        y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
        return datetime(y, m, d).strftime("%B %d, %Y")
    return cleaned


def _domain_from_url(url: str) -> str:
    host = urlparse(url).hostname or ""
    if host.startswith("www."):
        host = host[4:]
    return host


def _meta_content(soup: BeautifulSoup, *selectors: tuple[str, str]) -> str | None:
    for attr, value in selectors:
        tag = soup.find("meta", attrs={attr: value})
        if tag and tag.get("content"):
            return tag["content"].strip()
    return None


def _json_ld_author(data: dict) -> str | None:
    author = data.get("author")
    if isinstance(author, str):
        return author
    if isinstance(author, dict):
        return author.get("name")
    if isinstance(author, list) and author:
        first = author[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            return first.get("name")
    return None


def _json_ld_date(data: dict) -> str | None:
    for key in ("datePublished", "dateCreated", "dateModified"):
        if data.get(key):
            return str(data[key])
    return None


def _fallback_metadata(html: str, url: str) -> dict[str, str | None]:
    soup = BeautifulSoup(html, "html.parser")
    title = _meta_content(
        soup,
        ("property", "og:title"),
        ("name", "twitter:title"),
    )
    if not title:
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else None

    author = _meta_content(
        soup,
        ("name", "author"),
        ("property", "article:author"),
        ("name", "dc.creator"),
    )

    source = _meta_content(
        soup,
        ("property", "og:site_name"),
        ("name", "application-name"),
    )
    if not source:
        source = _domain_from_url(url)

    date_val = _meta_content(
        soup,
        ("property", "article:published_time"),
        ("name", "pubdate"),
        ("name", "date"),
        ("property", "og:article:published_time"),
    )

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            payload = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = payload if isinstance(payload, list) else [payload]
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("@type") in ("Article", "NewsArticle", "BlogPosting", "WebPage"):
                if not author:
                    author = _json_ld_author(item)
                if not date_val:
                    date_val = _json_ld_date(item)
                if not title and item.get("headline"):
                    title = item["headline"]

    return {
        "title": title,
        "author": author,
        "source": source,
        "date": date_val,
    }


def extract_article(url: str, html: str) -> dict[str, str | None]:
    metadata = trafilatura.extract_metadata(html, default_url=url)
    content = trafilatura.extract(
        html,
        url=url,
        include_comments=False,
        include_tables=True,
        include_images=False,
        include_links=False,
        output_format="html",
    )

    fallbacks = _fallback_metadata(html, url)

    title = (metadata.title if metadata else None) or fallbacks["title"]
    author = (metadata.author if metadata else None) or fallbacks["author"]
    source = (metadata.sitename if metadata else None) or fallbacks["source"]
    date_raw = None
    if metadata and metadata.date:
        date_raw = metadata.date
    if not date_raw:
        date_raw = fallbacks["date"]

    body_html = sanitize_html(content or "")
    if not body_html:
        raise ExtractError("Could not extract article content")

    if not title:
        title = "Untitled Article"

    return {
        "title": title.strip(),
        "author": author.strip() if author else None,
        "source": source.strip() if source else None,
        "date": _format_date(date_raw),
        "html": body_html,
    }


async def convert_url(url: str) -> dict[str, str | None]:
    safe_url = validate_url(str(url))
    html = await fetch_html(safe_url)
    return extract_article(safe_url, html)
