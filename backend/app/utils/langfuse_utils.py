"""Shared Langfuse callback handler factory.

Used by both the demo endpoints and the LangGraph analysis pipeline so every
LLM call — whether from a demo scenario or a real diagnostic run — is traced
in Langfuse with the same credentials and configuration.
"""

import os

import structlog

from app.config import settings

logger = structlog.get_logger()


def make_langfuse_handler():
    """Return (CallbackHandler, Langfuse client) or (None, None) if not configured.

    Gracefully returns (None, None) when Langfuse credentials are absent so
    callers don't need to guard against missing config.
    """
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return None, None
    try:
        from langfuse import Langfuse
        from langfuse.langchain import CallbackHandler

        host = settings.langfuse_base_url or "https://us.cloud.langfuse.com"
        if not os.getenv("LANGFUSE_HOST") and host:
            os.environ["LANGFUSE_HOST"] = host

        client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=host,
        )
        return CallbackHandler(), client
    except Exception as exc:
        logger.warning("langfuse_handler_init_failed", error=str(exc))
        return None, None
