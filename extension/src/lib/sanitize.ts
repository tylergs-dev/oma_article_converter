import DOMPurify from "dompurify";
import { parseHTML } from "linkedom";

const REMOVE_TAGS = new Set([
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
]);

const ALLOWED_TAGS = [
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
];

export const JUNK_CLASS_PATTERN =
  /newsletter|subscribe|signup|advert|promo|social-?share|share-?bar|related-?content|disclaimer|article-topics|wcp-item/i;

export const ARTICLE_CONTAINER_SELECTORS = [
  ".article__body",
  '[itemprop="articleBody"]',
  ".article-body",
  ".entry-content",
  ".post-content",
  "article",
];

export const BLOCK_TAGS = [
  "h2",
  "h3",
  "h4",
  "p",
  "ul",
  "ol",
  "blockquote",
  "table",
] as const;

function getPurify() {
  const { window } = parseHTML("<!DOCTYPE html><html><body></body></html>");
  return DOMPurify(window);
}

function stripUnwanted(root: Element): void {
  for (const tagName of REMOVE_TAGS) {
    root.querySelectorAll(tagName).forEach((el) => el.remove());
  }

  root.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      el.remove();
      return;
    }
    const href = el.getAttribute("href");
    for (const attr of [...el.attributes]) {
      el.removeAttribute(attr.name);
    }
    if (tag === "a" && href) {
      el.setAttribute("href", href);
    }
  });
}

export function sanitizeHtml(html: string): string {
  if (!html?.trim()) return "";

  const purify = getPurify();
  const cleaned = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href"],
  });

  const { document } = parseHTML(`<!DOCTYPE html><html><body>${cleaned}</body></html>`);
  const body = document.body;
  stripUnwanted(body);

  const text = body.textContent?.trim() ?? "";
  if (!text) return "";

  return body.innerHTML;
}
