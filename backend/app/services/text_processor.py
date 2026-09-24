import re

from langchain_text_splitters import RecursiveCharacterTextSplitter

# Gemini flash models take ~1M tokens, so a 12k-char cutoff sent ordinary
# documents down the map-reduce path and spent one API call per 4k chars —
# 40 sequential calls for a 40-page PDF. At ~4 chars/token these limits are
# still a small fraction of the context window, and almost every real document
# now finishes in a single call.
SINGLE_PASS_CHAR_LIMIT = 200_000

CHUNK_SIZE = 40_000
CHUNK_OVERLAP = 500


def clean_text(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def needs_chunking(text: str) -> bool:
    return len(text) > SINGLE_PASS_CHAR_LIMIT


def split_into_chunks(text: str) -> list[str]:
    
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_text(text)