import { parseHTML } from "linkedom";
import type { Document } from "linkedom";

function metaContent(
  document: Document,
  ...selectors: [string, string][]
): string | null {
  for (const [attr, value] of selectors) {
    const tag = document.querySelector(`meta[${attr}="${value}"]`);
    const content = tag?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return null;
}

function jsonLdAuthor(data: Record<string, unknown>): string | null {
  const author = data.author;
  if (typeof author === "string") return author;
  if (author && typeof author === "object" && !Array.isArray(author)) {
    const name = (author as Record<string, unknown>).name;
    return typeof name === "string" ? name : null;
  }
  if (Array.isArray(author) && author.length) {
    const first = author[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const name = (first as Record<string, unknown>).name;
      return typeof name === "string" ? name : null;
    }
  }
  return null;
}

function jsonLdDate(data: Record<string, unknown>): string | null {
  for (const key of ["datePublished", "dateCreated", "dateModified"]) {
    const val = data[key];
    if (val) return String(val);
  }
  return null;
}

export function domainFromUrl(url: string): string {
  try {
    let host = new URL(url).hostname;
    if (host.startsWith("www.")) host = host.slice(4);
    return host;
  } catch {
    return "";
  }
}

export function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();

  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return cleaned;
}

export interface FallbackMetadata {
  title: string | null;
  author: string | null;
  source: string | null;
  date: string | null;
}

export function fallbackMetadata(html: string, url: string): FallbackMetadata {
  const { document } = parseHTML(html);

  let title =
    metaContent(
      document,
      ["property", "og:title"],
      ["name", "twitter:title"],
    ) ?? null;

  if (!title) {
    title = document.querySelector("title")?.textContent?.trim() ?? null;
  }

  let author =
    metaContent(
      document,
      ["name", "author"],
      ["property", "article:author"],
      ["name", "dc.creator"],
    ) ?? null;

  let source =
    metaContent(
      document,
      ["property", "og:site_name"],
      ["name", "application-name"],
    ) ?? null;

  if (!source) source = domainFromUrl(url) || null;

  let dateVal =
    metaContent(
      document,
      ["property", "article:published_time"],
      ["name", "pubdate"],
      ["name", "date"],
      ["property", "og:article:published_time"],
    ) ?? null;

  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const payload = JSON.parse(script.textContent || "");
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const type = record["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (
          !types.some((t) =>
            ["Article", "NewsArticle", "BlogPosting", "WebPage"].includes(String(t)),
          )
        ) {
          continue;
        }
        if (!author) author = jsonLdAuthor(record);
        if (!dateVal) dateVal = jsonLdDate(record);
        if (!title && typeof record.headline === "string") {
          title = record.headline;
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });

  return { title, author, source, date: dateVal };
}
