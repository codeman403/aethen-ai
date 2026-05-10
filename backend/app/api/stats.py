"""Dashboard statistics endpoint.

Postgres (Supabase) is the primary source — it is the single source of truth
for session counts, failure breakdown, and time-series data.

Neo4j is NOT queried here. Its role is graph traversal (cross-session patterns,
blind spot clusters), not aggregate counting.
"""

import structlog
from app.utils.request_context import get_data_org_id
from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service
from app.services.neo4j_service import neo4j_service

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
    today_sessions: int = Field(default=0, description="Sessions in last 24 hours")
    daily_counts: list[int] = Field(default_factory=lambda: [0] * 7, description="Daily failure counts (last 7 days)")
    reliability_score: int = Field(default=100, description="Platform reliability score 0-100")
    reliability_score_7d: int = Field(default=100, description="Reliability score for last 7 days")
    daily_by_type: FailureBreakdown = Field(default_factory=FailureBreakdown, description="Failure counts in last 24 hours by type")


@router.get("/stats", response_model=ApiResponse[DashboardStats])
async def get_dashboard_stats(request: Request) -> ApiResponse[DashboardStats]:
    """Return aggregated dashboard metrics from Postgres."""
    if not postgres_service.is_available:
        logger.warning("stats_postgres_unavailable")
        return ApiResponse(data=DashboardStats())

    org_id = get_data_org_id(request)

    try:
        aggregated = await postgres_service.compute_stats(org_id=org_id)
        breakdown = aggregated["failure_breakdown"]
        total = aggregated["total_sessions"]
        failed = sum(breakdown.values())
        reliability_score = round(100 * (total - failed) / total) if total > 0 else 100
        recent = aggregated["recent_sessions"]
        recent_failed = aggregated.get("recent_failed", 0)
        reliability_7d = round(100 * (recent - recent_failed) / recent) if recent > 0 else 100

        stats = DashboardStats(
            total_sessions=total,
            failure_breakdown=FailureBreakdown(**breakdown),
            recent_sessions=recent,
            today_sessions=aggregated.get("today_sessions", 0),
            daily_counts=aggregated["daily_counts"],
            reliability_score=max(0, min(100, reliability_score)),
            reliability_score_7d=max(0, min(100, reliability_7d)),
            daily_by_type=FailureBreakdown(**aggregated.get("daily_by_type", {})),
        )
    except Exception as exc:
        logger.error("stats_postgres_error", error=str(exc))
        stats = DashboardStats()

    return ApiResponse(data=stats)


class TrendPoint(BaseModel):
    date: str
    memory: int = 0
    tool_misfire: int = 0
    hallucination: int = 0
    blind_spot: int = 0
    total: int = 0


class TrendResponse(BaseModel):
    points: list[TrendPoint]
    days: int


@router.get("/stats/trends", response_model=ApiResponse[TrendResponse])
async def get_failure_trends(request: Request, days: int = Query(default=30, ge=7, le=90)) -> ApiResponse[TrendResponse]:
    """Return per-failure-type daily counts over the requested window."""
    if not postgres_service.is_available:
        return ApiResponse(data=TrendResponse(points=[], days=days))
    org_id = get_data_org_id(request)
    try:
        points = await postgres_service.compute_trends(days, org_id=org_id)
        return ApiResponse(data=TrendResponse(points=[TrendPoint(**p) for p in points], days=days))
    except Exception as exc:
        logger.error("trends_error", error=str(exc))
        return ApiResponse(data=TrendResponse(points=[], days=days))


class BlindSpotPattern(BaseModel):
    topic: str
    count: int

class FailureCluster(BaseModel):
    failure_type: str
    session_count: int
    sample_ids: list[str] = []
    agents: list[str] = []

class AgentFailureRow(BaseModel):
    agent: str
    failure_type: str
    count: int
    total_sessions: int = 0

class ModelFailureRow(BaseModel):
    model: str
    failure_type: str
    count: int

class PatternsResponse(BaseModel):
    blind_spots: list[BlindSpotPattern] = []
    clusters: list[FailureCluster] = []
    agent_failures: list[AgentFailureRow] = []
    model_failures: list[ModelFailureRow] = []
    neo4j_available: bool = False


@router.get("/stats/patterns", response_model=ApiResponse[PatternsResponse])
async def get_patterns(request: Request) -> ApiResponse[PatternsResponse]:
    """Return cross-session failure patterns from Neo4j graph."""
    org_id = get_data_org_id(request)

    # Only query Neo4j if the org has ingested sessions — prevents leaking
    # global graph data to orgs that have no data of their own yet.
    if org_id:
        org_session_count = await postgres_service.count_sessions(org_id=org_id)
        if org_session_count == 0:
            return ApiResponse(data=PatternsResponse(neo4j_available=False))

    if not neo4j_service.is_available:
        return ApiResponse(data=PatternsResponse(neo4j_available=False))
    try:
        data = await neo4j_service.get_failure_patterns()
        return ApiResponse(data=PatternsResponse(
            blind_spots=[BlindSpotPattern(**b) for b in data["blind_spots"]],
            clusters=[FailureCluster(**c) for c in data["clusters"]],
            agent_failures=[AgentFailureRow(**r) for r in data["agent_failures"]],
            model_failures=[ModelFailureRow(**r) for r in data["model_failures"]],
            neo4j_available=True,
        ))
    except Exception as exc:
        logger.error("patterns_error", error=str(exc))
        return ApiResponse(data=PatternsResponse(neo4j_available=False))


class AgentProfile(BaseModel):
    agent_id: str
    total: int
    total_failures: int
    memory: int = 0
    tool_misfire: int = 0
    hallucination: int = 0
    blind_spot: int = 0
    success_rate: float = 100.0
    last_seen: str | None = None


@router.get("/stats/agents", response_model=ApiResponse[list[AgentProfile]])
async def get_agent_profiles(request: Request) -> ApiResponse[list[AgentProfile]]:
    """Return per-agent failure breakdown from Postgres."""
    if not postgres_service.is_available:
        return ApiResponse(data=[])
    org_id = get_data_org_id(request)
    try:
        rows = await postgres_service.get_agent_profiles(org_id=org_id)
        return ApiResponse(data=[AgentProfile(**r) for r in rows])
    except Exception as exc:
        logger.error("agent_profiles_error", error=str(exc))
        return ApiResponse(data=[])


class RecommendationItem(BaseModel):
    session_id: str
    agent_id: str
    failure_type: str | None = None
    session_ts: str | None = None
    title: str
    severity: str
    recommendation: str


@router.get("/stats/recommendations", response_model=ApiResponse[list[RecommendationItem]])
async def get_recommendations(request: Request) -> ApiResponse[list[RecommendationItem]]:
    """Return aggregated recommendations from cached analysis reports."""
    if not postgres_service.is_available:
        return ApiResponse(data=[])
    org_id = get_data_org_id(request)
    try:
        rows = await postgres_service.get_recommendations(org_id=org_id)
        return ApiResponse(data=[RecommendationItem(**r) for r in rows])
    except Exception as exc:
        logger.error("recommendations_error", error=str(exc))
        return ApiResponse(data=[])
