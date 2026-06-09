import { describe, expect, it } from "vitest";
import { fallbackMetadata, formatDate } from "./metadata";

describe("metadata", () => {
  it("reads open graph metadata", () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Test Title" />
      <meta property="og:site_name" content="Example News" />
      <meta property="article:published_time" content="2024-03-15" />
      <meta name="author" content="Jane Doe" />
    </head><body></body></html>`;

    const meta = fallbackMetadata(html, "https://www.example.com/story");
    expect(meta.title).toBe("Test Title");
    expect(meta.author).toBe("Jane Doe");
    expect(meta.source).toBe("Example News");
    expect(meta.date).toBe("2024-03-15");
  });

  it("formats iso dates", () => {
    expect(formatDate("2024-03-15")).toBe("March 15, 2024");
  });
});
