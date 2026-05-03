"""Session CRUD endpoints — backed exclusively by PostgreSQL (Supabase).

GET  /api/sessions                  — list all sessions (lightweight summaries)
GET  /api/sessions?failure_type=X   — list sessions of one failure type (full objects)
GET  /api/sessions/{session_id}     — fetch one full session by ID
"""

import structlog
from fastapi import APIRouter, HTTPException, Query

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()

router = APIRouter(tags=["sessions"])


@router.get("/sessions", response_model=ApiResponse[list[dict]])
async def list_sessions(
    failure_type: str | None = Query(default=None, description="Filter by failure type"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> ApiResponse[list[dict]]:
    """Return sessions from Postgres.

    With failure_type: full session objects ready for /api/chat.
    Without: lightweight summaries for the Trace Explorer (paginated).
    """
    if failure_type:
        sessions = await postgres_service.get_by_failure_type(failure_type)
        logger.info("sessions_by_type", failure_type=failure_type, count=len(sessions))
        return ApiResponse(data=sessions)

    summaries = await postgres_service.get_all_summaries(limit=limit, offset=offset)
    logger.info("sessions_all", count=len(summaries), offset=offset)
    return ApiResponse(data=summaries)


@router.get("/sessions/{session_id}", response_model=ApiResponse[dict])
async def get_session(session_id: str) -> ApiResponse[dict]:
    """Return the full session object for a given session_id."""
    data = await postgres_service.get_session(session_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    logger.info("session_fetched", session_id=session_id)
    return ApiResponse(data=data)
