import { describe, expect, it } from "vitest";
import { isBoilerplateParagraph, isPromoHeading } from "./boilerplate";

describe("boilerplate", () => {
  it("flags newsletter signup paragraphs", () => {
    expect(isBoilerplateParagraph("You are now subscribed.")).toBe(true);
    expect(isBoilerplateParagraph("Sign up for Kiplinger")).toBe(true);
  });

  it("allows normal article text", () => {
    expect(
      isBoilerplateParagraph(
        "Retirement planning requires balancing growth and stability over decades.",
      ),
    ).toBe(false);
  });

  it("flags promo headings", () => {
    expect(isPromoHeading("Related Content")).toBe(true);
    expect(isPromoHeading("Disclaimer")).toBe(true);
    expect(isPromoHeading("Market outlook")).toBe(false);
  });
});
