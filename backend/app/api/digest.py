"""Daily digest endpoint — triggered by Vercel Cron.

POST /api/digest/trigger  — Vercel Cron calls this daily at 7am UTC
GET  /api/digest/settings — Get org's digest recipients
PATCH /api/digest/settings — Update org's digest recipients
GET  /api/admin/settings  — Admin: get global batch limits
PATCH /api/admin/settings — Admin: update global batch limits

Security: cron endpoint verified via X-Cron-Secret header (CRON_SECRET env var).
All other endpoints require JWT auth.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service
from app.utils.request_context import get_data_org_id, get_actor_org_id

router = APIRouter(tags=["digest"])
logger = structlog.get_logger()

_SETTING_MAX_BATCH     = "global:max_batch_analysis"
_SETTING_MAX_DAILY     = "global:max_daily_auto_analysis"


# ── Models ─────────────────────────────────────────────────────────────────

class DigestSettings(BaseModel):
    recipients: list[str]  # email addresses


class GlobalLimitsRequest(BaseModel):
    max_batch_analysis: int     = Field(ge=1)
    max_daily_auto_analysis: int = Field(ge=1)


class GlobalLimitsResponse(BaseModel):
    max_batch_analysis: int
    max_daily_auto_analysis: int


# ── Recipients helpers ─────────────────────────────────────────────────────

async def _get_recipients(org_id: str) -> list[str]:
    """Return digest recipients for an org, defaulting to the org owner's email."""
    raw = await postgres_service.get_setting(f"digest_recipients:{org_id}")
    if raw:
        return [e.strip() for e in raw.split(",") if e.strip()]
    # Fallback: org owner email
    if postgres_service.is_available:
        async with postgres_service._pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT u.email FROM auth.users u
                   JOIN profiles p ON p.id = u.id
                   WHERE p.org_id::TEXT = $1 AND p.role = 'owner'
                   LIMIT 1""",
                org_id,
            )
        if row and row["email"]:
            return [row["email"]]
    return []


# ── Daily stats computation ────────────────────────────────────────────────

async def _compute_digest(org_id: str, date: datetime) -> dict:
    """Compute failure stats for a given UTC date."""
    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end   = day_start + timedelta(days=1)

    if not postgres_service.is_available:
        return {}

    async with postgres_service._pool.acquire() as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM sessions WHERE org_id = $1::uuid AND created_at >= $2 AND created_at < $3",
            org_id, day_start, day_end,
        ) or 0

        failures = await conn.fetchval(
            "SELECT COUNT(*) FROM sessions WHERE org_id = $1::uuid AND outcome = 'failure' AND created_at >= $2 AND created_at < $3",
            org_id, day_start, day_end,
        ) or 0

        analyzed = await conn.fetchval(
            "SELECT COUNT(*) FROM sessions WHERE org_id = $1::uuid AND analysis_report IS NOT NULL AND created_at >= $2 AND created_at < $3",
            org_id, day_start, day_end,
        ) or 0

        high_conf = await conn.fetchval(
            """SELECT COUNT(*) FROM sessions
               WHERE org_id = $1::uuid AND analysis_report IS NOT NULL
                 AND (analysis_report->>'confidence')::float >= 0.7
                 AND analysis_report->>'failure_type' NOT IN ('unknown', 'null')
                 AND created_at >= $2 AND created_at < $3""",
            org_id, day_start, day_end,
        ) or 0

        breakdown_rows = await conn.fetch(
            """SELECT failure_type, COUNT(*) AS cnt FROM sessions
               WHERE org_id = $1::uuid AND failure_type IS NOT NULL
                 AND created_at >= $2 AND created_at < $3
               GROUP BY failure_type ORDER BY cnt DESC""",
            org_id, day_start, day_end,
        )
        breakdown = {r["failure_type"]: r["cnt"] for r in breakdown_rows}

        top_agent_row = await conn.fetchrow(
            """SELECT agent_id, COUNT(*) AS cnt FROM sessions
               WHERE org_id = $1::uuid AND outcome = 'failure'
                 AND created_at >= $2 AND created_at < $3
               GROUP BY agent_id ORDER BY cnt DESC LIMIT 1""",
            org_id, day_start, day_end,
        )
        top_agent = top_agent_row["agent_id"] if top_agent_row else ""

    return {
        "total_sessions": total,
        "total_failures": failures,
        "analyzed": analyzed,
        "high_confidence_failures": high_conf,
        "breakdown": breakdown,
        "top_agent": top_agent,
    }


# ── Auto-analysis background task ─────────────────────────────────────────

async def _auto_analyze_org(org_id: str, org_name: str, limit: int) -> int:
    """Analyze unanalyzed failure sessions for an org up to `limit`. Returns count analyzed."""
    if not postgres_service.is_available or limit <= 0:
        return 0

    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    day_start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end   = day_start + timedelta(days=1)

    async with postgres_service._pool.acquire() as conn:
        sessions = await conn.fetch(
            """SELECT session_id, session_data FROM sessions
               WHERE org_id = $1::uuid
                 AND outcome = 'failure'
                 AND failure_type IS NOT NULL
                 AND analysis_report IS NULL
                 AND created_at >= $2 AND created_at < $3
               ORDER BY created_at DESC
               LIMIT $4""",
            org_id, day_start, day_end, limit,
        )

    if not sessions:
        return 0

    analyzed = 0
    import httpx
    backend_url = f"http://localhost:8000"

    # Get org LLM config
    from app.services.llm_key_service import get_config as _get_llm_config
    from app.agents.llm import set_org_llm_context
    set_org_llm_context(await _get_llm_config(org_id))

    from app.agents.graph import analysis_graph
    from app.agents.state import AnalysisReport
    from app.models.trace import Session

    for row in sessions:
        try:
            data = row["session_data"] if isinstance(row["session_data"], dict) else {}
            data["session_id"] = row["session_id"]
            session = Session(**data)

            result = await analysis_graph.ainvoke({"session": session})
            report = AnalysisReport(**result["report"])

            await postgres_service.save_analysis_report(row["session_id"], report.model_dump(mode="json"))
            if report.failure_type and str(report.failure_type) != "unknown":
                await postgres_service.update_failure_type(row["session_id"], str(report.failure_type))
            await postgres_service.increment_usage(org_id, "analysis_runs")
            analyzed += 1
            logger.info("auto_analysis_done", session_id=row["session_id"], org=org_name)
        except Exception as exc:
            logger.warning("auto_analysis_failed", session_id=row["session_id"], error=str(exc))

    return analyzed


# ── Cron trigger ───────────────────────────────────────────────────────────

@router.post("/digest/trigger", response_model=ApiResponse[dict])
async def trigger_digest(request: Request) -> ApiResponse[dict]:
    """Called by Vercel Cron daily. Sends digests + auto-analyzes failure sessions."""
    # Verify cron secret (Vercel sends Authorization: Bearer <secret>)
    auth = request.headers.get("Authorization", "")
    secret = auth.removeprefix("Bearer ").strip()
    if settings.cron_secret and secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Invalid cron secret")

    if not postgres_service.is_available:
        return ApiResponse(data={"ok": False, "error": "DB unavailable"})

    yesterday  = datetime.now(timezone.utc) - timedelta(days=1)
    date_label = yesterday.strftime("%B %d, %Y")
    daily_cap  = await postgres_service.get_global_setting(_SETTING_MAX_DAILY)

    async with postgres_service._pool.acquire() as conn:
        orgs = await conn.fetch("SELECT id::TEXT, name FROM organizations")

    summary = {"orgs_processed": 0, "emails_sent": 0, "webhooks_sent": 0, "sessions_analyzed": 0}

    for org_row in orgs:
        org_id   = org_row["id"]
        org_name = org_row["name"]
        try:
            stats = await _compute_digest(org_id, yesterday)
            if not stats or stats.get("total_sessions", 0) == 0:
                continue

            # Email delivery
            from app.services.email_service import send_daily_digest_email
            recipients = await _get_recipients(org_id)
            for email in recipients:
                await send_daily_digest_email(email, org_name, date_label, stats)
                summary["emails_sent"] += 1

            # Discord / webhook delivery
            from app.api.webhooks import deliver_event
            await deliver_event(org_id, "daily.digest", {"date": date_label, "org": org_name, **stats})
            summary["webhooks_sent"] += 1

            summary["orgs_processed"] += 1

            # Auto-analysis in background — don't block cron response
            asyncio.create_task(_auto_analyze_org(org_id, org_name, daily_cap))

        except Exception as exc:
            logger.error("digest_org_failed", org_id=org_id, error=str(exc))

    logger.info("digest_triggered", **summary)
    return ApiResponse(data=summary)


# ── Digest recipient settings ──────────────────────────────────────────────

@router.get("/digest/settings", response_model=ApiResponse[DigestSettings])
async def get_digest_settings(request: Request) -> ApiResponse[DigestSettings]:
    org_id = get_actor_org_id(request)
    if not org_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    recipients = await _get_recipients(org_id)
    return ApiResponse(data=DigestSettings(recipients=recipients))


@router.patch("/digest/settings", response_model=ApiResponse[DigestSettings])
async def update_digest_settings(body: DigestSettings, request: Request) -> ApiResponse[DigestSettings]:
    org_id = get_actor_org_id(request)
    if not org_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    raw = ",".join(e.strip() for e in body.recipients if e.strip())
    await postgres_service.set_setting(f"digest_recipients:{org_id}", raw)
    return ApiResponse(data=DigestSettings(recipients=body.recipients))


# ── Admin global settings ──────────────────────────────────────────────────

@router.get("/admin/limits", response_model=ApiResponse[GlobalLimitsResponse])
async def get_global_limits(request: Request) -> ApiResponse[GlobalLimitsResponse]:
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return ApiResponse(data=GlobalLimitsResponse(
        max_batch_analysis=await postgres_service.get_global_setting(_SETTING_MAX_BATCH),
        max_daily_auto_analysis=await postgres_service.get_global_setting(_SETTING_MAX_DAILY),
    ))


@router.patch("/admin/limits", response_model=ApiResponse[GlobalLimitsResponse])
async def update_global_limits(body: GlobalLimitsRequest, request: Request) -> ApiResponse[GlobalLimitsResponse]:
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    await postgres_service.set_global_setting(_SETTING_MAX_BATCH,     body.max_batch_analysis)
    await postgres_service.set_global_setting(_SETTING_MAX_DAILY, body.max_daily_auto_analysis)
    logger.info("global_limits_updated", batch=body.max_batch_analysis, daily=body.max_daily_auto_analysis)
    return ApiResponse(data=GlobalLimitsResponse(
        max_batch_analysis=body.max_batch_analysis,
        max_daily_auto_analysis=body.max_daily_auto_analysis,
    ))


# ── Batch limit for current user ──────────────────────────────────────────

@router.get("/digest/batch-limit", response_model=ApiResponse[dict])
async def get_batch_limit(request: Request) -> ApiResponse[dict]:
    """Return the effective batch analysis limit for the calling user."""
    is_admin = getattr(request.state, "is_admin", False)
    if is_admin:
        return ApiResponse(data={"limit": 0, "unlimited": True})   # 0 = unlimited
    limit = await postgres_service.get_global_setting(_SETTING_MAX_BATCH)
    return ApiResponse(data={"limit": limit, "unlimited": False})
