"""Admin API endpoints — all routes require is_admin = True.

GET  /api/admin/orgs              — list all orgs with usage + member count
GET  /api/admin/orgs/{org_id}     — detail: members, usage history, quota
PATCH /api/admin/orgs/{org_id}    — update org name
GET  /api/admin/orgs/{org_id}/members — list members
DELETE /api/admin/orgs/{org_id}/members/{user_id} — remove member
PATCH /api/admin/quota            — override quota for an org (also in usage.py)
GET  /api/admin/stats             — platform-wide aggregate stats
"""

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service

router = APIRouter(tags=["admin"], prefix="/admin")
logger = structlog.get_logger()


def _require_admin(request: Request) -> None:
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")


# ── Models ─────────────────────────────────────────────────────────────────

class OrgSummary(BaseModel):
    org_id: str
    org_name: str
    org_slug: str
    member_count: int
    session_count: int
    sessions_this_month: int
    sessions_limit: int
    analysis_this_month: int
    analysis_limit: int
    created_at: str | None


class OrgDetail(BaseModel):
    org_id: str
    org_name: str
    org_slug: str
    created_at: str | None
    members: list[dict]
    usage_history: list[dict]
    quota: dict


class PlatformStats(BaseModel):
    total_orgs: int
    total_users: int
    total_sessions: int
    unassigned_sessions: int
    sessions_this_month: int
    analysis_this_month: int


class UpdateOrgRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class QuotaOverrideRequest(BaseModel):
    org_id: str
    sessions_per_month: int = Field(ge=0)
    analysis_runs_per_month: int = Field(ge=0)


# ── Helpers ────────────────────────────────────────────────────────────────

async def _all_orgs_with_usage() -> list[dict]:
    """Return orgs joined with current-period usage and session count."""
    if not postgres_service.is_available:
        return []
    period = postgres_service._current_period()
    async with postgres_service._pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                o.id::TEXT    AS org_id,
                o.name        AS org_name,
                o.slug        AS org_slug,
                o.created_at,
                (SELECT COUNT(*) FROM profiles   WHERE org_id = o.id)                                          AS member_count,
                (SELECT COUNT(*) FROM sessions   WHERE org_id = o.id)                                          AS session_count,
                COALESCE((SELECT sessions_ingested   FROM org_usage  WHERE org_id = o.id::TEXT AND period = $1), 0) AS sessions_this_month,
                COALESCE((SELECT analysis_runs       FROM org_usage  WHERE org_id = o.id::TEXT AND period = $1), 0) AS analysis_this_month,
                COALESCE((SELECT sessions_per_month  FROM org_quotas WHERE org_id = o.id::TEXT), 1000)         AS sessions_limit,
                COALESCE((SELECT analysis_runs_per_month FROM org_quotas WHERE org_id = o.id::TEXT), 1000)     AS analysis_limit
            FROM organizations o
            ORDER BY o.created_at DESC
            """,
            period,
        )
    return [dict(r) for r in rows]


# ── Routes ─────────────────────────────────────────────────────────────────

@router.get("/orgs", response_model=ApiResponse[list[OrgSummary]])
async def list_orgs(request: Request) -> ApiResponse[list[OrgSummary]]:
    """List all organisations with member count, session count, and current usage."""
    _require_admin(request)
    rows = await _all_orgs_with_usage()
    orgs = [
        OrgSummary(
            org_id=str(r["org_id"]),
            org_name=r["org_name"],
            org_slug=r["org_slug"],
            member_count=r["member_count"],
            session_count=r["session_count"],
            sessions_this_month=r["sessions_this_month"],
            sessions_limit=r["sessions_limit"],
            analysis_this_month=r["analysis_this_month"],
            analysis_limit=r["analysis_limit"],
            created_at=r["created_at"].isoformat() if r["created_at"] else None,
        )
        for r in rows
    ]
    return ApiResponse(data=orgs)


@router.get("/orgs/{org_id}", response_model=ApiResponse[OrgDetail])
async def get_org(org_id: str, request: Request) -> ApiResponse[OrgDetail]:
    """Get full org detail: members, quota, usage history."""
    _require_admin(request)
    if not postgres_service.is_available:
        raise HTTPException(status_code=503, detail="Database unavailable")

    async with postgres_service._pool.acquire() as conn:
        org_row = await conn.fetchrow(
            "SELECT id, name, slug, created_at FROM organizations WHERE id = $1::uuid",
            org_id,
        )
        if not org_row:
            raise HTTPException(status_code=404, detail="Org not found")

        members = await conn.fetch(
            """
            SELECT p.id AS user_id, p.full_name, p.role, p.welcomed_at,
                   u.email, u.created_at AS signed_up_at
            FROM profiles p
            JOIN auth.users u ON u.id = p.id
            WHERE p.org_id::TEXT = $1
            ORDER BY p.role, p.full_name
            """,
            org_id,
        )

        usage_rows = await conn.fetch(
            """
            SELECT period, sessions_ingested, analysis_runs
            FROM org_usage WHERE org_id = $1
            ORDER BY period DESC LIMIT 6
            """,
            org_id,
        )

    quota = await postgres_service.get_org_quota(org_id)

    return ApiResponse(data=OrgDetail(
        org_id=str(org_row["id"]),
        org_name=org_row["name"],
        org_slug=org_row["slug"],
        created_at=org_row["created_at"].isoformat() if org_row["created_at"] else None,
        members=[
            {
                "user_id": str(m["user_id"]),
                "full_name": m["full_name"],
                "email": m["email"],
                "role": m["role"],
                "signed_up_at": m["signed_up_at"].isoformat() if m["signed_up_at"] else None,
            }
            for m in members
        ],
        usage_history=[dict(r) for r in usage_rows],
        quota=quota,
    ))


@router.patch("/orgs/{org_id}", response_model=ApiResponse[dict])
async def update_org(org_id: str, body: UpdateOrgRequest, request: Request) -> ApiResponse[dict]:
    """Rename an organisation."""
    _require_admin(request)
    if not postgres_service.is_available:
        raise HTTPException(status_code=503, detail="Database unavailable")
    async with postgres_service._pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE organizations SET name = $1 WHERE id = $2::uuid",
            body.name, org_id,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Org not found")
    logger.info("admin_org_renamed", org_id=org_id, name=body.name)
    return ApiResponse(data={"ok": True})



@router.delete("/orgs/{org_id}/members/{user_id}", response_model=ApiResponse[dict])
async def remove_member(org_id: str, user_id: str, request: Request) -> ApiResponse[dict]:
    """Remove a user from an organisation."""
    _require_admin(request)
    if not postgres_service.is_available:
        raise HTTPException(status_code=503, detail="Database unavailable")
    async with postgres_service._pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM profiles WHERE id = $1::uuid AND org_id::TEXT = $2",
            user_id, org_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Member not found in this org")
    logger.info("admin_member_removed", org_id=org_id, user_id=user_id)
    return ApiResponse(data={"ok": True})


@router.patch("/quota", response_model=ApiResponse[dict])
async def override_quota(body: QuotaOverrideRequest, request: Request) -> ApiResponse[dict]:
    """Override quota limits for an org."""
    _require_admin(request)
    await postgres_service.set_org_quota(
        body.org_id, body.sessions_per_month, body.analysis_runs_per_month
    )
    logger.info("admin_quota_overridden", org_id=body.org_id,
                sessions=body.sessions_per_month, analysis=body.analysis_runs_per_month)
    return ApiResponse(data={"ok": True})


@router.get("/stats", response_model=ApiResponse[PlatformStats])
async def platform_stats(request: Request) -> ApiResponse[PlatformStats]:
    """Platform-wide aggregate statistics."""
    _require_admin(request)
    if not postgres_service.is_available:
        return ApiResponse(data=PlatformStats(
            total_orgs=0, total_users=0, total_sessions=0,
            unassigned_sessions=0, sessions_this_month=0, analysis_this_month=0,
        ))
    period = postgres_service._current_period()
    async with postgres_service._pool.acquire() as conn:
        total_orgs = await conn.fetchval("SELECT COUNT(*) FROM organizations") or 0
        total_users = await conn.fetchval("SELECT COUNT(*) FROM profiles") or 0
        total_sessions = await conn.fetchval("SELECT COUNT(*) FROM sessions") or 0
        unassigned_sessions = await conn.fetchval("SELECT COUNT(*) FROM sessions WHERE org_id IS NULL") or 0
        sessions_this_month = await conn.fetchval(
            "SELECT COALESCE(SUM(sessions_ingested), 0) FROM org_usage WHERE period = $1", period
        ) or 0
        analysis_this_month = await conn.fetchval(
            "SELECT COALESCE(SUM(analysis_runs), 0) FROM org_usage WHERE period = $1", period
        ) or 0
    return ApiResponse(data=PlatformStats(
        total_orgs=total_orgs,
        total_users=total_users,
        total_sessions=total_sessions,
        unassigned_sessions=unassigned_sessions,
        sessions_this_month=sessions_this_month,
        analysis_this_month=analysis_this_month,
    ))
