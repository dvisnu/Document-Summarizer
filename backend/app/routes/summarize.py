from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from backend.app.schema.summary import SummarizeResponse, SummaryLength
from backend.app.services.ocr_service import OCRExtractionError, extract_text_from_image
from backend.app.services.pdf_extractor import PDFExtractionError, extract_text_from_pdf
from backend.app.services.summarizer import generate_summary

router = APIRouter()

MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
PDF_CONTENT_TYPES = {"application/pdf"}
IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/jpg"}


@router.post("/api/summarize", response_model=SummarizeResponse)
async def summarize_document(
    file: UploadFile = File(...),
    summary_length: SummaryLength = Form(SummaryLength.medium),
):
    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds the 15MB limit.")

    content_type = file.content_type or ""
    filename = (file.filename or "").lower()

    # --- Route to the right extractor based on type ---
    try:
        if content_type in PDF_CONTENT_TYPES or filename.endswith(".pdf"):
            raw_text = await run_in_threadpool(extract_text_from_pdf, file_bytes)
        elif content_type in IMAGE_CONTENT_TYPES or filename.endswith((".jpg", ".jpeg", ".png")):
            raw_text = await run_in_threadpool(extract_text_from_image, file_bytes)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{content_type or 'unknown'}'. Upload a PDF, JPG, or PNG.",
            )
    except (PDFExtractionError, OCRExtractionError) as e:
        # These are USER errors (bad/scanned file) -> 400, not 500
        raise HTTPException(status_code=400, detail=str(e)) from e

    # --- Summarize (small-doc or map-reduce, decided internally) ---
    try:
        result = await run_in_threadpool(generate_summary, raw_text, summary_length)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Summarization failed: {e}") from e

    return SummarizeResponse(
        filename=file.filename or "unknown",
        summary=result.summary,
        key_points=result.key_points,
        main_ideas=result.main_ideas,
    )