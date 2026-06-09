const BOT_MARKERS = [
  "cf-browser-verification",
  "challenge-platform",
  "cdn-cgi/challenge",
  "g-recaptcha",
  "hcaptcha",
];

const BOT_TITLE_PATTERN =
  /just a moment|access denied|attention required|please wait/i;

export function isBotPage(html: string): boolean {
  if (!html?.trim()) return true;

  const sample = html.slice(0, 8000).toLowerCase();
  if (BOT_MARKERS.some((marker) => sample.includes(marker))) {
    return true;
  }

  const titleMatch = html.slice(0, 8000).match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch?.[1] && BOT_TITLE_PATTERN.test(titleMatch[1])) {
    return true;
  }

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (bodyText.length < 200 && BOT_MARKERS.some((m) => sample.includes(m))) {
    return true;
  }

  return false;
}

export function shouldUseJinaFallback(
  fallbackEnabled: boolean,
  statusCode: number | null,
  html?: string | null,
): boolean {
  if (!fallbackEnabled) return false;
  if (statusCode === 403 || statusCode === 429) return true;
  if (html != null && isBotPage(html)) return true;
  return false;
}
