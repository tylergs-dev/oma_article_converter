import { describe, expect, it } from "vitest";
import { isBotPage, shouldUseJinaFallback } from "./bot-detect";

describe("bot-detect", () => {
  it("detects cloudflare challenge pages", () => {
    const html =
      "<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>";
    expect(isBotPage(html)).toBe(true);
  });

  it("allows normal article html", () => {
    const html =
      "<html><head><title>Sample Article</title></head><body><article><p>" +
      "Lorem ipsum ".repeat(50) +
      "</p></article></body></html>";
    expect(isBotPage(html)).toBe(false);
  });

  it("respects fallback toggle and status codes", () => {
    expect(shouldUseJinaFallback(true, 403)).toBe(true);
    expect(shouldUseJinaFallback(false, 403)).toBe(false);
    expect(shouldUseJinaFallback(true, 200, "<title>Just a moment</title>")).toBe(true);
  });
});
