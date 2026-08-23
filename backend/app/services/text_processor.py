import re

from langchain_text_splitters import RecursiveCharacterTextSplitter

SINGLE_PASS_CHAR_LIMIT = 12_000

CHUNK_SIZE = 4_000
CHUNK_OVERLAP = 200


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