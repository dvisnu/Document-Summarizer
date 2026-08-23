from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from backend.app.config import get_settings
from backend.app.schema.summary import SummaryLength, SummaryResult
from backend.app.services.text_processor import clean_text, needs_chunking, split_into_chunks

LENGTH_INSTRUCTIONS = {
    SummaryLength.short: "in 2 to 3 sentences",
    SummaryLength.medium: "in 1 to 2 short paragraphs",
    SummaryLength.long: "in 3 to 4 detailed paragraphs",
}


def _llm(temperature: float = 0.3) -> ChatGoogleGenerativeAI:
    settings = get_settings()
    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.google_api_key,
        temperature=temperature,
    )


FINAL_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a precise summarization assistant. Base your summary only on the provided text. Do not invent facts that aren't present in it.",
        ),
        (
            "human",
            "Summarize the following document {length_instruction}. Also extract key points and main ideas.\n\n DOCUMENT:\n{text}",
        ),
    ]
)

CHUNK_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You condense sections of a longer document. Preserve concrete facts, names, and numbers. Do not add commentary or opinions.",
        ),
        (
            "human",
            "Condense this section into its essential points:\n\n{text}",
        ),
    ]
)


def _summarize_single_pass(text: str, length: SummaryLength) -> SummaryResult:
    structured_llm = _llm().with_structured_output(SummaryResult)
    chain = FINAL_PROMPT | structured_llm
    return chain.invoke({"text": text, "length_instruction": LENGTH_INSTRUCTIONS[length]})


def _summarize_chunk(chunk: str) -> str:
    chain = CHUNK_PROMPT | _llm()
    result = chain.invoke({"text": chunk})
    return result.content


def _summarize_map_reduce(text: str, length: SummaryLength) -> SummaryResult:
    chunks = split_into_chunks(text)
    chunk_summaries = [_summarize_chunk(chunk) for chunk in chunks]
    combined = "\n\n".join(chunk_summaries)

    return _summarize_single_pass(combined, length)


def generate_summary(raw_text: str, length: SummaryLength) -> SummaryResult:
    text = clean_text(raw_text)

    if needs_chunking(text):
        return _summarize_map_reduce(text, length)
    return _summarize_single_pass(text, length)