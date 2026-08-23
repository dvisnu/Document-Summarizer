# --- Base image ---
FROM python:3.14-slim

#uv
COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /bin/uv


ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

#System dependency: the actual Tesseract OCR engine (pytesseract is only a wrapper)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd && \
    rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev

# App code
COPY backend/app ./backend/app

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
