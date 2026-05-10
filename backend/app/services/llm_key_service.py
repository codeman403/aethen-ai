"""Per-org LLM credential service.

Stores encrypted API keys and optional base URLs for OpenAI and Anthropic
in the shared app_settings table, namespaced by org_id.

Keys are decrypted only in memory and cached for 60 seconds to avoid
repeated DB lookups on every LLM call.
"""

import json
import time

import structlog

from app.services.postgres_service import postgres_service
from app.utils.credential_crypto import decrypt, encrypt, encryption_available

logger = structlog.get_logger()

SUPPORTED_PROVIDERS = ("openai", "anthropic")

# In-memory cache: org_id → { openai: {api_key, base_url}, anthropic: {...}, _expires: float }
_CACHE: dict[str, dict] = {}
_CACHE_TTL = 60  # seconds


def _settings_key(provider: str, org_id: str | None) -> str:
    prefix = f"org:{org_id}:" if org_id else ""
    return f"{prefix}llm:{provider}"


def _invalidate(org_id: str | None) -> None:
    _CACHE.pop(str(org_id), None)


async def get_config(org_id: str | None) -> dict:
    """Return decrypted LLM config for the org.

    Returns a dict like:
        { "openai": {"api_key": "sk-...", "base_url": "https://..."}, "anthropic": {...} }

    Missing providers return an empty dict (caller falls back to env vars).
    Admins (org_id=None) always use env vars — their config is the system default.
    """
    if not org_id:
        return {}

    cache_key = org_id
    cached = _CACHE.get(cache_key)
    if cached and cached.get("_expires", 0) > time.monotonic():
        return {k: v for k, v in cached.items() if k != "_expires"}

    config: dict = {}
    for provider in SUPPORTED_PROVIDERS:
        raw = await postgres_service.get_setting(_settings_key(provider, org_id))
        if not raw:
            continue
        try:
            payload = json.loads(raw)
            api_key = decrypt(payload["api_key_enc"]) if payload.get("api_key_enc") else ""
            config[provider] = {
                "api_key":  api_key,
                "base_url": payload.get("base_url", ""),
            }
        except Exception as exc:
            logger.warning("llm_key_decrypt_failed", provider=provider, org_id=org_id, error=str(exc))

    _CACHE[cache_key] = {**config, "_expires": time.monotonic() + _CACHE_TTL}
    return config


async def save_provider(
    org_id: str | None,
    provider: str,
    api_key: str,
    base_url: str = "",
) -> None:
    """Encrypt and persist an LLM API key for a provider."""
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unsupported provider: {provider}")
    if not encryption_available():
        raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY not configured")

    payload = {
        "api_key_enc": encrypt(api_key),
        "base_url":    base_url.strip(),
    }
    await postgres_service.set_setting(_settings_key(provider, org_id), json.dumps(payload))
    _invalidate(org_id)
    logger.info("llm_key_saved", provider=provider, org_id=org_id)


async def delete_provider(org_id: str | None, provider: str) -> None:
    """Remove a provider's LLM key (falls back to system env vars)."""
    await postgres_service.set_setting(_settings_key(provider, org_id), "")
    _invalidate(org_id)
    logger.info("llm_key_deleted", provider=provider, org_id=org_id)


async def list_providers(org_id: str | None) -> list[dict]:
    """Return metadata for configured providers — no raw keys exposed."""
    result = []
    for provider in SUPPORTED_PROVIDERS:
        raw = await postgres_service.get_setting(_settings_key(provider, org_id))
        if not raw:
            continue
        try:
            payload = json.loads(raw)
            result.append({
                "provider":   provider,
                "has_key":    bool(payload.get("api_key_enc")),
                "base_url":   payload.get("base_url", ""),
            })
        except Exception:
            pass
    return result
