"""Per-org LLM API key management.

Lets each organization configure their own OpenAI / Anthropic API keys
and optional proxy base URLs. Keys are Fernet-encrypted before storage.
The backend falls back to env vars when no org key is set.

Endpoints:
  GET    /api/settings/llm-keys              — list configured providers
  POST   /api/settings/llm-keys              — save / update a provider key
  DELETE /api/settings/llm-keys/{provider}   — remove (fall back to system default)
  POST   /api/settings/llm-keys/{provider}/test — verify connectivity
"""

import uuid

import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.models.response import ApiResponse, ResponseMetadata
from app.services.llm_key_service import (
    SUPPORTED_PROVIDERS,
    delete_provider,
    list_providers,
    save_provider,
)
from app.utils.credential_crypto import encryption_available
from app.utils.request_context import get_data_org_id

logger = structlog.get_logger()
router = APIRouter(tags=["llm-keys"])


class SaveLLMKeyRequest(BaseModel):
    provider: str = Field(description="'openai' or 'anthropic'")
    api_key:  str = Field(description="API key — encrypted before storage, never returned")
    base_url: str = Field(default="", description="Optional proxy base URL")


class LLMKeyStatus(BaseModel):
    provider: str
    has_key:  bool
    base_url: str


class TestResult(BaseModel):
    ok:      bool
    message: str


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _test_openai(api_key: str, base_url: str) -> TestResult:
    try:
        import openai as _oai
        kwargs: dict = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = _oai.AsyncOpenAI(**kwargs)
        # Minimal call — list models is cheap and works with proxies
        await client.models.list()
        return TestResult(ok=True, message="Connected to OpenAI successfully.")
    except Exception as exc:
        return TestResult(ok=False, message=f"OpenAI error: {exc}")


async def _test_anthropic(api_key: str, base_url: str) -> TestResult:
    try:
        import anthropic as _anth
        kwargs: dict = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = _anth.AsyncAnthropic(**kwargs)
        # Minimal 1-token message
        await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1,
            messages=[{"role": "user", "content": "hi"}],
        )
        return TestResult(ok=True, message="Connected to Anthropic successfully.")
    except Exception as exc:
        return TestResult(ok=False, message=f"Anthropic error: {exc}")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/settings/llm-keys", response_model=ApiResponse[list[LLMKeyStatus]])
async def get_llm_keys(request: Request) -> ApiResponse[list[LLMKeyStatus]]:
    """Return configured LLM providers for this org (no raw keys)."""
    org_id = get_data_org_id(request)
    providers = await list_providers(org_id)
    return ApiResponse(
        data=[LLMKeyStatus(**p) for p in providers],
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.post("/settings/llm-keys", response_model=ApiResponse[LLMKeyStatus])
async def save_llm_key(body: SaveLLMKeyRequest, request: Request) -> ApiResponse[LLMKeyStatus]:
    """Save / overwrite an LLM API key for a provider."""
    if body.provider not in SUPPORTED_PROVIDERS:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"Provider must be one of: {SUPPORTED_PROVIDERS}")
    if not body.api_key.strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="api_key must not be empty")
    if not encryption_available():
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="CREDENTIAL_ENCRYPTION_KEY not configured — cannot store keys securely.",
        )

    org_id = get_data_org_id(request)
    await save_provider(org_id, body.provider, body.api_key.strip(), body.base_url.strip())

    return ApiResponse(
        data=LLMKeyStatus(provider=body.provider, has_key=True, base_url=body.base_url.strip()),
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.delete("/settings/llm-keys/{provider}", response_model=ApiResponse[dict])
async def delete_llm_key(provider: str, request: Request) -> ApiResponse[dict]:
    """Remove a provider key — falls back to system env var defaults."""
    if provider not in SUPPORTED_PROVIDERS:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"Provider must be one of: {SUPPORTED_PROVIDERS}")
    org_id = get_data_org_id(request)
    await delete_provider(org_id, provider)
    return ApiResponse(
        data={"deleted": provider},
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.post("/settings/llm-keys/{provider}/test", response_model=ApiResponse[TestResult])
async def test_llm_key(provider: str, body: SaveLLMKeyRequest, request: Request) -> ApiResponse[TestResult]:
    """Test a key before saving it (or re-test the stored key)."""
    if provider not in SUPPORTED_PROVIDERS:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"Provider must be one of: {SUPPORTED_PROVIDERS}")

    # Use the submitted key if provided; otherwise re-test the stored key
    if body.api_key.strip():
        api_key  = body.api_key.strip()
        base_url = body.base_url.strip()
    else:
        from app.services.llm_key_service import get_config
        org_id = get_data_org_id(request)
        config = await get_config(org_id)
        prov_cfg = config.get(provider, {})
        api_key  = prov_cfg.get("api_key", "")
        base_url = prov_cfg.get("base_url", "")

    if not api_key:
        result = TestResult(ok=False, message="No API key configured for this provider.")
    elif provider == "openai":
        result = await _test_openai(api_key, base_url)
    else:
        result = await _test_anthropic(api_key, base_url)

    return ApiResponse(
        data=result,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )
