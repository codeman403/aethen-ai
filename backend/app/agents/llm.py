"""Shared LLM factory — creates pre-configured LLM clients for all pipeline nodes.

Handles base URL proxying (DataExpert.io) and required session headers.
The factory functions route to the correct client (OpenAI or Anthropic) based on
the model name in the cache — so any role can use any confirmed-working model.

Per-org credential override:
  Call set_org_llm_context(config) at the start of each request that triggers
  LLM calls. The config dict is read by _make_openai/_make_anthropic and takes
  precedence over env vars. contextvars ensures coroutine-level isolation — each
  concurrent request has its own copy, so tenants cannot cross-contaminate.
"""

import contextvars
import uuid

import structlog

from app.config import settings

logger = structlog.get_logger()

_DEFAULT_HEADERS = {"x-session-id": f"aethen-{uuid.uuid4().hex[:12]}"}

# ── Per-org LLM credential context ────────────────────────────────────────────
# Set once per request by route handlers before calling LLM factory functions.
# Cleared automatically when the coroutine completes (no manual cleanup needed).
# Structure: { "openai": {"api_key": "...", "base_url": "..."}, "anthropic": {...} }
_org_llm_ctx: contextvars.ContextVar[dict] = contextvars.ContextVar("org_llm", default={})


def set_org_llm_context(config: dict) -> None:
    """Inject per-org LLM credentials for the current async context."""
    _org_llm_ctx.set(config)


def clear_org_llm_context() -> None:
    _org_llm_ctx.set({})


# ── In-memory model cache ─────────────────────────────────────────────────────
# Seeded from Postgres on startup, updated instantly on POST /api/settings/models.
_model_cache: dict[str, str] = {
    "analysis":  "gpt-4o-mini",
    "synthesis": "gpt-4o-mini",
    "demo":      "gpt-4o-mini",
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

    ctx = _org_llm_ctx.get()
    org_cfg = ctx.get("openai", {})

    api_key  = org_cfg.get("api_key")  or settings.openai_api_key
    base_url = org_cfg.get("base_url") or settings.openai_base_url or None

    kwargs = {
        "model":           model_id,
        "api_key":         api_key,
        "temperature":     temperature,
        "max_tokens":      max_tokens,
        "default_headers": _DEFAULT_HEADERS,
    }
    if base_url:
        kwargs["base_url"] = base_url

    logger.debug("openai_llm_created", model=model_id, has_org_key=bool(org_cfg.get("api_key")))
    return ChatOpenAI(**kwargs)


def _make_anthropic(model_id: str, temperature: float, max_tokens: int):
    from langchain_anthropic import ChatAnthropic

    ctx = _org_llm_ctx.get()
    org_cfg = ctx.get("anthropic", {})

    api_key  = org_cfg.get("api_key")  or settings.anthropic_api_key
    base_url = org_cfg.get("base_url") or settings.anthropic_base_url or None

    kwargs = {
        "model":           model_id,
        "api_key":         api_key,
        "temperature":     temperature,
        "max_tokens":      max_tokens,
        "streaming":       True,
        "default_headers": _DEFAULT_HEADERS,
    }
    if base_url:
        kwargs["base_url"] = base_url

    logger.info("anthropic_llm_created", model=model_id, has_org_key=bool(org_cfg.get("api_key")))
    return ChatAnthropic(**kwargs)


def _make_llm(model_id: str, temperature: float, max_tokens: int):
    """Create the right LLM client based on model name."""
    ctx = _org_llm_ctx.get()
    if _is_anthropic(model_id):
        # Use Anthropic if org has a key OR env var is set
        if ctx.get("anthropic", {}).get("api_key") or settings.anthropic_api_key:
            return _make_anthropic(model_id, temperature, max_tokens)
        # Fall back to GPT-4o-mini if no Anthropic key anywhere
        return _make_openai("gpt-4o-mini", temperature, max_tokens)
    return _make_openai(model_id, temperature, max_tokens)


def get_openai_llm(*, temperature: float = 0, max_tokens: int = 1500, model: str | None = None):
    active_model = model or _model_cache.get("analysis") or _model_cache.get("openai", "gpt-4o-mini")
    return _make_llm(active_model, temperature, max_tokens)


def get_anthropic_llm(*, temperature: float = 0, max_tokens: int = 2000, model: str | None = None):
    active_model = model or _model_cache.get("synthesis") or _model_cache.get("anthropic", "claude-sonnet-4-6")
    return _make_llm(active_model, temperature, max_tokens)


def get_demo_llm(*, temperature: float = 0, max_tokens: int = 1500, model: str | None = None):
    active_model = model or _model_cache.get("demo", "gpt-4o-mini")
    return _make_llm(active_model, temperature, max_tokens)
