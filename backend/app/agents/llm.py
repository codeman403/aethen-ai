"""Shared LLM factory — creates pre-configured LLM clients for all pipeline nodes.

Handles base URL proxying (DataExpert.io) and required session headers.
"""

import uuid

import structlog

from app.config import settings

logger = structlog.get_logger()

_DEFAULT_HEADERS = {"x-session-id": f"aethen-{uuid.uuid4().hex[:12]}"}


def get_openai_llm(*, temperature: float = 0, max_tokens: int = 1500):
    """Get a ChatOpenAI instance with proxy and header configuration."""
    from langchain_openai import ChatOpenAI

    kwargs = {
        "model": "gpt-4o-mini",
        "api_key": settings.openai_api_key,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "default_headers": _DEFAULT_HEADERS,
    }
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url

    return ChatOpenAI(**kwargs)


def get_anthropic_llm(*, temperature: float = 0, max_tokens: int = 2000):
    """Get a ChatAnthropic instance with proxy and header configuration.

    Falls back to OpenAI if langchain-anthropic is not installed.
    """
    if settings.anthropic_api_key:
        try:
            from langchain_anthropic import ChatAnthropic

            kwargs = {
                "model": "claude-sonnet-4-6",
                "api_key": settings.anthropic_api_key,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "default_headers": _DEFAULT_HEADERS,
            }
            if settings.anthropic_base_url:
                kwargs["anthropic_api_url"] = settings.anthropic_base_url

            return ChatAnthropic(**kwargs)
        except ImportError:
            logger.warning("langchain_anthropic_not_installed_falling_back_to_openai")

    return get_openai_llm(temperature=temperature, max_tokens=max_tokens)
