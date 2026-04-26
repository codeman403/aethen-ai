"""Dashboard statistics endpoint.

Postgres (Supabase) is the primary source — it is the single source of truth
for session counts, failure breakdown, and time-series data.

Neo4j is NOT queried here. Its role is graph traversal (cross-session patterns,
blind spot clusters), not aggregate counting.
"""

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()

router = APIRouter(tags=["stats"])


class FailureBreakdown(BaseModel):
    memory: int = 0
    tool_misfire: int = 0
    hallucination: int = 0
    blind_spot: int = 0


class DashboardStats(BaseModel):
    """Aggregated metrics for the dashboard."""

    total_sessions: int = Field(default=0, description="Total ingested sessions")
    failure_breakdown: FailureBreakdown = Field(default_factory=FailureBreakdown)
    recent_sessions: int = Field(default=0, description="Sessions in last 7 days")
    daily_counts: list[int] = Field(default_factory=lambda: [0] * 7, description="Daily failure counts (last 7 days)")
    reliability_score: int = Field(default=100, description="Platform reliability score 0-100")


@router.get("/stats", response_model=ApiResponse[DashboardStats])
async def get_dashboard_stats() -> ApiResponse[DashboardStats]:
    """Return aggregated dashboard metrics from Postgres."""
    if not postgres_service.is_available:
        logger.warning("stats_postgres_unavailable")
        return ApiResponse(data=DashboardStats())

    try:
        aggregated = await postgres_service.compute_stats()
        breakdown = aggregated["failure_breakdown"]
        total = aggregated["total_sessions"]
        failed = sum(breakdown.values())
        reliability_score = round(100 * (total - failed) / total) if total > 0 else 100

        stats = DashboardStats(
            total_sessions=total,
            failure_breakdown=FailureBreakdown(**breakdown),
            recent_sessions=aggregated["recent_sessions"],
            daily_counts=aggregated["daily_counts"],
            reliability_score=max(0, min(100, reliability_score)),
        )
    except Exception as exc:
        logger.error("stats_postgres_error", error=str(exc))
        stats = DashboardStats()

    return ApiResponse(data=stats)
