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
    """Get the synthesis LLM — Claude Sonnet 4.6 via Anthropic proxy.

    The DataExpert.io proxy always returns SSE (text/event-stream) regardless of
    whether streaming is requested. Setting streaming=True tells langchain_anthropic
    to use its SSE parser, which handles the proxy response correctly.
    Falls back to GPT-4o-mini if no Anthropic key is configured.
    """
    if settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic

        kwargs = {
            "model": "claude-sonnet-4-6",
            "api_key": settings.anthropic_api_key,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "streaming": True,
            "default_headers": _DEFAULT_HEADERS,
        }
        if settings.anthropic_base_url:
            kwargs["base_url"] = settings.anthropic_base_url

        logger.info("Using Claude Sonnet 4.6 for synthesis (via proxy, streaming mode)")
        return ChatAnthropic(**kwargs)

    return get_openai_llm(temperature=temperature, max_tokens=max_tokens)
