import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("removes images and scripts", () => {
    const html = '<p>Hello</p><img src="x.jpg" alt="x" /><script>alert(1)</script>';
    const result = sanitizeHtml(html);
    expect(result).toContain("<p>Hello</p>");
    expect(result).not.toContain("img");
    expect(result).not.toContain("script");
  });

  it("keeps allowed structural tags", () => {
    const html = "<h2>Title</h2><ul><li>One</li></ul>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<h2>Title</h2>");
    expect(result).toContain("<ul>");
  });
});
