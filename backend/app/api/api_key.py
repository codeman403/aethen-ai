"""Aethen API key management.

Generates a single API key for authenticating external agents (MCP, SDK).
The raw key is returned once at generation time and never stored — only
its SHA-256 hash is persisted in app_settings.

Endpoints:
  POST   /api/settings/api-key   — generate a new key (revokes existing)
  GET    /api/settings/api-key   — check if a key exists + masked prefix
  DELETE /api/settings/api-key   — revoke current key
"""

import hashlib
import secrets
import uuid

import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from app.models.response import ApiResponse, ResponseMetadata
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()
router = APIRouter(tags=["api-key"])

_SETTINGS_KEY = "aethen_api_key_hash"
_PREFIX_KEY = "aethen_api_key_prefix"   # stores first 12 chars for display only
_KEY_PREFIX = "aethen-"


class ApiKeyStatus(BaseModel):
    exists: bool
    key_prefix: str | None = None   # e.g. "aethen-a3f9" — for display only


class GeneratedKey(BaseModel):
    key: str          # raw key — shown ONCE, never stored
    key_prefix: str   # first 12 chars for future display


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _generate_raw_key() -> str:
    return f"{_KEY_PREFIX}{secrets.token_urlsafe(32)}"


@router.post("/settings/api-key", response_model=ApiResponse[GeneratedKey])
async def generate_api_key() -> ApiResponse[GeneratedKey]:
    """Generate a new Aethen API key.

    Revokes any existing key. Returns the raw key exactly once —
    it cannot be retrieved again. Store it securely (e.g. Render env var,
    Claude Desktop config).
    """
    raw = _generate_raw_key()
    key_hash = _hash_key(raw)
    key_prefix = raw[:12]   # "aethen-a3f9"

    await postgres_service.set_setting(_SETTINGS_KEY, key_hash)
    await postgres_service.set_setting(_PREFIX_KEY, key_prefix)

    logger.info("api_key_generated", prefix=key_prefix)
    return ApiResponse(
        data=GeneratedKey(key=raw, key_prefix=key_prefix),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.get("/settings/api-key", response_model=ApiResponse[ApiKeyStatus])
async def get_api_key_status() -> ApiResponse[ApiKeyStatus]:
    """Return whether an API key is configured and its masked prefix."""
    key_hash = await postgres_service.get_setting(_SETTINGS_KEY)
    prefix = await postgres_service.get_setting(_PREFIX_KEY) if key_hash else None

    return ApiResponse(
        data=ApiKeyStatus(exists=bool(key_hash), key_prefix=prefix),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.delete("/settings/api-key", response_model=ApiResponse[dict])
async def revoke_api_key() -> ApiResponse[dict]:
    """Revoke the current API key. All agents using it will lose access."""
    await postgres_service.set_setting(_SETTINGS_KEY, "")
    await postgres_service.set_setting(_PREFIX_KEY, "")
    logger.info("api_key_revoked")
    return ApiResponse(
        data={"revoked": True},
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


async def validate_api_key(raw_key: str) -> bool:
    """Return True if raw_key matches the stored hash.

    Returns True when:
    - No key is configured (open access — local dev, fresh installs)
    - The key store is unavailable (fail open — don't block requests if DB is down)
    """
    try:
        stored_hash = await postgres_service.get_setting(_SETTINGS_KEY)
    except Exception:
        return True   # fail open if key store is unreachable
    if not stored_hash:
        return True   # no key configured → open access
    return _hash_key(raw_key) == stored_hash
