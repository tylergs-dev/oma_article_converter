import { marked } from "marked";
import { shouldUseJinaFallback } from "./bot-detect";
import { extractArticle } from "./extract";
import { FetchError } from "./errors";
import { domainFromUrl, formatDate } from "./metadata";
import { sanitizeHtml } from "./sanitize";
import type { ConvertResult, ExtensionSettings } from "./types";

const JINA_BASE_URL = "https://r.jina.ai/";
const JINA_TIMEOUT_MS = 60_000;

interface JinaArticle {
  title: string | null;
  url: string | null;
  content: string;
  publishedTime: string | null;
}

function jinaHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Respond-With": "frontmatter",
    "X-Engine": "browser",
    "X-Retain-Images": "none",
  };
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
    headers["X-Proxy"] = "auto";
  }
  return headers;
}

function parseJinaPayload(payload: Record<string, unknown>): JinaArticle {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  const title =
    typeof data.title === "string" ? data.title.trim() || null : null;
  const url = typeof data.url === "string" ? data.url.trim() || null : null;
  const content =
    (typeof data.content === "string" && data.content) ||
    (typeof data.text === "string" && data.text) ||
    (typeof data.markdown === "string" && data.markdown) ||
    "";

  if (!content.trim()) {
    throw new FetchError("Jina Reader returned empty content");
  }

  const published =
    (typeof data.publishedTime === "string" && data.publishedTime) ||
    (typeof data.published_time === "string" && data.published_time) ||
    null;

  return {
    title,
    url,
    content: content.trim(),
    publishedTime: published?.trim() || null,
  };
}

function jinaErrorMessage(
  response: Response,
  payload: Record<string, unknown> | null,
  hasApiKey: boolean,
): string {
  const detail = String(
    payload?.readableMessage ??
      payload?.message ??
      payload?.detail ??
      `HTTP ${response.status}`,
  );
  const code = payload?.code ?? response.status;
  const httpStatus = response.status;

  const isBlocked =
    httpStatus === 451 ||
    code === 451 ||
    (typeof code === "number" && code >= 45100 && code <= 45199);

  if (isBlocked && !hasApiKey) {
    return (
      `${detail} Jina blocks some domains for anonymous requests. ` +
      "Add a Jina API key in extension Options (free at https://jina.ai/reader) to bypass."
    );
  }

  if (httpStatus === 429 || code === 429) {
    return (
      `${detail} Jina rate limit reached — wait a moment or add a Jina API key in Options for higher quota.`
    );
  }

  if (isBlocked) return detail;
  return `Jina Reader error: ${detail}`;
}

async function markdownToHtml(md: string): Promise<string> {
  return marked.parse(md, { async: true }) as Promise<string>;
}

function jinaArticleToResponse(url: string, article: JinaArticle, bodyHtml: string): ConvertResult {
  if (!bodyHtml) {
    throw new FetchError("Jina Reader content could not be converted to HTML");
  }

  return {
    title: (article.title || "").trim() || "Untitled Article",
    author: null,
    source: domainFromUrl(article.url || url) || null,
    date: formatDate(article.publishedTime),
    html: bodyHtml,
  };
}

export async function fetchJinaArticle(
  url: string,
  settings: ExtensionSettings,
): Promise<ConvertResult> {
  const hasApiKey = Boolean(settings.jinaApiKey.trim());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${JINA_BASE_URL}${url}`, {
      headers: jinaHeaders(settings.jinaApiKey),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new FetchError(
      `Jina Reader request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    if (!response.ok) {
      throw new FetchError(`Jina Reader returned HTTP ${response.status}`);
    }
    throw new FetchError("Jina Reader returned invalid JSON");
  }

  if (!response.ok || (typeof payload.code === "number" && payload.code >= 400)) {
    throw new FetchError(jinaErrorMessage(response, payload, hasApiKey));
  }

  const article = parseJinaPayload(payload);
  const bodyHtml = sanitizeHtml(await markdownToHtml(article.content));
  return jinaArticleToResponse(url, article, bodyHtml);
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchDirectHtml(url: string): Promise<{ html: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      redirect: "follow",
    });

    const html = await response.text();
    if (!response.ok) {
      throw new FetchError(
        `Server returned ${response.status}`,
        response.status,
        html.slice(0, 8000),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      if (!html.toLowerCase().includes("<html")) {
        throw new FetchError("Response is not HTML");
      }
    }

    return { html, status: response.status };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}

export async function convertWithFetchAndJina(
  url: string,
  settings: ExtensionSettings,
): Promise<ConvertResult> {
  try {
    const { html } = await fetchDirectHtml(url);
    if (shouldUseJinaFallback(settings.jinaFallbackEnabled, null, html)) {
      return fetchJinaArticle(url, settings);
    }
    return extractArticle(url, html);
  } catch (err) {
    if (
      err instanceof FetchError &&
      shouldUseJinaFallback(settings.jinaFallbackEnabled, err.statusCode, err.body)
    ) {
      return fetchJinaArticle(url, settings);
    }
    throw err;
  }
}
