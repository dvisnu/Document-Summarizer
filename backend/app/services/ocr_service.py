import io
import pytesseract
from PIL import Image
from backend.app.config import get_settings

_settings = get_settings()
if _settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = _settings.tesseract_cmd


class OCRExtractionError(Exception):
    """Raised when an image can't be opened or no text is detected in it."""


def extract_text_from_image(file_bytes: bytes) -> str:
    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.load()
    except Exception as e:
        raise OCRExtractionError(f"Could not open image: {e}") from e

    try:
        text = pytesseract.image_to_string(image)
    except pytesseract.TesseractNotFoundError as e:
        raise OCRExtractionError(
            "Tesseract engine not found on this server. It must be installed separately from pytesseract (e.g. `apt install tesseract-ocr`)."
        ) from e

    text = text.strip()
    if not text:
        raise OCRExtractionError("No text could be detected in this image.")

    return text