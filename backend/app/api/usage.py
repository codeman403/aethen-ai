"""Usage & quota endpoints.

GET  /api/usage          — current org's usage + quota limits
GET  /api/usage/history  — last 3 months of usage
PATCH /api/admin/quota   — admin: override quota for an org
"""

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service
from app.utils.request_context import get_data_org_id

router = APIRouter(tags=["usage"])
logger = structlog.get_logger()


class TrialStatus(BaseModel):
    in_trial: bool
    trial_expired: bool
    converted: bool
    trial_ends_at: str | None
    days_remaining: int


class UsageResponse(BaseModel):
    period: str
    sessions_ingested: int
    sessions_limit: int
    analysis_runs: int
    analysis_runs_limit: int
    sessions_pct: float = Field(description="0-100")
    analysis_pct: float = Field(description="0-100")
    trial: TrialStatus | None = None


class QuotaOverrideRequest(BaseModel):
    org_id: str
    sessions_per_month: int = Field(ge=0)
    analysis_runs_per_month: int = Field(ge=0)


@router.get("/usage", response_model=ApiResponse[UsageResponse])
async def get_usage(request: Request) -> ApiResponse[UsageResponse]:
    """Return current-period usage and quota limits for the caller's org."""
    is_admin = getattr(request.state, "is_admin", False)
    org_id = get_data_org_id(request)

    if is_admin:
        # Admins have unlimited quota — show real usage, no limit enforced
        from app.utils.request_context import get_actor_org_id
        actor_org_id = get_actor_org_id(request)
        if actor_org_id:
            usage = await postgres_service.get_org_usage(actor_org_id)
            return ApiResponse(data=UsageResponse(
                period=usage["period"],
                sessions_ingested=usage["sessions_ingested"],
                sessions_limit=0,   # 0 = unlimited
                analysis_runs=usage["analysis_runs"],
                analysis_runs_limit=0,
                sessions_pct=0,
                analysis_pct=0,
                trial=None,
            ))
        return ApiResponse(data=UsageResponse(
            period=postgres_service._current_period(),
            sessions_ingested=0, sessions_limit=0,
            analysis_runs=0, analysis_runs_limit=0,
            sessions_pct=0, analysis_pct=0,
        ))

    trial = await postgres_service.get_trial_status(org_id)

    # Apply trial limits when in trial
    if trial["in_trial"]:
        sessions_limit  = postgres_service._TRIAL_SESSIONS
        analysis_limit  = postgres_service._TRIAL_ANALYSIS
    else:
        quota = await postgres_service.get_org_quota(org_id)
        sessions_limit  = quota["sessions_per_month"]
        analysis_limit  = quota["analysis_runs_per_month"]

    usage = await postgres_service.get_org_usage(org_id)

    sessions_pct = (usage["sessions_ingested"] / sessions_limit * 100) if sessions_limit else 0
    analysis_pct = (usage["analysis_runs"] / analysis_limit * 100) if analysis_limit else 0

    return ApiResponse(data=UsageResponse(
        period=usage["period"],
        sessions_ingested=usage["sessions_ingested"],
        sessions_limit=sessions_limit,
        analysis_runs=usage["analysis_runs"],
        analysis_runs_limit=analysis_limit,
        sessions_pct=round(min(sessions_pct, 100), 1),
        analysis_pct=round(min(analysis_pct, 100), 1),
        trial=TrialStatus(**trial),
    ))


@router.get("/usage/history", response_model=ApiResponse[list[UsageResponse]])
async def get_usage_history(request: Request) -> ApiResponse[list[UsageResponse]]:
    """Return the last 3 months of usage for the caller's org."""
    org_id = get_data_org_id(request)
    if not org_id:
        return ApiResponse(data=[])

    from datetime import datetime, timezone

    quota = await postgres_service.get_org_quota(org_id)
    now = datetime.now(timezone.utc)
    periods = []
    for i in range(3):
        m = now.month - i
        y = now.year
        if m <= 0:
            m += 12
            y -= 1
        periods.append(f"{y:04d}-{m:02d}")

    history = []
    for period in periods:
        usage = await postgres_service.get_org_usage(org_id, period=period)
        sessions_pct = (usage["sessions_ingested"] / quota["sessions_per_month"] * 100) if quota["sessions_per_month"] else 0
        analysis_pct = (usage["analysis_runs"] / quota["analysis_runs_per_month"] * 100) if quota["analysis_runs_per_month"] else 0
        history.append(UsageResponse(
            period=period,
            sessions_ingested=usage["sessions_ingested"],
            sessions_limit=quota["sessions_per_month"],
            analysis_runs=usage["analysis_runs"],
            analysis_runs_limit=quota["analysis_runs_per_month"],
            sessions_pct=round(min(sessions_pct, 100), 1),
            analysis_pct=round(min(analysis_pct, 100), 1),
        ))
    return ApiResponse(data=history)


@router.patch("/admin/quota", response_model=ApiResponse[dict])
async def override_quota(body: QuotaOverrideRequest, request: Request) -> ApiResponse[dict]:
    """Admin only: set custom quota limits for an org."""
    is_admin = getattr(request.state, "is_admin", False)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    await postgres_service.set_org_quota(
        body.org_id,
        body.sessions_per_month,
        body.analysis_runs_per_month,
    )
    logger.info("quota_overridden", org_id=body.org_id,
                sessions=body.sessions_per_month, analysis=body.analysis_runs_per_month)
    return ApiResponse(data={"ok": True})
