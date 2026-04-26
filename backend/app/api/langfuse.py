"""Langfuse live trace ingestion endpoints."""

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.models.response import ApiResponse
from app.models.trace import IngestResult
from app.providers.langfuse_provider import LangfuseProvider
from app.services.neo4j_service import neo4j_service
from app.services.pinecone_service import pinecone_service
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()

router = APIRouter(tags=["langfuse"])


class LangfusePullRequest(BaseModel):
    """Request to pull and ingest traces from Langfuse."""

    limit: int = Field(default=20, ge=1, le=200, description="Number of traces to pull")


class LangfuseHealthResponse(BaseModel):
    """Health check response for Langfuse connectivity."""

    status: str
    detail: str


def _get_provider() -> LangfuseProvider:
    """Get a configured LangfuseProvider, or raise if not configured."""
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Langfuse not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.",
        )
    return LangfuseProvider(
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
        host=settings.langfuse_base_url,
    )


@router.post("/langfuse/pull", response_model=ApiResponse[IngestResult])
async def pull_langfuse_traces(request: LangfusePullRequest) -> ApiResponse[IngestResult]:
    """Pull traces from Langfuse, adapt them, and ingest into Aethen pipeline.

    This is the live-mode equivalent of POST /api/ingest — it fetches traces
    directly from Langfuse instead of receiving them as JSON.
    """
    provider = _get_provider()
    sessions = await provider.fetch_traces(limit=request.limit)

    if not sessions:
        return ApiResponse(
            data=IngestResult(sessions_ingested=0, events_processed=0, errors=[]),
        )

    # Run through the same ingestion pipeline as synthetic traces
    errors: list[str] = []
    total_events = 0
    sessions_ok = 0

    for session in sessions:
        event_count = len(session.llm_calls) + len(session.tool_calls) + len(session.retrieval_events)
        total_events += event_count

        if pinecone_service.is_available:
            try:
                await pinecone_service.upsert_session(session)
            except Exception as e:
                msg = f"Pinecone error for session {session.session_id}: {e}"
                logger.error("langfuse_ingest_pinecone_error", session_id=session.session_id, error=str(e))
                errors.append(msg)

        if neo4j_service.is_available:
            try:
                await neo4j_service.create_session_node(session)
            except Exception as e:
                msg = f"Neo4j error for session {session.session_id}: {e}"
                logger.error("langfuse_ingest_neo4j_error", session_id=session.session_id, error=str(e))
                errors.append(msg)

        await postgres_service.save_session(session)
        sessions_ok += 1
        logger.info("langfuse_session_ingested", session_id=session.session_id, events=event_count)

    if neo4j_service.is_available:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception as e:
            logger.error("langfuse_link_patterns_error", error=str(e))
            errors.append(f"Pattern linking error: {e}")

    result = IngestResult(
        sessions_ingested=sessions_ok,
        events_processed=total_events,
        errors=errors,
    )
    logger.info("langfuse_pull_complete", sessions=sessions_ok, events=total_events)
    return ApiResponse(data=result)


@router.get("/langfuse/health", response_model=ApiResponse[LangfuseHealthResponse])
async def langfuse_health() -> ApiResponse[LangfuseHealthResponse]:
    """Check Langfuse connectivity."""
    provider = _get_provider()
    result = await provider.health_check()
    return ApiResponse(data=LangfuseHealthResponse(**result))
