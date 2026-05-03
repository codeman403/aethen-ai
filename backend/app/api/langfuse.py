"""Langfuse live trace ingestion endpoints."""

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.agents.graph import analysis_graph
from app.agents.state import AnalysisReport
from app.config import settings
from app.models.response import ApiResponse
from app.models.trace import FailureType, IngestResult, Session
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


def _has_analyzable_evidence(session: Session) -> bool:
    """Return True if the session has enough evidence to run LangGraph analysis."""
    if session.failure_type is not None:
        return True
    if session.outcome == "failure":
        return True
    if session.tool_calls:
        return True
    if session.retrieval_events:
        return True
    return False


async def _analyze_sessions_background(session_ids: list[str]) -> None:
    """Run analysis pipeline for newly ingested sessions, sequentially.

    Skips sessions that already have a cached report or no analyzable evidence.
    No Langfuse callbacks — background runs should not appear in Trace Explorer.
    """
    for session_id in session_ids:
        try:
            # Skip if already cached
            cached = await postgres_service.get_analysis_report(session_id)
            if cached:
                continue

            session_data = await postgres_service.get_session(session_id)
            if not session_data:
                continue

            session = Session(**session_data)
            if not _has_analyzable_evidence(session):
                logger.info("background_analysis_skipped_no_evidence", session_id=session_id)
                continue

            result = await analysis_graph.ainvoke({"session": session})
            report = AnalysisReport(**result["report"])

            if report.failure_type and report.failure_type != FailureType.UNKNOWN:
                await postgres_service.update_failure_type(session_id, str(report.failure_type))

            await postgres_service.save_analysis_report(session_id, report.model_dump(mode="json"))
            logger.info("background_analysis_complete", session_id=session_id, failure_type=str(report.failure_type))

        except Exception as exc:
            logger.error("background_analysis_failed", session_id=session_id, error=str(exc))


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
async def pull_langfuse_traces(
    request: LangfusePullRequest,
    background_tasks: BackgroundTasks,
) -> ApiResponse[IngestResult]:
    """Pull NEW traces from Langfuse since the last pull, adapt, and ingest.

    Uses an incremental watermark stored in Postgres so only traces created
    after the previous pull are fetched — no re-ingestion of existing sessions.
    """
    provider = _get_provider()

    # Read last-pull watermark for incremental ingestion
    since = None
    watermark_str = await postgres_service.get_setting("langfuse_last_pull_at")
    if watermark_str:
        try:
            since = datetime.fromisoformat(watermark_str)
        except ValueError:
            since = None

    pull_started_at = datetime.now(UTC)
    try:
        sessions = await provider.fetch_traces(limit=request.limit, since=since)
    except Exception as exc:
        logger.error("langfuse_fetch_failed", error=str(exc))
        return ApiResponse(data=IngestResult(sessions_ingested=0, events_processed=0, errors=[str(exc)]))
    logger.info("langfuse_incremental_pull", since=watermark_str or "first-pull", fetched=len(sessions))

    if not sessions:
        return ApiResponse(
            data=IngestResult(sessions_ingested=0, events_processed=0, errors=[]),
        )

    # Run through the same ingestion pipeline as synthetic traces
    errors: list[str] = []
    total_events = 0
    sessions_ok = 0
    ingested_ids: list[str] = []

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
        ingested_ids.append(session.session_id)
        logger.info("langfuse_session_ingested", session_id=session.session_id, events=event_count)

    if neo4j_service.is_available:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception as e:
            logger.error("langfuse_link_patterns_error", error=str(e))
            errors.append(f"Pattern linking error: {e}")

    # Update watermark so next pull only fetches traces created after this pull started
    await postgres_service.set_setting("langfuse_last_pull_at", pull_started_at.isoformat())

    # Queue background analysis for every newly ingested session.
    # Runs sequentially after the response is sent — skips sessions already cached
    # or with no analyzable evidence. No Langfuse callbacks (prevents meta-traces).
    if ingested_ids:
        background_tasks.add_task(_analyze_sessions_background, ingested_ids)

    result = IngestResult(
        sessions_ingested=sessions_ok,
        events_processed=total_events,
        analyses_queued=len(ingested_ids),
        errors=errors,
    )
    logger.info("langfuse_pull_complete", sessions=sessions_ok, events=total_events,
                analyses_queued=len(ingested_ids), watermark=pull_started_at.isoformat())
    return ApiResponse(data=result)


@router.get("/langfuse/health", response_model=ApiResponse[LangfuseHealthResponse])
async def langfuse_health() -> ApiResponse[LangfuseHealthResponse]:
    """Check Langfuse connectivity."""
    provider = _get_provider()
    result = await provider.health_check()
    return ApiResponse(data=LangfuseHealthResponse(**result))
