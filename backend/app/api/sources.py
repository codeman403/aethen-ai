"""Source credential management endpoints.

External agent teams register their Langfuse/LangSmith credentials once
here. Credentials are Fernet-encrypted before storage — the raw secret
key is never written to Postgres and never returned in API responses.

Endpoints:
  POST   /api/settings/sources              — register a source
  GET    /api/settings/sources              — list sources (no raw credentials)
  DELETE /api/settings/sources/{name}       — remove a source
  POST   /api/settings/sources/{name}/test  — test connectivity
"""

import json
import re
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.response import ApiResponse, ResponseMetadata
from app.services.postgres_service import postgres_service
from app.utils.credential_crypto import decrypt, encrypt, encryption_available

logger = structlog.get_logger()
router = APIRouter(tags=["sources"])

_SOURCE_KEY_PREFIX = "source:"
_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9\-_]{0,62}[a-z0-9]$|^[a-z0-9]$")


class AddSourceRequest(BaseModel):
    name: str = Field(description="Slug identifier, e.g. 'my-agent-prod'")
    provider: str = Field(description="'langfuse' or 'langsmith'")
    public_key: str = Field(description="Provider public key / project key")
    secret_key: str = Field(description="Provider secret key (encrypted before storage)")
    base_url: str = Field(default="", description="Optional: self-hosted provider URL")


class SourceConfig(BaseModel):
    name: str
    provider: str
    has_credentials: bool
    base_url: str
    created_at: str


class TestResult(BaseModel):
    ok: bool
    message: str


def _source_key(name: str) -> str:
    return f"{_SOURCE_KEY_PREFIX}{name}"


async def _load_source_raw(name: str) -> dict | None:
    raw = await postgres_service.get_setting(_source_key(name))
    return json.loads(raw) if raw else None


async def list_all_sources() -> list[dict]:
    """Return all registered sources with their decrypted credentials.

    Used internally by the cron pull — not exposed in API responses.
    """
    sources = []
    # app_settings has no prefix-scan helper, so we track source names
    # in a separate index key
    index_raw = await postgres_service.get_setting("sources_index")
    if not index_raw:
        return sources

    names = json.loads(index_raw)
    for name in names:
        raw = await _load_source_raw(name)
        if raw:
            try:
                secret = decrypt(raw["secret_key_enc"]) if raw.get("secret_key_enc") else ""
            except Exception:
                secret = ""
            sources.append({
                "name": name,
                "provider": raw.get("provider", "langfuse"),
                "public_key": raw.get("public_key", ""),
                "secret_key": secret,
                "base_url": raw.get("base_url", ""),
            })
    return sources


async def _update_index(name: str, remove: bool = False) -> None:
    raw = await postgres_service.get_setting("sources_index")
    names: list[str] = json.loads(raw) if raw else []
    if remove:
        names = [n for n in names if n != name]
    elif name not in names:
        names.append(name)
    await postgres_service.set_setting("sources_index", json.dumps(names))


@router.post("/settings/sources", response_model=ApiResponse[SourceConfig])
async def add_source(request: AddSourceRequest) -> ApiResponse[SourceConfig]:
    """Register a Langfuse or LangSmith source with encrypted credentials."""
    if not _NAME_RE.match(request.name):
        raise HTTPException(status_code=422, detail="Name must be a lowercase slug (letters, digits, hyphens, underscores)")
    if request.provider not in ("langfuse", "langsmith"):
        raise HTTPException(status_code=422, detail="Provider must be 'langfuse' or 'langsmith'")
    if not encryption_available():
        raise HTTPException(status_code=503, detail="CREDENTIAL_ENCRYPTION_KEY is not configured")

    encrypted_secret = encrypt(request.secret_key)
    created_at = datetime.now(UTC).isoformat()

    payload = {
        "provider": request.provider,
        "public_key": request.public_key,
        "secret_key_enc": encrypted_secret,
        "base_url": request.base_url,
        "created_at": created_at,
    }
    await postgres_service.set_setting(_source_key(request.name), json.dumps(payload))
    await _update_index(request.name)

    logger.info("source_registered", name=request.name, provider=request.provider)
    return ApiResponse(
        data=SourceConfig(
            name=request.name,
            provider=request.provider,
            has_credentials=True,
            base_url=request.base_url,
            created_at=created_at,
        ),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.get("/settings/sources", response_model=ApiResponse[list[SourceConfig]])
async def get_sources() -> ApiResponse[list[SourceConfig]]:
    """List registered sources. Never returns raw credentials."""
    index_raw = await postgres_service.get_setting("sources_index")
    names: list[str] = json.loads(index_raw) if index_raw else []

    configs: list[SourceConfig] = []
    for name in names:
        raw = await _load_source_raw(name)
        if raw:
            configs.append(SourceConfig(
                name=name,
                provider=raw.get("provider", "langfuse"),
                has_credentials=bool(raw.get("secret_key_enc")),
                base_url=raw.get("base_url", ""),
                created_at=raw.get("created_at", ""),
            ))

    return ApiResponse(data=configs, error=None, metadata=ResponseMetadata(request_id=str(uuid.uuid4())))


@router.delete("/settings/sources/{name}", response_model=ApiResponse[dict])
async def delete_source(name: str) -> ApiResponse[dict]:
    """Remove a registered source and its encrypted credentials."""
    existing = await _load_source_raw(name)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Source '{name}' not found")

    await postgres_service.set_setting(_source_key(name), "")
    await _update_index(name, remove=True)
    logger.info("source_deleted", name=name)
    return ApiResponse(data={"deleted": name}, error=None, metadata=ResponseMetadata(request_id=str(uuid.uuid4())))


@router.post("/settings/sources/{name}/test", response_model=ApiResponse[TestResult])
async def test_source(name: str) -> ApiResponse[TestResult]:
    """Test connectivity for a registered source using its stored credentials."""
    raw = await _load_source_raw(name)
    if not raw:
        raise HTTPException(status_code=404, detail=f"Source '{name}' not found")

    try:
        secret_key = decrypt(raw["secret_key_enc"])
    except Exception as exc:
        return ApiResponse(
            data=TestResult(ok=False, message="Failed to decrypt stored credentials"),
            error=None,
            metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
        )

    provider = raw.get("provider", "langfuse")
    public_key = raw.get("public_key", "")
    base_url = raw.get("base_url", "")

    try:
        if provider == "langfuse":
            result = await _test_langfuse(public_key, secret_key, base_url)
        elif provider == "langsmith":
            result = await _test_langsmith(secret_key)
        else:
            result = TestResult(ok=False, message=f"Unknown provider: {provider}")
    except Exception as exc:
        result = TestResult(ok=False, message=str(exc))

    logger.info("source_test_complete", name=name, ok=result.ok)
    return ApiResponse(data=result, error=None, metadata=ResponseMetadata(request_id=str(uuid.uuid4())))


def _friendly_error(exc: Exception) -> str:
    """Convert a raw exception into a user-readable message."""
    msg = str(exc).lower()
    if "401" in msg or "403" in msg or "unauthorized" in msg or "forbidden" in msg or "invalid" in msg:
        return "Invalid credentials. Please check your keys and try again."
    if "404" in msg or "not found" in msg:
        return "Project not found. Check that the key belongs to an existing project."
    if "connect" in msg or "timeout" in msg or "network" in msg or "connection" in msg:
        return "Could not connect. Check the base URL and your network connection."
    if "ssl" in msg or "certificate" in msg:
        return "SSL error. Check that the base URL uses HTTPS."
    return "Connection failed. Please verify your credentials and try again."


async def _test_langfuse(public_key: str, secret_key: str, base_url: str) -> TestResult:
    """Test Langfuse connectivity using a lightweight health check (no trace data fetched)."""
    from app.providers.langfuse_provider import LangfuseProvider
    host = base_url or "https://us.cloud.langfuse.com"
    provider = LangfuseProvider(public_key=public_key, secret_key=secret_key, host=host)
    try:
        result = await provider.health_check()
        if result.get("status") == "ok":
            return TestResult(ok=True, message="Connected to Langfuse.")
        return TestResult(ok=False, message=_friendly_error(Exception(result.get("detail", ""))))
    except Exception as exc:
        return TestResult(ok=False, message=_friendly_error(exc))


async def _test_langsmith(api_key: str) -> TestResult:
    """Test LangSmith connectivity by listing projects."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.smith.langchain.com/api/v1/workspaces",
                headers={"x-api-key": api_key},
            )
        if r.status_code == 200:
            return TestResult(ok=True, message="Connected to LangSmith.")
        if r.status_code in (401, 403):
            return TestResult(ok=False, message="Invalid API key. Please check your LangSmith credentials.")
        return TestResult(ok=False, message="Connection failed. Please verify your credentials and try again.")
    except Exception as exc:
        return TestResult(ok=False, message=_friendly_error(exc))


# ── Demo Agent source selection ────────────────────────────────────────────────

_DEMO_SOURCE_KEY = "demo_langfuse_source"


class DemoSourceConfig(BaseModel):
    source_name: str  # "default" or a registered source name


@router.get("/settings/demo-source", response_model=ApiResponse[DemoSourceConfig])
async def get_demo_source() -> ApiResponse[DemoSourceConfig]:
    """Return which registered source the Demo Agent uses for Aethen analysis."""
    source_name = await postgres_service.get_setting(_DEMO_SOURCE_KEY) or "default"
    return ApiResponse(
        data=DemoSourceConfig(source_name=source_name),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.post("/settings/demo-source", response_model=ApiResponse[dict])
async def set_demo_source(config: DemoSourceConfig) -> ApiResponse[dict]:
    """Set which registered source the Demo Agent uses for Aethen analysis.

    Use "default" to fall back to LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY env vars.
    Any other value must be a registered source name in /api/settings/sources.
    """
    if config.source_name != "default":
        existing = await _load_source_raw(config.source_name)
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"Source '{config.source_name}' not found. Register it first.",
            )

    await postgres_service.set_setting(_DEMO_SOURCE_KEY, config.source_name)
    logger.info("demo_source_updated", source_name=config.source_name)
    return ApiResponse(
        data={"source_name": config.source_name},
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )
