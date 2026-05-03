"""Shared LLM factory — creates pre-configured LLM clients for all pipeline nodes.

Handles base URL proxying (DataExpert.io) and required session headers.
The factory functions route to the correct client (OpenAI or Anthropic) based on
the model name in the cache — so any role can use any confirmed-working model.
"""

import uuid

import structlog

from app.config import settings

logger = structlog.get_logger()

_DEFAULT_HEADERS = {"x-session-id": f"aethen-{uuid.uuid4().hex[:12]}"}


# In-memory model cache — seeded from Postgres on startup, updated instantly on
# POST /api/settings/models. Keys match the role names in model_settings._ROLES.
_model_cache: dict[str, str] = {
    "analysis":  "gpt-4o-mini",
    "synthesis": "claude-sonnet-4-6",
    "demo":      "gpt-4o-mini",
    # Legacy keys kept for any code that still uses the old names
    "openai":    "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-6",
}


def set_active_model(role: str, model_id: str) -> None:
    """Update the in-memory cache. Called by the settings API after persisting to Postgres."""
    _model_cache[role] = model_id
    logger.info("model_cache_updated", role=role, model_id=model_id)


def _is_anthropic(model_id: str) -> bool:
    return model_id.startswith("claude")


def _make_openai(model_id: str, temperature: float, max_tokens: int):
    from langchain_openai import ChatOpenAI
    kwargs = {
        "model": model_id,
        "api_key": settings.openai_api_key,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "default_headers": _DEFAULT_HEADERS,
    }
    if settings.openai_base_url:
        kwargs["base_url"] = settings.openai_base_url
    logger.debug("openai_llm_created", model=model_id)
    return ChatOpenAI(**kwargs)


def _make_anthropic(model_id: str, temperature: float, max_tokens: int):
    from langchain_anthropic import ChatAnthropic
    kwargs = {
        "model": model_id,
        "api_key": settings.anthropic_api_key,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "streaming": True,  # proxy always returns SSE — must use SSE parser
        "default_headers": _DEFAULT_HEADERS,
    }
    if settings.anthropic_base_url:
        kwargs["base_url"] = settings.anthropic_base_url
    logger.info("anthropic_llm_created", model=model_id)
    return ChatAnthropic(**kwargs)


def _make_llm(model_id: str, temperature: float, max_tokens: int):
    """Create the right LLM client based on model name."""
    if _is_anthropic(model_id) and settings.anthropic_api_key:
        return _make_anthropic(model_id, temperature, max_tokens)
    return _make_openai(model_id, temperature, max_tokens)


def get_openai_llm(*, temperature: float = 0, max_tokens: int = 1500, model: str | None = None):
    """Get the analysis/routing LLM.

    Reads from the 'analysis' cache slot. Routes to ChatAnthropic if a Claude
    model is selected, ChatOpenAI otherwise. Pass `model` to override explicitly.
    """
    active_model = model or _model_cache.get("analysis") or _model_cache.get("openai", "gpt-4o-mini")
    return _make_llm(active_model, temperature, max_tokens)


def get_anthropic_llm(*, temperature: float = 0, max_tokens: int = 2000, model: str | None = None):
    """Get the synthesis/chat LLM.

    Reads from the 'synthesis' cache slot. Routes to ChatAnthropic if a Claude
    model is selected (streaming=True required for proxy), ChatOpenAI otherwise.
    Falls back to GPT-4o-mini if no Anthropic key is configured.
    """
    active_model = model or _model_cache.get("synthesis") or _model_cache.get("anthropic", "claude-sonnet-4-6")
    if _is_anthropic(active_model) and not settings.anthropic_api_key:
        active_model = "gpt-4o-mini"
    return _make_llm(active_model, temperature, max_tokens)


def get_demo_llm(*, temperature: float = 0, max_tokens: int = 1500, model: str | None = None):
    """Get the Demo Agent LLM.

    Reads from the 'demo' cache slot. Supports any confirmed-working model.
    """
    active_model = model or _model_cache.get("demo", "gpt-4o-mini")
    return _make_llm(active_model, temperature, max_tokens)
