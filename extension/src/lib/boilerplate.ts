import patterns from "../../../shared/boilerplate-patterns.json";

const paragraphPatterns = patterns.paragraphPatterns.map(
  (pat) => new RegExp(pat, "i"),
);
const promoHeadingPatterns = patterns.promoHeadingPatterns.map(
  (pat) => new RegExp(pat, "i"),
);

export function normalizeText(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function isBoilerplateParagraph(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  return paragraphPatterns.some((pat) => pat.test(normalized));
}

export function isPromoHeading(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  return promoHeadingPatterns.some((pat) => pat.test(normalized));
}
