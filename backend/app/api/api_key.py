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
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.models.response import ApiResponse, ResponseMetadata
from app.services.postgres_service import postgres_service
from app.utils.request_context import get_data_org_id

logger = structlog.get_logger()
router = APIRouter(tags=["api-key"])

_KEY_PREFIX = "aethen-"

def _settings_key(org_id: str | None) -> str:
    return f"aethen_api_key_hash:{org_id}" if org_id else "aethen_api_key_hash"

def _prefix_key(org_id: str | None) -> str:
    return f"aethen_api_key_prefix:{org_id}" if org_id else "aethen_api_key_prefix"


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
async def generate_api_key(http_request: Request) -> ApiResponse[GeneratedKey]:
    """Generate a new Aethen API key for this org.

    Revokes any existing key. Returns the raw key exactly once —
    it cannot be retrieved again. Store it securely (e.g. Render env var,
    Claude Desktop config).
    """
    org_id = get_data_org_id(http_request)
    raw = _generate_raw_key()
    key_hash = _hash_key(raw)
    key_prefix = raw[:12]

    await postgres_service.set_setting(_settings_key(org_id), key_hash)
    await postgres_service.set_setting(_prefix_key(org_id), key_prefix)

    logger.info("api_key_generated", prefix=key_prefix, org_id=org_id)
    return ApiResponse(
        data=GeneratedKey(key=raw, key_prefix=key_prefix),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.get("/settings/api-key", response_model=ApiResponse[ApiKeyStatus])
async def get_api_key_status(http_request: Request) -> ApiResponse[ApiKeyStatus]:
    """Return whether an API key is configured for this org."""
    org_id = get_data_org_id(http_request)
    key_hash = await postgres_service.get_setting(_settings_key(org_id))
    prefix = await postgres_service.get_setting(_prefix_key(org_id)) if key_hash else None

    return ApiResponse(
        data=ApiKeyStatus(exists=bool(key_hash), key_prefix=prefix),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.delete("/settings/api-key", response_model=ApiResponse[dict])
async def revoke_api_key(http_request: Request) -> ApiResponse[dict]:
    """Revoke the current API key for this org."""
    org_id = get_data_org_id(http_request)
    await postgres_service.set_setting(_settings_key(org_id), "")
    await postgres_service.set_setting(_prefix_key(org_id), "")
    logger.info("api_key_revoked", org_id=org_id)
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
