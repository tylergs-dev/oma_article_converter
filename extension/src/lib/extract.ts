import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import {
  isBoilerplateParagraph,
  isPromoHeading,
  normalizeText,
} from "./boilerplate";
import { ExtractError } from "./errors";
import {
  domainFromUrl,
  fallbackMetadata,
  formatDate,
} from "./metadata";
import {
  ARTICLE_CONTAINER_SELECTORS,
  BLOCK_TAGS,
  JUNK_CLASS_PATTERN,
  sanitizeHtml,
} from "./sanitize";
import type { ConvertResult } from "./types";

function findArticleContainer(document: Document): Element | null {
  for (const selector of ARTICLE_CONTAINER_SELECTORS) {
    for (const element of document.querySelectorAll(selector)) {
      if ((element.textContent?.trim().length ?? 0) >= 400) {
        return element;
      }
    }
  }
  return null;
}

function pruneArticleContainer(container: Element): void {
  const removeTags = [
    "img", "picture", "svg", "video", "iframe", "aside", "nav",
    "script", "style", "form", "button", "input", "noscript",
    "figure", "figcaption", "object", "embed", "canvas", "audio", "source", "track",
  ];
  for (const tagName of removeTags) {
    container.querySelectorAll(tagName).forEach((el) => el.remove());
  }

  container.querySelectorAll("*").forEach((tag) => {
    const classStr = tag.getAttribute("class") ?? "";
    const tagId = tag.getAttribute("id") ?? "";
    if (JUNK_CLASS_PATTERN.test(`${classStr} ${tagId}`)) {
      tag.remove();
    }
  });

  container.querySelectorAll("h2, h3, h4").forEach((heading) => {
    if (isPromoHeading(heading.textContent ?? "")) {
      heading.remove();
    }
  });

  container.querySelectorAll("h3").forEach((heading) => {
    if (normalizeText(heading.textContent ?? "").toLowerCase() === "related content") {
      const sibling = heading.nextElementSibling;
      if (sibling && (sibling.tagName === "UL" || sibling.tagName === "OL")) {
        sibling.remove();
      }
      heading.remove();
    }
  });
}

function extractFromContainer(container: Element): string | null {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${container.outerHTML}</body></html>`);
  const root = document.body.firstElementChild;
  if (!root) return null;

  pruneArticleContainer(root);

  const blocks: string[] = [];
  for (const tagName of BLOCK_TAGS) {
    root.querySelectorAll(tagName).forEach((tag) => {
      let parent: Element | null = tag.parentElement;
      while (parent && parent !== root) {
        if (BLOCK_TAGS.includes(parent.tagName.toLowerCase() as (typeof BLOCK_TAGS)[number])) {
          return;
        }
        parent = parent.parentElement;
      }

      if (["h2", "h3", "h4"].includes(tag.tagName.toLowerCase())) {
        const text = normalizeText(tag.textContent ?? "");
        if (isPromoHeading(text)) return;
        blocks.push(`<${tag.tagName.toLowerCase()}>${text}</${tag.tagName.toLowerCase()}>`);
        return;
      }

      if (tag.tagName.toLowerCase() === "p") {
        const text = normalizeText(tag.textContent ?? "");
        if (isBoilerplateParagraph(text)) return;
        if (text.toLowerCase() === "about adviser intel") return;
        blocks.push(`<p>${text}</p>`);
        return;
      }

      if (tag.tagName === "UL" || tag.tagName === "OL") {
        const linkText = [...tag.querySelectorAll("a")]
          .map((a) => normalizeText(a.textContent ?? ""))
          .join(" ")
          .toLowerCase();
        if (
          linkText === "facebook x" ||
          linkText === "facebook" ||
          linkText === "x" ||
          (tag.querySelectorAll("li").length <= 3 && linkText.includes("facebook"))
        ) {
          return;
        }
      }

      if (["ul", "ol", "blockquote", "table"].includes(tag.tagName.toLowerCase())) {
        const clone = tag.cloneNode(true) as Element;
        pruneArticleContainer(clone);
        if (clone.textContent?.trim()) {
          blocks.push(clone.outerHTML);
        }
      }
    });
  }

  if (!blocks.length) return null;
  return blocks.join("\n");
}

function removeBoilerplateParagraphs(root: Element): void {
  root.querySelectorAll("p").forEach((p) => {
    if (isBoilerplateParagraph(p.textContent ?? "")) {
      p.remove();
    }
  });
}

function restoreHeadingsFromSource(bodyRoot: Element, source: Element | null): void {
  if (!source) return;

  const headingTexts: [string, string][] = [];
  for (const level of ["h2", "h3", "h4"]) {
    source.querySelectorAll(level).forEach((heading) => {
      const text = normalizeText(heading.textContent ?? "");
      if (text && !isPromoHeading(text)) {
        headingTexts.push([level, text]);
      }
    });
  }

  for (const [level, text] of headingTexts) {
    bodyRoot.querySelectorAll("p").forEach((p) => {
      if (normalizeText(p.textContent ?? "") === text) {
        const replacement = p.ownerDocument.createElement(level);
        replacement.textContent = text;
        p.replaceWith(replacement);
      }
    });
  }
}

function trimLeadingNoise(root: Element, title: string | null): void {
  const titleNorm = normalizeText(title ?? "");
  for (const p of [...root.querySelectorAll("p")]) {
    const text = normalizeText(p.textContent ?? "");
    if (isBoilerplateParagraph(text)) {
      p.remove();
      continue;
    }
    if (titleNorm && text === titleNorm) {
      p.remove();
      continue;
    }
    break;
  }
}

function extractBodyHtml(html: string, url: string): string | null {
  const { document } = parseHTML(html);
  const container = findArticleContainer(document);

  if (container) {
    const direct = extractFromContainer(container);
    if (direct) {
      const { document: d2 } = parseHTML(`<!DOCTYPE html><html><body>${direct}</body></html>`);
      if (normalizeText(d2.body.textContent ?? "").length >= 400) {
        return direct;
      }
    }
  }

  const reader = new Readability(document, { charThreshold: 100 });
  const article = reader.parse();
  if (article?.content) {
    const { document: bodyDoc } = parseHTML(
      `<!DOCTYPE html><html><body>${article.content}</body></html>`,
    );
    removeBoilerplateParagraphs(bodyDoc.body);
    restoreHeadingsFromSource(bodyDoc.body, container);
    if (bodyDoc.body.textContent?.trim()) {
      return bodyDoc.body.innerHTML;
    }
  }

  if (container) {
    const fallback = extractFromContainer(container);
    if (fallback) return fallback;
  }

  void url;
  return null;
}

export function extractArticle(url: string, html: string): ConvertResult {
  const fallbacks = fallbackMetadata(html, url);
  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const parsed = reader.parse();

  let title = parsed?.title || fallbacks.title;
  let author = fallbacks.author;
  let source = fallbacks.source || domainFromUrl(url) || null;
  let dateRaw = fallbacks.date;

  const rawBody = extractBodyHtml(html, url);
  const { document: bodyDoc } = parseHTML(
    `<!DOCTYPE html><html><body>${rawBody ?? ""}</body></html>`,
  );
  trimLeadingNoise(bodyDoc.body, title);
  const bodyHtml = sanitizeHtml(
    bodyDoc.body.textContent?.trim() ? bodyDoc.body.innerHTML : "",
  );

  if (!bodyHtml) {
    throw new ExtractError("Could not extract article content");
  }

  if (!title) title = "Untitled Article";

  return {
    title: title.trim(),
    author: author?.trim() || null,
    source: source?.trim() || null,
    date: formatDate(dateRaw),
    html: bodyHtml,
  };
}

export function isWeakExtraction(result: ConvertResult): boolean {
  const text = result.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length < 400;
}
