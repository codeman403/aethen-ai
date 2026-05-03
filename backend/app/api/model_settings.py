"""Model settings endpoints — configure which LLMs are used per role.

GET  /api/settings/models        — current selections + available options
POST /api/settings/models        — update model for a role
POST /api/settings/models/test   — test connectivity for a specific model
"""

import uuid

import httpx
import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings
from app.models.response import ApiResponse, ResponseMetadata
from app.services.postgres_service import postgres_service

router = APIRouter()
logger = structlog.get_logger()

# ── All confirmed-working models across both proxies ───────────────────────

ALL_MODELS = [
    # OpenAI
    {"id": "gpt-4o-mini",       "label": "GPT-4o Mini",       "provider": "openai",    "description": "Fast, cost-efficient — best for routing & classification"},
    {"id": "gpt-4o",            "label": "GPT-4o",             "provider": "openai",    "description": "Full GPT-4o — higher quality analysis"},
    {"id": "gpt-4.1",           "label": "GPT-4.1",            "provider": "openai",    "description": "Latest GPT-4.1 — strongest reasoning"},
    {"id": "gpt-4.1-mini",      "label": "GPT-4.1 Mini",       "provider": "openai",    "description": "GPT-4.1 efficiency tier"},
    {"id": "gpt-4.1-nano",      "label": "GPT-4.1 Nano",       "provider": "openai",    "description": "Fastest, lowest cost"},
    # Anthropic
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6",  "provider": "anthropic", "description": "Balanced — best synthesis quality"},
    {"id": "claude-haiku-4-5",  "label": "Claude Haiku 4.5",   "provider": "anthropic", "description": "Fast, lightweight synthesis"},
]

_ALL_IDS = {m["id"] for m in ALL_MODELS}

# Role → (setting key, default model id)
_ROLES = {
    "analysis":   ("model_analysis",   "gpt-4o-mini"),
    "synthesis":  ("model_synthesis",  "claude-sonnet-4-6"),
    "demo":       ("model_demo",       "gpt-4o-mini"),
}

_ROLE_LABELS = {
    "analysis":  {"title": "Analysis & Routing",  "subtitle": "Intent classification and all 4 analysis module nodes"},
    "synthesis": {"title": "Synthesis & Chat",    "subtitle": "Final synthesis report and freeform Chat Debug"},
    "demo":      {"title": "Demo Agent",          "subtitle": "LLM powering the Demo Agent chat interface"},
}


def _infer_provider(model_id: str) -> str:
    """Determine provider from model ID — claude-* = anthropic, everything else = openai."""
    return "anthropic" if model_id.startswith("claude") else "openai"


# ── Pydantic models ────────────────────────────────────────────────────────

class ModelOption(BaseModel):
    id: str
    label: str
    description: str
    provider: str

class RoleConfig(BaseModel):
    role: str
    role_label: str
    role_subtitle: str
    current_model: str
    current_provider: str
    options: list[ModelOption]

class ModelSettingsResponse(BaseModel):
    roles: list[RoleConfig]

class UpdateModelRequest(BaseModel):
    role: str
    model_id: str

class TestModelRequest(BaseModel):
    model_id: str
    provider: str | None = None  # auto-inferred if not supplied

class TestModelResult(BaseModel):
    ok: bool
    model_id: str
    provider: str
    message: str


# ── Helpers ────────────────────────────────────────────────────────────────

async def _get_model(role: str) -> str:
    setting_key, default = _ROLES[role]
    stored = await postgres_service.get_setting(setting_key)
    return stored or default


async def _test_openai(model_id: str) -> tuple[bool, str]:
    base = settings.openai_base_url.rstrip("/")
    key = settings.openai_api_key
    try:
        with httpx.stream(
            "POST", f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "x-session-id": str(uuid.uuid4())},
            json={"model": model_id, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 3, "stream": True},
            timeout=15,
        ) as resp:
            if resp.status_code == 200:
                return True, f"Connected to {model_id}"
            body = b"".join(list(resp.iter_bytes())[:2]).decode(errors="ignore")[:200]
            err = __import__("json").loads(body).get("error", {}).get("message", body) if body.startswith("{") else body
            return False, str(err)[:120]
    except Exception as exc:
        return False, str(exc)[:120]


async def _test_anthropic(model_id: str) -> tuple[bool, str]:
    url = settings.anthropic_base_url.rstrip("/") + "/v1/messages"
    key = settings.anthropic_api_key
    try:
        with httpx.stream(
            "POST", url,
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "x-session-id": str(uuid.uuid4())},
            json={"model": model_id, "max_tokens": 3, "messages": [{"role": "user", "content": "ping"}], "stream": True},
            timeout=15,
        ) as resp:
            chunk = b"".join(list(resp.iter_bytes())[:3]).decode(errors="ignore")
            if resp.status_code == 200 and "message_start" in chunk:
                return True, f"Connected to {model_id}"
            err_body = chunk[:200]
            try:
                err = __import__("json").loads(err_body).get("error", {}).get("message", err_body)
            except Exception:
                err = err_body
            return False, str(err)[:120]
    except Exception as exc:
        return False, str(exc)[:120]


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/settings/models", response_model=ApiResponse[ModelSettingsResponse])
async def get_model_settings() -> ApiResponse[ModelSettingsResponse]:
    roles = []
    for role in _ROLES:
        current = await _get_model(role)
        labels = _ROLE_LABELS[role]
        roles.append(RoleConfig(
            role=role,
            role_label=labels["title"],
            role_subtitle=labels["subtitle"],
            current_model=current,
            current_provider=_infer_provider(current),
            options=[ModelOption(**m) for m in ALL_MODELS],
        ))
    return ApiResponse(
        data=ModelSettingsResponse(roles=roles),
        metadata=ResponseMetadata(request_id=str(uuid.uuid4()), duration_ms=0),
    )


@router.post("/settings/models", response_model=ApiResponse[dict])
async def update_model_setting(req: UpdateModelRequest) -> ApiResponse[dict]:
    if req.role not in _ROLES:
        return ApiResponse(error=f"Unknown role: {req.role}",
                           metadata=ResponseMetadata(request_id=str(uuid.uuid4()), duration_ms=0))
    if req.model_id not in _ALL_IDS:
        return ApiResponse(error=f"Model {req.model_id!r} is not in the allowed list",
                           metadata=ResponseMetadata(request_id=str(uuid.uuid4()), duration_ms=0))

    setting_key = _ROLES[req.role][0]
    await postgres_service.set_setting(setting_key, req.model_id)
    from app.agents.llm import set_active_model
    set_active_model(req.role, req.model_id)
    logger.info("model_setting_updated", role=req.role, model_id=req.model_id,
                provider=_infer_provider(req.model_id))
    return ApiResponse(
        data={"role": req.role, "model_id": req.model_id, "provider": _infer_provider(req.model_id)},
        metadata=ResponseMetadata(request_id=str(uuid.uuid4()), duration_ms=0),
    )


@router.post("/settings/models/test", response_model=ApiResponse[TestModelResult])
async def test_model_connectivity(req: TestModelRequest) -> ApiResponse[TestModelResult]:
    import time
    start = time.perf_counter()
    provider = req.provider or _infer_provider(req.model_id)
    if provider == "openai":
        ok, message = await _test_openai(req.model_id)
    elif provider == "anthropic":
        ok, message = await _test_anthropic(req.model_id)
    else:
        ok, message = False, f"Unknown provider: {provider}"

    duration_ms = (time.perf_counter() - start) * 1000
    logger.info("model_test_complete", provider=provider, model_id=req.model_id, ok=ok)
    return ApiResponse(
        data=TestModelResult(ok=ok, model_id=req.model_id, provider=provider, message=message),
        metadata=ResponseMetadata(request_id=str(uuid.uuid4()), duration_ms=duration_ms),
    )
