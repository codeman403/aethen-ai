"""Webhook management and delivery.

POST   /api/webhooks         — register a webhook endpoint for the org
GET    /api/webhooks         — list webhooks for the org
DELETE /api/webhooks/{id}    — remove a webhook
POST   /api/webhooks/{id}/test — send a test ping

Events delivered:
  analysis.completed      — every LangGraph analysis finishes
  high_confidence_failure — analysis confidence >= 0.7 and failure found
  ingest.completed        — batch ingest finishes

Payload: HMAC-SHA256 signed with the webhook secret (X-Aethen-Signature header).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, HttpUrl

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service
from app.utils.request_context import get_actor_org_id

router = APIRouter(tags=["webhooks"])
logger = structlog.get_logger()

_SUPPORTED_EVENTS = frozenset({
    "analysis.completed",
    "high_confidence_failure",
    "ingest.completed",
    "daily.digest",
})

_HIGH_CONFIDENCE_THRESHOLD = 0.7


# ── DB setup ───────────────────────────────────────────────────────────────

_CREATE_WEBHOOKS_TABLE = """
CREATE TABLE IF NOT EXISTS org_webhooks (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    org_id     TEXT NOT NULL,
    url        TEXT NOT NULL,
    secret     TEXT NOT NULL,
    events     TEXT[] NOT NULL DEFAULT '{}',
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_webhooks_org_id ON org_webhooks (org_id);
"""


async def _ensure_table() -> None:
    if not postgres_service.is_available:
        return
    async with postgres_service._pool.acquire() as conn:
        await conn.execute(_CREATE_WEBHOOKS_TABLE)


# ── Models ─────────────────────────────────────────────────────────────────

class WebhookCreateRequest(BaseModel):
    url: HttpUrl
    events: list[str] = Field(default_factory=lambda: list(_SUPPORTED_EVENTS))
    secret: str | None = None  # auto-generated if omitted


class WebhookResponse(BaseModel):
    id: str
    url: str
    events: list[str]
    active: bool
    created_at: str


# ── HMAC signature ─────────────────────────────────────────────────────────

def _sign_payload(secret: str, payload: bytes) -> str:
    """Return HMAC-SHA256 hex digest."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def _is_discord(url: str) -> bool:
    return "discord.com/api/webhooks" in url


def _discord_payload(event: str, data: dict) -> bytes:
    """Format an event as a Discord embed message."""
    color_map = {
        "analysis.completed":      0x6366F1,   # indigo
        "high_confidence_failure":  0xEF4444,   # red
        "ingest.completed":         0x10B981,   # green
        "ping":                     0x6366F1,
        "daily.digest":             0x0EA5E9,   # sky blue
    }
    color = color_map.get(event, 0x6366F1)
    description = data.get("summary") or data.get("message") or f"Event: `{event}`"
    fields = []
    if "failure_type" in data and data["failure_type"] not in (None, "unknown"):
        fields.append({"name": "Failure Type", "value": data["failure_type"], "inline": True})
    if "confidence" in data:
        fields.append({"name": "Confidence", "value": f"{data['confidence']:.0%}", "inline": True})
    if "sessions_ingested" in data:
        fields.append({"name": "Sessions Ingested", "value": str(data["sessions_ingested"]), "inline": True})
    embed = {
        "title": f"Aethen · {event.replace('.', ' ').title()}",
        "description": str(description)[:500],
        "color": color,
        "fields": fields,
        "footer": {"text": "Aethen Agent Reliability Studio"},
        "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
    }
    return json.dumps({"embeds": [embed]}).encode()


# ── Delivery ───────────────────────────────────────────────────────────────

async def deliver_event(org_id: str, event: str, data: dict) -> None:
    """Deliver a webhook event to all active endpoints for an org.

    Silently skips if org has no webhooks or the event is not subscribed.
    Delivery is best-effort — failures are logged but not retried.
    """
    if not postgres_service.is_available:
        return
    async with postgres_service._pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, url, secret FROM org_webhooks WHERE org_id = $1 AND active = TRUE AND $2 = ANY(events)",
            org_id, event,
        )
    if not rows:
        return

    std_payload = json.dumps({
        "id": uuid.uuid4().hex,
        "event": event,
        "timestamp": int(time.time()),
        "data": data,
    }).encode()

    async with httpx.AsyncClient(timeout=10.0) as client:
        for row in rows:
            # Discord webhooks require their own embed format
            payload = _discord_payload(event, data) if _is_discord(row["url"]) else std_payload
            sig = _sign_payload(row["secret"], payload)
            try:
                resp = await client.post(
                    row["url"],
                    content=payload,
                    headers={
                        "Content-Type": "application/json",
                        "X-Aethen-Signature": f"sha256={sig}",
                        "X-Aethen-Event": event,
                    },
                )
                logger.info("webhook_delivered", webhook_id=row["id"], event_type=event, status=resp.status_code)
            except Exception as exc:
                logger.warning("webhook_delivery_failed", webhook_id=row["id"], event_type=event, error=str(exc))


# ── Routes ─────────────────────────────────────────────────────────────────

@router.post("/webhooks", response_model=ApiResponse[WebhookResponse])
async def create_webhook(body: WebhookCreateRequest, request: Request) -> ApiResponse[WebhookResponse]:
    """Register a new webhook endpoint for the caller's org."""
    await _ensure_table()
    org_id = get_actor_org_id(request)
    if not org_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    invalid = [e for e in body.events if e not in _SUPPORTED_EVENTS]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Unsupported events: {invalid}. Valid: {sorted(_SUPPORTED_EVENTS)}")

    secret = body.secret or secrets.token_hex(32)
    webhook_id = str(uuid.uuid4())

    async with postgres_service._pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO org_webhooks (id, org_id, url, secret, events) VALUES ($1, $2, $3, $4, $5)",
            webhook_id, org_id, str(body.url), secret, body.events,
        )
        row = await conn.fetchrow("SELECT * FROM org_webhooks WHERE id = $1", webhook_id)

    logger.info("webhook_created", org_id=org_id, url=str(body.url), events=body.events)
    return ApiResponse(data=WebhookResponse(
        id=row["id"], url=row["url"], events=list(row["events"]),
        active=row["active"],
        created_at=row["created_at"].isoformat(),
    ))


class WebhookUpdateRequest(BaseModel):
    url: HttpUrl | None = None
    events: list[str] | None = None


@router.patch("/webhooks/{webhook_id}", response_model=ApiResponse[WebhookResponse])
async def update_webhook(
    webhook_id: str, body: WebhookUpdateRequest, request: Request
) -> ApiResponse[WebhookResponse]:
    """Update a webhook's URL and/or subscribed events."""
    await _ensure_table()
    org_id = get_actor_org_id(request)
    if not org_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    if body.events is not None:
        invalid = [e for e in body.events if e not in _SUPPORTED_EVENTS]
        if invalid:
            raise HTTPException(status_code=422, detail=f"Unsupported events: {invalid}")

    async with postgres_service._pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM org_webhooks WHERE id = $1 AND org_id = $2",
            webhook_id, org_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Webhook not found")

        new_url    = str(body.url) if body.url else row["url"]
        new_events = body.events if body.events is not None else list(row["events"])

        updated = await conn.fetchrow(
            """UPDATE org_webhooks SET url = $1, events = $2
               WHERE id = $3 AND org_id = $4
               RETURNING id, url, events, active, created_at""",
            new_url, new_events, webhook_id, org_id,
        )
    logger.info("webhook_updated", webhook_id=webhook_id)
    return ApiResponse(data=WebhookResponse(
        id=updated["id"], url=updated["url"], events=list(updated["events"]),
        active=updated["active"], created_at=updated["created_at"].isoformat(),
    ))


@router.get("/webhooks", response_model=ApiResponse[list[WebhookResponse]])
async def list_webhooks(request: Request) -> ApiResponse[list[WebhookResponse]]:
    """List all webhook endpoints for the caller's org."""
    await _ensure_table()
    org_id = get_actor_org_id(request)
    if not org_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    async with postgres_service._pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, url, events, active, created_at FROM org_webhooks WHERE org_id = $1 ORDER BY created_at DESC",
            org_id,
        )
    return ApiResponse(data=[
        WebhookResponse(
            id=r["id"], url=r["url"], events=list(r["events"]),
            active=r["active"], created_at=r["created_at"].isoformat(),
        ) for r in rows
    ])


@router.delete("/webhooks/{webhook_id}", response_model=ApiResponse[dict])
async def delete_webhook(webhook_id: str, request: Request) -> ApiResponse[dict]:
    """Remove a webhook endpoint."""
    org_id = get_actor_org_id(request)
    if not org_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    async with postgres_service._pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM org_webhooks WHERE id = $1 AND org_id = $2",
            webhook_id, org_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Webhook not found")
    return ApiResponse(data={"ok": True})


@router.post("/webhooks/{webhook_id}/test", response_model=ApiResponse[dict])
async def test_webhook(webhook_id: str, request: Request) -> ApiResponse[dict]:
    """Send a test ping to a webhook endpoint."""
    org_id = get_actor_org_id(request)
    if not org_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    async with postgres_service._pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT url, secret FROM org_webhooks WHERE id = $1 AND org_id = $2",
            webhook_id, org_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Webhook not found")

    test_data = {"message": "Webhook test from Aethen. Your endpoint is working correctly."}
    payload = (
        _discord_payload("ping", test_data)
        if _is_discord(row["url"])
        else json.dumps({"id": uuid.uuid4().hex, "event": "ping",
                         "timestamp": int(time.time()), "data": test_data}).encode()
    )
    sig = _sign_payload(row["secret"], payload)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                row["url"],
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Aethen-Signature": f"sha256={sig}",
                    "X-Aethen-Event": "ping",
                },
            )
        return ApiResponse(data={"status_code": resp.status_code, "ok": 200 <= resp.status_code < 300})
    except Exception as exc:
        return ApiResponse(data={"ok": False, "error": str(exc)})
