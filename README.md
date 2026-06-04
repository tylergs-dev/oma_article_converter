# Purpose

Personal project made for Oma to have easy to read prints using her scan reader (cause she's blind)

# Article to Print

Convert any web article into a clean, text-only document you can print or save as PDF from your browser. 

## Features

- Paste an article URL and extract reader-mode-style content
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

## Deploy on Render

This app ships the **UI and API together** (FastAPI serves `static/` and `/api/convert`). One Render Web Service is enough—no separate frontend host.

### Prerequisites

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. Create an account at [render.com](https://render.com).

### Option A — Blueprint (fastest)

1. In Render: **New** → **Blueprint**.
2. Connect the repo and select `oma_article_converter`.
3. Render reads [`render.yaml`](render.yaml) and creates a web service named `article-to-print`.
4. Click **Apply** and wait for the first deploy to finish.
5. Open the service URL (e.g. `https://article-to-print.onrender.com`).

### Option B — Manual Web Service

1. **New** → **Web Service** → connect your repo.
2. Settings:

   | Field | Value |
   |-------|--------|
   | **Runtime** | Python 3 |
   | **Build Command** | `pip install -r requirements.txt` |
   | **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | **Health Check Path** | `/` (optional) |

3. **Create Web Service** and wait for deploy.
4. Use the `.onrender.com` URL Render assigns.

### Notes

- **Free plan:** The service sleeps after inactivity; the first request after sleep can take 30–60 seconds.
- **Root URL:** `/` is the app; `/api/convert` is the API. No extra env vars are required for a default deploy.
- **Custom domain:** Render dashboard → your service → **Settings** → **Custom Domains**.

### Verify after deploy

1. Open your Render URL in a browser.
2. Paste an article URL and click **Convert**.
3. If conversion works locally but fails on Render, the target site may be blocking Render’s datacenter IPs (same as any cloud host).

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

- The server fetches URLs on your behalf. Paywalled, JavaScript-only, or bot-blocked pages may fail.
- Extraction quality depends on the source HTML; some sites return sparse or empty content.
- For personal/archival use; respect site terms of service and copyright.

## Security

URLs are restricted to `http`/`https` and blocked from resolving to private or loopback addresses (basic SSRF protection).
