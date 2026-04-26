"""Application configuration loaded from environment variables."""

import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env FIRST with override=True so it wins over empty shell env vars
load_dotenv(".env", override=True)


class Settings(BaseSettings):
    """Central configuration for the Aethen-AI backend."""

    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "Aethen-AI Backend"
    debug: bool = False
    log_level: str = "INFO"

    # LLM Providers
    anthropic_api_key: str = ""
    anthropic_base_url: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    cohere_api_key: str = ""

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_index: str = "aethen-traces"

    # PostgreSQL / Supabase — session CRUD store
    database_url: str = ""

    # Neo4j — graph traversal only
    neo4j_uri: str = ""
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # Langfuse
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_base_url: str = "https://us.cloud.langfuse.com"

    # Frontend
    frontend_url: str = "http://localhost:3000"


settings = Settings()
