"""Trace ingestion endpoint."""

import structlog
from app.utils.request_context import get_data_org_id, get_actor_org_id
from fastapi import APIRouter, HTTPException, Request

from app.middleware import pii_redactor
from app.models.response import ApiResponse
from app.models.trace import IngestRequest, IngestResult, Session
from app.utils.sanitize import strip_injection
from app.services.neo4j_service import neo4j_service
from app.services.pinecone_service import pinecone_service
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()

router = APIRouter(tags=["ingestion"])


@router.post("/ingest", response_model=ApiResponse[IngestResult])
async def ingest_traces(request: IngestRequest, http_request: Request) -> ApiResponse[IngestResult]:
    """Ingest one or more agent execution sessions.

    Flow: validate → quota check → embed → store in Pinecone → store in Neo4j → return summary.
    """
    errors: list[str] = []
    total_events = 0
    sessions_ok = 0
    org_id = get_actor_org_id(http_request)  # use actor org so admin sessions are attributed

    # Quota check — admins are exempt; skip when org_id unresolvable
    is_admin = getattr(http_request.state, "is_admin", False)
    if org_id and not is_admin:
        allowed, current, limit, reason = await postgres_service.check_quota(
            org_id, "sessions", requested=len(request.sessions)
        )
        if not allowed:
            raise HTTPException(status_code=429, detail=reason)

    # PII redaction first, then injection stripping on free-text fields
    redacted = [pii_redactor.redact_session(s) for s in request.sessions]
    sessions = []
    for s in redacted:
        data = s.model_dump()
        if data.get("failure_summary"):
            data["failure_summary"] = strip_injection(data["failure_summary"])
        sessions.append(Session(**data))

    new_session_count = 0
    for session in sessions:
        event_count = len(session.llm_calls) + len(session.tool_calls) + len(session.retrieval_events)
        total_events += event_count

        # Store in Pinecone (vector DB)
        if pinecone_service.is_available:
            try:
                await pinecone_service.upsert_session(session)
            except Exception as e:
                logger.error("ingest_pinecone_error", session_id=session.session_id, error=str(e))
                errors.append(f"Pinecone error for session {session.session_id}: {e}")

        # Store in Neo4j (graph DB)
        if neo4j_service.is_available:
            try:
                await neo4j_service.create_session_node(session)
            except Exception as e:
                logger.error("ingest_neo4j_error", session_id=session.session_id, error=str(e))
                errors.append(f"Neo4j error for session {session.session_id}: {e}")

        # Persist full session to Postgres (primary session store)
        is_new = await postgres_service.save_session(session, org_id=org_id)
        if is_new:
            new_session_count += 1

        sessions_ok += 1
        logger.info("session_ingested", session_id=session.session_id, events=event_count)

    # Increment usage counter for new sessions only
    if org_id and new_session_count > 0:
        await postgres_service.increment_usage(org_id, "sessions", delta=new_session_count)

    # Deliver ingest.completed webhook
    if org_id and new_session_count > 0:
        from app.api.webhooks import deliver_event
        await deliver_event(org_id, "ingest.completed", {
            "sessions_ingested": sessions_ok,
            "new_sessions": new_session_count,
        })

    # Link failure patterns across sessions
    if neo4j_service.is_available:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception as e:
            logger.error("ingest_link_patterns_error", error=str(e))
            errors.append(f"Pattern linking error: {e}")

    return ApiResponse(data=IngestResult(
        sessions_ingested=sessions_ok,
        events_processed=total_events,
        errors=errors,
    ), error=None)
