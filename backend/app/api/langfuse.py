"""Langfuse live trace ingestion endpoints."""

import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.agents.graph import analysis_graph
from app.agents.state import AnalysisReport
from app.config import settings
from app.middleware import pii_redactor
from app.models.response import ApiResponse, ResponseMetadata
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

        is_new = await postgres_service.save_session(session)
        if is_new:
            sessions_ok += 1
            ingested_ids.append(session.session_id)
            logger.info("langfuse_session_ingested", session_id=session.session_id, events=event_count)
        else:
            logger.debug("langfuse_session_already_exists", session_id=session.session_id)

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


# ── Multi-source pull ──────────────────────────────────────────────────────────


async def _pull_single_source(
    provider: LangfuseProvider,
    source_name: str,
    limit: int,
    background_tasks: BackgroundTasks,
) -> IngestResult:
    """Pull traces for one source with its own watermark."""
    watermark_key = f"langfuse_last_pull_at_{source_name}"
    since = None
    watermark_str = await postgres_service.get_setting(watermark_key)
    if watermark_str:
        try:
            since = datetime.fromisoformat(watermark_str)
        except ValueError:
            pass

    pull_started_at = datetime.now(UTC)
    try:
        sessions = await provider.fetch_traces(limit=limit, since=since)
    except Exception as exc:
        logger.error("langfuse_source_fetch_failed", source=source_name, error=str(exc))
        return IngestResult(sessions_ingested=0, events_processed=0, errors=[str(exc)])

    if not sessions:
        return IngestResult(sessions_ingested=0, events_processed=0)

    errors: list[str] = []
    total_events = 0
    sessions_ok = 0
    ingested_ids: list[str] = []

    for session in sessions:
        session = pii_redactor.redact_session(session)
        event_count = len(session.llm_calls) + len(session.tool_calls) + len(session.retrieval_events)
        total_events += event_count

        if pinecone_service.is_available:
            try:
                await pinecone_service.upsert_session(session)
            except Exception as e:
                errors.append(f"Pinecone error {session.session_id}: {e}")

        if neo4j_service.is_available:
            try:
                await neo4j_service.create_session_node(session)
            except Exception as e:
                errors.append(f"Neo4j error {session.session_id}: {e}")

        is_new = await postgres_service.save_session(session)
        if is_new:
            sessions_ok += 1
            ingested_ids.append(session.session_id)
        else:
            logger.debug("langfuse_source_session_already_exists", session_id=session.session_id)

    if neo4j_service.is_available:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception as e:
            errors.append(f"Pattern linking: {e}")

    await postgres_service.set_setting(watermark_key, pull_started_at.isoformat())

    if ingested_ids:
        background_tasks.add_task(_analyze_sessions_background, ingested_ids)

    logger.info("langfuse_source_pull_complete", source=source_name, sessions=sessions_ok)
    return IngestResult(sessions_ingested=sessions_ok, events_processed=total_events,
                        analyses_queued=len(ingested_ids), errors=errors)


@router.post("/langfuse/pull/all", response_model=ApiResponse[dict])
async def pull_all_sources(
    background_tasks: BackgroundTasks,
    limit: int = 20,
) -> ApiResponse[dict]:
    """Pull traces from ALL registered sources + Aethen's own account.

    Each source uses its own incremental watermark so pulls are independent.
    """
    from app.api.sources import list_all_sources

    results: dict[str, dict] = {}

    # Pull Aethen's own account (env vars) if configured
    if settings.langfuse_public_key and settings.langfuse_secret_key:
        own_provider = LangfuseProvider(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_base_url,
        )
        own_result = await _pull_single_source(own_provider, "default", limit, background_tasks)
        results["default"] = own_result.model_dump()

    # Pull each registered external source
    sources = await list_all_sources()
    for source in sources:
        try:
            provider = LangfuseProvider(
                public_key=source["public_key"],
                secret_key=source["secret_key"],
                host=source.get("base_url") or "https://us.cloud.langfuse.com",
            )
            result = await _pull_single_source(provider, source["name"], limit, background_tasks)
            results[source["name"]] = result.model_dump()
        except Exception as exc:
            logger.error("langfuse_external_pull_failed", source=source["name"], error=str(exc))
            results[source["name"]] = {"error": str(exc)}

    total_sessions = sum(r.get("sessions_ingested", 0) for r in results.values() if isinstance(r, dict))
    logger.info("langfuse_pull_all_complete", sources=len(results), total_sessions=total_sessions)
    return ApiResponse(data={"sources": results, "total_sessions_ingested": total_sessions},
                       error=None, metadata=ResponseMetadata(request_id=str(uuid.uuid4())))


# ── Single-trace fetch (used by MCP analyze_langfuse_trace tool) ──────────────


class SingleTraceRequest(BaseModel):
    trace_id: str = Field(description="Langfuse trace ID to fetch and analyze")
    source: str = Field(default="default", description="Registered source name or 'default' for env vars")
    analyze: bool = Field(default=True, description="Run full LangGraph analysis (default: true)")


class SingleTraceResult(BaseModel):
    session_id: str
    report: dict | None = None


@router.post("/langfuse/trace", response_model=ApiResponse[SingleTraceResult])
async def fetch_and_analyze_trace(request: SingleTraceRequest) -> ApiResponse[SingleTraceResult]:
    """Fetch a specific Langfuse trace by ID using a registered source, then analyze it."""
    from app.api.sources import _load_source_raw
    from app.utils.credential_crypto import decrypt

    if request.source == "default":
        if not settings.langfuse_public_key or not settings.langfuse_secret_key:
            raise HTTPException(status_code=503, detail="Default Langfuse source not configured")
        public_key = settings.langfuse_public_key
        secret_key = settings.langfuse_secret_key
        base_url = settings.langfuse_base_url
    else:
        raw = await _load_source_raw(request.source)
        if not raw:
            raise HTTPException(status_code=404, detail=f"Source '{request.source}' not found")
        public_key = raw.get("public_key", "")
        try:
            secret_key = decrypt(raw["secret_key_enc"])
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt stored credentials")
        base_url = raw.get("base_url") or "https://us.cloud.langfuse.com"

    provider = LangfuseProvider(public_key=public_key, secret_key=secret_key, host=base_url)

    # Attempt direct fetch by ID first
    session = await provider.fetch_trace_by_id(request.trace_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Trace '{request.trace_id}' not found in Langfuse")

    session = pii_redactor.redact_session(session)

    # Ingest
    if pinecone_service.is_available:
        try:
            await pinecone_service.upsert_session(session)
        except Exception as exc:
            logger.warning("trace_pinecone_error", error=str(exc))
    if neo4j_service.is_available:
        try:
            await neo4j_service.create_session_node(session)
        except Exception as exc:
            logger.warning("trace_neo4j_error", error=str(exc))
    await postgres_service.save_session(session)

    report_dict: dict | None = None
    if request.analyze:
        try:
            result = await analysis_graph.ainvoke({"session": session})
            report = AnalysisReport(**result["report"])
            report_dict = report.model_dump(mode="json")
            if report.failure_type and report.failure_type != FailureType.UNKNOWN:
                await postgres_service.update_failure_type(session.session_id, str(report.failure_type))
            await postgres_service.save_analysis_report(session.session_id, report_dict)
        except Exception as exc:
            logger.error("trace_analysis_failed", session_id=session.session_id, error=str(exc))

    return ApiResponse(
        data=SingleTraceResult(session_id=session.session_id, report=report_dict),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )
