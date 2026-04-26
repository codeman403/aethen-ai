"""Application configuration loaded from environment variables."""

import os

from dotenv import load_dotenv
from pydantic import model_validator
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

    @model_validator(mode="after")
    def validate_required_secrets(self) -> "Settings":
        required_fields = [
            "openai_api_key",
            "cohere_api_key",
            "pinecone_api_key",
            "database_url",
            "neo4j_uri",
            "neo4j_password",
        ]
        missing = [field for field in required_fields if not getattr(self, field)]
        
        # Anthropic is optional (falls back to GPT-4o-mini), Langfuse is optional for local runs 
        # (though required for full live trace feature).

        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
        return self


settings = Settings()
