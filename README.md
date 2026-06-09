# Purpose

Personal project made for Oma to have easy to read prints using her scan reader (cause she's blind)

# Article to Print

Convert any web article into a clean, text-only document you can print or save as PDF from your browser. 

## Features

- Paste an article URL and extract reader-mode-style content
- Automatic [Jina Reader](https://jina.ai/reader/) fallback when a site returns 403/429 or a bot/challenge page
- No images, ads, or alt text from removed images
- Title, author, source, and publication date at the top
- Print-optimized layout (use browser Print → Save as PDF)

## Setup

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

### Environment variables (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `JINA_API_KEY` | *(unset)* | **Recommended for production.** Higher quota, proxy routing, and bypass of Jina domain blocks (HTTP 451) that affect anonymous requests. Get one at [jina.ai/reader](https://jina.ai/reader#pricing). |
| `JINA_FALLBACK_ENABLED` | `true` | Set to `false` to disable the Jina fallback and only use direct fetching. |

**Local development** — copy `.env.example` to `.env` and paste your key:

```bash
cp .env.example .env
# edit .env and set JINA_API_KEY=...
uvicorn app.main:app --reload
```

**Render** — in the dashboard go to your service → **Environment** → add `JINA_API_KEY` with your key, then redeploy.

## Deploy on Render

This app ships the **UI and API together** (FastAPI serves `static/` and `/api/convert`). One Render Web Service is enough—no separate frontend host.

### Notes

- **Free plan:** The service sleeps after inactivity; the first request after sleep can take 30–60 seconds.
- **Root URL:** `/` is the app; `/api/convert` is the API.
- **Jina fallback:** Works without `JINA_API_KEY` on the free tier, but adding a key improves success on bot-blocked sites. Set `JINA_API_KEY` in the Render dashboard under **Environment**.
- **Custom domain:** Render dashboard → your service → **Settings** → **Custom Domains**.

## Usage

1. Enter the full URL of a web article.
2. Click **Convert**.
3. Review the preview, then click **Print** (or use Cmd/Ctrl+P) and choose Save as PDF if desired.

## API

`POST /api/convert`

```json
{ "url": "https://example.com/article" }
```

Returns `title`, `author`, `source`, `date`, and `html` (sanitized body).

## Limitations

- The server fetches URLs on your behalf. Paywalled, JavaScript-only, or bot-blocked pages may still fail even with the Jina fallback.
- Jina Reader free tier has rate limits. Without `JINA_API_KEY`, many news sites return **451** (domain blocked for anonymous use) — add a key on Render to fix this.
- Fallback conversions can take 5–30 seconds longer than direct fetches.
- Extraction quality depends on the source HTML; some sites return sparse or empty content.
- For personal/archival use; respect site terms of service and copyright.

## Security

URLs are restricted to `http`/`https` and blocked from resolving to private or loopback addresses (basic SSRF protection).
