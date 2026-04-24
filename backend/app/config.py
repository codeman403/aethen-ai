"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the Aethen-AI backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_name: str = "Aethen-AI Backend"
    debug: bool = False
    log_level: str = "INFO"

    # LLM Providers
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    cohere_api_key: str = ""

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index: str = "aethen-traces"

    # Neo4j
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"


settings = Settings()
