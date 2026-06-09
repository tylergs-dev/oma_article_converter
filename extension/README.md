# Article to Print — Browser Extension

Edge/Chromium extension that converts articles into clean, printable text. This is the recommended daily driver; the Python web app in the repo root remains available as a no-install fallback.

## Features

- Convert the **current tab** (primary) or a pasted URL
- Strips images, ads, and common newsletter/social boilerplate
- Jina Reader fallback for bot-blocked sites (optional API key in Options)
- Opens a full preview tab for Print / Save as PDF

## Development

```bash
cd extension
npm install
npm run icons
npm run dev
```

Load unpacked in Edge: `edge://extensions` → Developer mode → **Load unpacked** → select `extension/dist` after `npm run dev` (or `dist` from `npm run build`).

## Build & package

```bash
npm run build
npm run zip   # creates article-to-print-extension.zip for store upload
```

## Options

| Setting | Purpose |
|---------|---------|
| Jina API key | Higher quota; bypass domain blocks on Jina free tier |
| Jina fallback | Enable/disable `r.jina.ai` when fetch/extraction fails |

## Tests

```bash
npm test
```

## Store submission

1. Run `npm run zip`
2. Upload `article-to-print-extension.zip` in [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
3. Link `privacy-policy.md` (host on GitHub or your site) in the listing

## Architecture

- `src/background/service-worker.ts` — conversion orchestration
- `src/lib/extract.ts` — Readability + ported filters from `app/extractor.py`
- `src/lib/jina.ts` — Jina Reader client
- `shared/boilerplate-patterns.json` — shared regex lists with the Python app
