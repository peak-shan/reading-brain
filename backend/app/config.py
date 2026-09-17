"""Application configuration loaded from .env."""

import secrets

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global settings sourced from environment variables / .env file."""

    database_url: str = "sqlite:///./reading_brain.db"

    # Volcano Ark (火山方舟) API
    volcano_api_key: str = ""
    volcano_model_id: str = ""
    volcano_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"

    # JWT authentication
    jwt_secret_key: str = secrets.token_urlsafe(32)

    app_host: str = "127.0.0.1"
    app_port: int = 8000

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


settings = Settings()
