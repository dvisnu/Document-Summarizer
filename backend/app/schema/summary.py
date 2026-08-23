from enum import Enum

from pydantic import BaseModel, Field


class SummaryLength(str, Enum):
    short = "short"
    medium = "medium"
    long = "long"


class SummaryResult(BaseModel):

    summary: str = Field(description="A coherent narrative summary of the document")
    key_points: list[str] = Field(description="3 to 6 of the most important individual points")
    main_ideas: list[str] = Field(description="2 to 4 overarching themes or takeaways")


class SummarizeResponse(SummaryResult):

    success: bool = True
    filename: str