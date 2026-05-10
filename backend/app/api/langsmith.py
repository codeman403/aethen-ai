"""LangSmith live trace ingestion endpoints."""

from datetime import UTC, datetime

import structlog
from app.utils.request_context import get_data_org_id
from app.agents.llm import set_org_llm_context
from app.services.llm_key_service import get_config as _get_llm_config
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.models.response import ApiResponse
from app.models.trace import FailureType, IngestResult, Session
from app.providers.langsmith_provider import LangSmithProvider
from app.services.neo4j_service import neo4j_service
from app.services.pinecone_service import pinecone_service
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()

router = APIRouter(tags=["langsmith"])


class LangSmithPullRequest(BaseModel):
    limit: int = Field(default=20, ge=1, le=200)


class LangSmithHealthResponse(BaseModel):
    status: str
    detail: str


def _has_analyzable_evidence(session: Session) -> bool:
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
    """Run LangGraph analysis for newly ingested LangSmith sessions."""
    from app.agents.graph import analysis_graph
    from app.agents.state import AnalysisReport

    for session_id in session_ids:
        try:
            cached = await postgres_service.get_analysis_report(session_id)
            if cached:
                continue

            session_data = await postgres_service.get_session(session_id)
            if not session_data:
                continue

            session = Session(**session_data)
            if not _has_analyzable_evidence(session):
                continue

            result = await analysis_graph.ainvoke({"session": session})
            report = AnalysisReport(**result["report"])

            if report.failure_type and report.failure_type != FailureType.UNKNOWN:
                await postgres_service.update_failure_type(session_id, str(report.failure_type))

            await postgres_service.save_analysis_report(session_id, report.model_dump(mode="json"))
            logger.info("langsmith_background_analysis_complete", session_id=session_id)

        except Exception as exc:
            logger.error("langsmith_background_analysis_failed", session_id=session_id, error=str(exc))


def _get_provider() -> LangSmithProvider:
    if not settings.langsmith_api_key:
        raise HTTPException(
            status_code=503,
            detail="LangSmith not configured. Set LANGSMITH_API_KEY in your environment.",
        )
    return LangSmithProvider(
        api_key=settings.langsmith_api_key,
        endpoint=settings.langsmith_endpoint,
        project_name=settings.langsmith_project,
    )


@router.post("/langsmith/pull", response_model=ApiResponse[IngestResult])
async def pull_langsmith_traces(
    request: LangSmithPullRequest,
    background_tasks: BackgroundTasks,
    http_request: Request,
) -> ApiResponse[IngestResult]:
    """Pull new traces from LangSmith since the last pull, adapt, and ingest.

    Uses an incremental watermark (`langsmith_last_pull_at` in app_settings)
    so only traces created after the previous pull are fetched.
    """
    org_id = get_data_org_id(http_request)
    set_org_llm_context(await _get_llm_config(org_id))

    # In multi-tenant mode, only pull from org-configured LangSmith sources.
    if org_id:
        from app.api.sources import list_all_sources
        org_sources = await list_all_sources(org_id=org_id)
        ls_sources = [s for s in org_sources if s.get("provider") == "langsmith"]
        if not ls_sources:
            raise HTTPException(
                status_code=503,
                detail="No LangSmith source configured for your organization. Add one in Integrations.",
            )
        src = ls_sources[0]
        provider = LangSmithProvider(
            api_key=src["secret_key"],
            endpoint=settings.langsmith_endpoint,
            project_name=settings.langsmith_project,
        )
        watermark_key = f"langsmith_last_pull_at_{org_id}_{src['name']}"
    else:
        provider = _get_provider()
        watermark_key = "langsmith_last_pull_at"

    since = None
    watermark_str = await postgres_service.get_setting(watermark_key)
    if watermark_str:
        try:
            since = datetime.fromisoformat(watermark_str)
        except ValueError:
            since = None

    pull_started_at = datetime.now(UTC)
    try:
        sessions = await provider.fetch_traces(limit=request.limit, since=since)
    except Exception as exc:
        logger.error("langsmith_fetch_failed", error=str(exc))
        return ApiResponse(data=IngestResult(sessions_ingested=0, events_processed=0, errors=[str(exc)]))
    logger.info("langsmith_incremental_pull", since=watermark_str or "first-pull", fetched=len(sessions))

    if not sessions:
        return ApiResponse(data=IngestResult(sessions_ingested=0, events_processed=0, errors=[]))

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
                errors.append(f"Pinecone error for {session.session_id}: {e}")
                logger.error("langsmith_ingest_pinecone_error", session_id=session.session_id, error=str(e))

        if neo4j_service.is_available:
            try:
                await neo4j_service.create_session_node(session)
            except Exception as e:
                errors.append(f"Neo4j error for {session.session_id}: {e}")
                logger.error("langsmith_ingest_neo4j_error", session_id=session.session_id, error=str(e))

        await postgres_service.save_session(session, org_id=org_id)
        sessions_ok += 1
        ingested_ids.append(session.session_id)
        logger.info("langsmith_session_ingested", session_id=session.session_id, events=event_count)

    if neo4j_service.is_available:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception as e:
            errors.append(f"Pattern linking error: {e}")

    await postgres_service.set_setting(watermark_key, pull_started_at.isoformat())

    if ingested_ids:
        background_tasks.add_task(_analyze_sessions_background, ingested_ids)

    result = IngestResult(
        sessions_ingested=sessions_ok,
        events_processed=total_events,
        analyses_queued=len(ingested_ids),
        errors=errors,
    )
    logger.info("langsmith_pull_complete", sessions=sessions_ok, events=total_events,
                analyses_queued=len(ingested_ids))
    return ApiResponse(data=result)


@router.get("/langsmith/health", response_model=ApiResponse[LangSmithHealthResponse])
async def langsmith_health() -> ApiResponse[LangSmithHealthResponse]:
    """Check LangSmith connectivity."""
    provider = _get_provider()
    result = await provider.health_check()
    return ApiResponse(data=LangSmithHealthResponse(**result))
