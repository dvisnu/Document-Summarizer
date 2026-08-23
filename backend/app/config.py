from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    google_api_key: str
    gemini_model: str = "gemini-1.5-flash"
    frontend_origin: str = "http://localhost:5500"

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()