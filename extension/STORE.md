# Edge Add-ons Store Checklist

## Package

```bash
npm run zip
```

Upload `article-to-print-extension.zip` from this directory.

## Listing copy (starter)

**Short description:** Convert articles into clean, printable text for screen readers and PDF.

**Long description:** Article to Print removes ads, images, and newsletter clutter from web articles. Open any article, click the extension, and get a print-friendly preview with title, author, source, and date. Designed for accessibility and simple Save as PDF workflows.

## Required assets

- Icons: `public/icons/icon128.png` (included in package)
- Screenshots: capture popup, preview tab, and print dialog from Edge
- Privacy policy URL: host `privacy-policy.md` on GitHub or your site and paste the public URL

## Review notes

- Single purpose: article cleanup for printing
- `activeTab` + `scripting` used only when user clicks Convert
- Optional host permissions requested only for pasted URLs on other sites
- `r.jina.ai` used only when Jina fallback is enabled and local extraction/fetch fails
- No remote code; no analytics

## Sideload QA (before submit)

1. `edge://extensions` → Developer mode → Load unpacked → `extension/dist`
2. Open a news article → extension → Convert → verify preview tab
3. Print → Save as PDF
4. Options → save Jina API key → retry a bot-blocked site
5. Paste a URL while on `edge://extensions` → approve host permission prompt
