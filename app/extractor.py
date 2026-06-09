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

BLOCK_TAGS = ("h2", "h3", "h4", "p", "ul", "ol", "blockquote", "table")

ARTICLE_CONTAINER_SELECTORS = (
    ".article__body",
    '[itemprop="articleBody"]',
    ".article-body",
    ".entry-content",
    ".post-content",
    "article",
)

JUNK_CLASS_PATTERN = re.compile(
    r"newsletter|subscribe|signup|advert|promo|social-?share|share-?bar|"
    r"related-?content|disclaimer|article-topics|wcp-item",
    re.I,
)

_BOILERPLATE_PARAGRAPH_PATTERNS = tuple(
    re.compile(pat, re.I)
    for pat in (
        r"^you are now subscribed\.?$",
        r"newsletter sign-up was successful",
        r"^want to add more newsletters\??$",
        r"an account already exists for this email",
        r"profit and prosper with the best of (kiplinger|expert advice)",
        r"enter your email in the box",
        r"click sign me up",
        r"^sign up\.?$",
        r"become a smarter, better informed investor",
        r"subscribe from just",
        r"click for free issue",
        r"^from just\s+\$",
        r"sign up for kiplinger",
        r"contact me with news and offers",
        r"by submitting your information you agree",
        r"^copy link$",
        r"^join the conversation$",
        r"^share this article$",
        r"^print$",
        r"^facebook$",
        r"^x$",
        r"^about adviser intel$",
        r"participant in\s*kiplinger'?s adviser intel",
        r"looking for expert tips to grow and preserve your wealth",
        r"this article was written by and presents the views of our contributing adviser",
        r"you can check adviser records with the",
    )
)

_PROMO_HEADING_PATTERNS = tuple(
    re.compile(pat, re.I)
    for pat in (
        r"sign up for kiplinger",
        r"for kiplinger personal finance",
        r"subscribe from just",
        r"^related content$",
        r"^about adviser intel$",
        r"^topics$",
        r"^disclaimer$",
    )
)


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


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _is_boilerplate_paragraph(text: str) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return True
    return any(pat.search(normalized) for pat in _BOILERPLATE_PARAGRAPH_PATTERNS)


def _is_promo_heading(text: str) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return True
    return any(pat.search(normalized) for pat in _PROMO_HEADING_PATTERNS)


def _find_article_container(soup: BeautifulSoup):
    for selector in ARTICLE_CONTAINER_SELECTORS:
        for element in soup.select(selector):
            if len(element.get_text(strip=True)) >= 400:
                return element
    return None


def _prune_article_container(container) -> None:
    for tag_name in REMOVE_TAGS:
        for tag in container.find_all(tag_name):
            tag.decompose()

    for tag in container.find_all(True):
        if not tag.attrs:
            continue
        class_str = " ".join(tag.get("class", []) or [])
        tag_id = tag.get("id", "") or ""
        if JUNK_CLASS_PATTERN.search(f"{class_str} {tag_id}"):
            tag.decompose()

    for heading in list(container.find_all(["h2", "h3", "h4"])):
        if _is_promo_heading(heading.get_text()):
            heading.decompose()

    for heading in container.find_all("h3"):
        if _normalize_text(heading.get_text()).lower() == "related content":
            sibling = heading.find_next_sibling()
            if sibling and sibling.name in ("ul", "ol"):
                sibling.decompose()
            heading.decompose()


def _extract_from_container(container) -> str | None:
    work = BeautifulSoup(str(container), "html.parser")
    root = work.find(True)
    if not root:
        return None

    _prune_article_container(root)

    blocks: list[str] = []
    for tag in root.find_all(BLOCK_TAGS):
        if tag.find_parent(BLOCK_TAGS):
            continue

        if tag.name in ("h2", "h3", "h4"):
            text = tag.get_text(" ", strip=True)
            if _is_promo_heading(text):
                continue
            blocks.append(f"<{tag.name}>{text}</{tag.name}>")
            continue

        if tag.name == "p":
            text = tag.get_text(" ", strip=True)
            if _is_boilerplate_paragraph(text):
                continue
            if _normalize_text(text).lower() == "about adviser intel":
                continue
            blocks.append(f"<p>{text}</p>")
            continue

        if tag.name in ("ul", "ol"):
            link_text = " ".join(
                _normalize_text(a.get_text()) for a in tag.find_all("a")
            ).lower()
            if link_text in {"facebook x", "facebook", "x"} or (
                len(tag.find_all("li")) <= 3 and "facebook" in link_text
            ):
                continue

        if tag.name in ("ul", "ol", "blockquote", "table"):
            inner = BeautifulSoup(str(tag), "html.parser")
            _strip_unwanted(inner)
            fragment = inner.find(tag.name)
            if fragment and fragment.get_text(strip=True):
                blocks.append(str(fragment))

    if not blocks:
        return None

    return "\n".join(blocks)


def _remove_boilerplate_paragraphs(soup: BeautifulSoup) -> None:
    for paragraph in list(soup.find_all("p")):
        if _is_boilerplate_paragraph(paragraph.get_text()):
            paragraph.decompose()


def _restore_headings_from_source(body_soup: BeautifulSoup, source) -> None:
    if not source:
        return

    heading_texts: list[tuple[str, str]] = []
    for level in ("h2", "h3", "h4"):
        for heading in source.find_all(level):
            text = _normalize_text(heading.get_text())
            if text and not _is_promo_heading(text):
                heading_texts.append((level, text))

    for level, text in heading_texts:
        for paragraph in body_soup.find_all("p"):
            if _normalize_text(paragraph.get_text()) == text:
                paragraph.name = level
                break


def _trim_leading_noise(soup: BeautifulSoup, title: str | None) -> None:
    title_norm = _normalize_text(title or "")
    for paragraph in list(soup.find_all("p")):
        text = _normalize_text(paragraph.get_text())
        if _is_boilerplate_paragraph(text):
            paragraph.decompose()
            continue
        if title_norm and text == title_norm:
            paragraph.decompose()
            continue
        break


def _extract_body_html(html: str, url: str) -> str | None:
    page = BeautifulSoup(html, "html.parser")
    container = _find_article_container(page)

    if container:
        direct = _extract_from_container(container)
        if direct and len(
            _normalize_text(BeautifulSoup(direct, "html.parser").get_text(" "))
        ) >= 400:
            return direct

    extract_html = str(container) if container else html
    content = trafilatura.extract(
        extract_html,
        url=url,
        include_comments=False,
        include_tables=True,
        include_images=False,
        include_links=False,
        output_format="html",
    )
    if not content:
        return None

    soup = BeautifulSoup(content, "html.parser")
    _remove_boilerplate_paragraphs(soup)
    _restore_headings_from_source(soup, container)
    return str(soup) if soup.get_text(strip=True) else None


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
    fallbacks = _fallback_metadata(html, url)

    title = (metadata.title if metadata else None) or fallbacks["title"]
    author = (metadata.author if metadata else None) or fallbacks["author"]
    source = (metadata.sitename if metadata else None) or fallbacks["source"]
    date_raw = None
    if metadata and metadata.date:
        date_raw = metadata.date
    if not date_raw:
        date_raw = fallbacks["date"]

    raw_body = _extract_body_html(html, url)
    body_soup = BeautifulSoup(raw_body or "", "html.parser")
    _trim_leading_noise(body_soup, title)
    body_html = sanitize_html(str(body_soup) if body_soup.get_text(strip=True) else "")
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
