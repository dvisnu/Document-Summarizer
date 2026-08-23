# Document Summary Assistant

Upload a PDF or an image, get back a summary, key points, and main ideas.
Text comes out of PDFs directly and out of images via OCR; summarizing is done
by Gemini through LangChain.

- **Live:** https://document-summary-frontend-illr.onrender.com
- **API:** https://document-summary-backend-3lgx.onrender.com

---

## Structure

```
├── backend/
│   ├── Dockerfile
│   └── app/
│       ├── main.py               FastAPI app, CORS, error handlers, /api/health
│       ├── config.py             settings from env vars (pydantic-settings)
│       ├── routes/summarize.py   POST /api/summarize
│       ├── schema/summary.py     response models
│       └── services/
│           ├── pdf_extractor.py  text out of PDFs (PyMuPDF)
│           ├── ocr_service.py    text out of images (Tesseract)
│           ├── text_processor.py cleaning + chunking
│           └── summarizer.py     the Gemini calls
├── frontend/                     plain HTML/CSS/JS, no build step
├── pyproject.toml / uv.lock      dependencies, managed with uv
└── render.yaml                   both services as one Render blueprint
```

Imports are absolute (`from backend.app...`), so the **repo root** is the
package root — run everything from there, not from `backend/`.

---

## How it works

### Request path

`POST /api/summarize` takes multipart form data: a `file` and a
`summary_length` of `short`, `medium`, or `long`.

1. **Guards** — reject empty files and anything over 15MB.
2. **Route by type** — PDFs go to `pdf_extractor`, JPG/PNG go to `ocr_service`.
   Both content type and file extension are checked, so a wrong MIME type from
   the browser doesn't break it.
3. **Extract** — PyMuPDF pulls text per page. A PDF with no extractable text is
   almost always a scan, so the error says to upload it as an image instead.
   Images go through Tesseract.
4. **Summarize** — see below.
5. **Respond** — `{success, filename, summary, key_points, main_ideas}`.

Extraction failures are user errors (bad or scanned file), so they return
**400**. A failed Gemini call returns **502**. Every error path goes through the
handlers in `main.py` and comes back as `{success: false, error: "..."}`, so the
frontend only ever has one error shape to deal with.

### Summarizing

`generate_summary()` cleans the text, then picks a strategy by document size
(independent of the requested `summary_length`):

- **Under 12,000 chars** — one pass. The prompt is bound to the `SummaryResult`
  model with `.with_structured_output()`, so Gemini returns the summary, key
  points, and main ideas already parsed — no string wrangling.
- **Over 12,000 chars** — map-reduce. `RecursiveCharacterTextSplitter` cuts the
  text into 4,000-char chunks with 200 of overlap, each chunk is condensed on
  its own, the condensed pieces are joined, and that goes through the single-pass
  path above. This keeps long documents inside the context window and costs one
  Gemini call per chunk plus one at the end.

### Frontend

No build step, so `API_BASE` is chosen at runtime from `window.location.hostname`
— localhost talks to local uvicorn, anything else talks to the deployed API.

The backend runs on a Render free instance, which sleeps after 15 minutes idle
and takes about a minute to wake. So the status pill has four states, not two:
`checking` → `waking` → `online` / `offline`. `pingHealth()` requires real JSON
saying `status: "ok"`, because Render's proxy can answer with an HTML loading
page while the instance boots and that must not read as healthy. `runWake()`
retries for 90s with backoff before giving up, and the pill is then clickable to
retry.

Generate goes through the same routine: it wakes the backend before uploading,
re-checking if the last healthy response is over 10 minutes old. The in-flight
wake promise is shared, so clicking Generate mid-check doesn't start a second
polling loop.

---

## Deployment

`render.yaml` defines both services and deploys them on push.

- **Backend** — Docker, from `backend/Dockerfile`. The build context is the repo
  root, not `backend/`, because `pyproject.toml` and `uv.lock` live at the root.
  Dependencies install with `uv sync --locked`; Tesseract is a system package, so
  it comes in via `apt` in the image.
- **Frontend** — static site serving `./frontend` off Render's CDN. Static sites
  don't sleep, so the page always loads instantly even when the API is cold.

Env vars on the backend service:

| Variable | Notes |
|---|---|
| `GOOGLE_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | defaults to `gemini-2.5-flash` |
| `FRONTEND_ORIGIN` | comma-separated CORS origins, no trailing slash |

`FRONTEND_ORIGIN` must list the exact frontend origin or every request fails
CORS preflight. Note that the env var overrides the default in `config.py`, so
editing the code default has no effect on a deployed service.

---

## Running locally

```bash
uv sync
cp .env.example .env          # then add your GOOGLE_API_KEY

uv run uvicorn backend.app.main:app --reload     # from the repo root
python -m http.server 5500 --directory frontend  # in a second terminal
```

Open http://localhost:5500. OCR needs Tesseract installed separately — set
`TESSERACT_CMD` in `.env` if it isn't on your PATH.
