import pymupdf as fitz


class PDFExtractionError(Exception):
    """Raised when a PDF can't be opened or contains no extractable text."""


def extract_text_from_pdf(file_bytes: bytes) -> str:

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        raise PDFExtractionError(f"Could not open PDF: {e}") from e

    if doc.page_count == 0:
        doc.close()
        raise PDFExtractionError("PDF has no pages.")

    pages_text = [page.get_text() for page in doc]
    doc.close()

    full_text = "\n".join(pages_text).strip()

    if not full_text:
        raise PDFExtractionError(
            "No extractable text found in this PDF — it may be a scanned document. Try uploading it as an image instead so OCR can read it."
        )

    return full_text