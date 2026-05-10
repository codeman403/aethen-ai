"""Session CRUD endpoints — backed exclusively by PostgreSQL (Supabase).

GET  /api/sessions                  — list all sessions (lightweight summaries)
GET  /api/sessions?failure_type=X   — list sessions of one failure type (full objects)
GET  /api/sessions/{session_id}     — fetch one full session by ID
"""

import structlog
from app.utils.request_context import get_data_org_id
from fastapi import APIRouter, HTTPException, Query, Request

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()

router = APIRouter(tags=["sessions"])


@router.get("/sessions", response_model=ApiResponse[list[dict]])
async def list_sessions(
    request: Request,
    failure_type: str | None = Query(default=None, description="Filter by failure type"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[list[dict]]:
    """Return sessions from Postgres scoped to the caller's org."""
    org_id = get_data_org_id(request)

    if failure_type:
        sessions = await postgres_service.get_by_failure_type(failure_type, org_id=org_id)
        logger.info("sessions_by_type", failure_type=failure_type, count=len(sessions))
        return ApiResponse(data=sessions)

    summaries = await postgres_service.get_all_summaries(limit=limit, offset=offset, org_id=org_id)
    logger.info("sessions_all", count=len(summaries), offset=offset)
    return ApiResponse(data=summaries)


@router.get("/sessions/count", response_model=ApiResponse[int])
async def count_sessions(request: Request) -> ApiResponse[int]:
    """Return total number of sessions in the caller's org."""
    org_id = get_data_org_id(request)
    total = await postgres_service.count_sessions(org_id=org_id)
    return ApiResponse(data=total)


@router.get("/sessions/{session_id}", response_model=ApiResponse[dict])
async def get_session(session_id: str, request: Request) -> ApiResponse[dict]:
    """Return the full session object — only if it belongs to the caller's org."""
    org_id = get_data_org_id(request)
    data = await postgres_service.get_session(session_id, org_id=org_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    logger.info("session_fetched", session_id=session_id)
    return ApiResponse(data=data)
