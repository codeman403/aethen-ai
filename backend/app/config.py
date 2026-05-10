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

    # LangSmith
    langsmith_api_key: str = ""
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_project: str = "Aethen"

    # Supabase — auth middleware + token verification
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""  # kept for HS256 fallback if needed

    # Admin / root users — comma-separated emails that bypass org scoping
    # and can see all data across every organization.
    # Example: ADMIN_EMAILS=admin@example.com,ops@example.com
    admin_emails: str = ""

    @property
    def admin_email_set(self) -> frozenset[str]:
        # Read directly from os.environ as well to catch cases where
        # pydantic-settings case-folding doesn't pick up ADMIN_EMAILS on Linux.
        raw = os.environ.get("ADMIN_EMAILS", self.admin_emails)
        return frozenset(e.strip().lower() for e in raw.split(",") if e.strip())

    # Resend — transactional email
    resend_api_key: str = ""
    email_from: str = ""   # e.g. "Aethen <hello@yourdomain.com>"

    # Sentry — error monitoring
    sentry_dsn: str = ""
    sentry_environment: str = "development"

    # Cron — shared secret for Vercel cron job authentication
    cron_secret: str = ""

    # Vector DB — pgvector (Postgres-native), no external vector service needed.
    use_pgvector: bool = True  # kept for potential future backend swap

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # PII/PHI redaction — applied to session data before storage
    pii_redaction_enabled: bool = True

    # Credential encryption — Fernet key for storing third-party API keys
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Set in Render env vars + local .env — never commit this value
    credential_encryption_key: str = ""

    @model_validator(mode="after")
    def validate_required_secrets(self) -> "Settings":
        required_fields = [
            "openai_api_key",
            "cohere_api_key",
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
