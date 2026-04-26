"""Trace ingestion endpoint."""

import structlog
from fastapi import APIRouter

from app.models.response import ApiResponse
from app.models.trace import IngestRequest, IngestResult
from app.services.neo4j_service import neo4j_service
from app.services.pinecone_service import pinecone_service
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()

router = APIRouter(tags=["ingestion"])


@router.post("/ingest", response_model=ApiResponse[IngestResult])
async def ingest_traces(request: IngestRequest) -> ApiResponse[IngestResult]:
    """Ingest one or more agent execution sessions.

    Flow: validate → embed → store in Pinecone → store in Neo4j → return summary.
    """
    errors: list[str] = []
    total_events = 0
    sessions_ok = 0

    for session in request.sessions:
        event_count = len(session.llm_calls) + len(session.tool_calls) + len(session.retrieval_events)
        total_events += event_count

        # Store in Pinecone (vector DB)
        if pinecone_service.is_available:
            try:
                await pinecone_service.upsert_session(session)
            except Exception as e:
                msg = f"Pinecone error for session {session.session_id}: {e}"
                logger.error("ingest_pinecone_error", session_id=session.session_id, error=str(e))
                errors.append(msg)

        # Store in Neo4j (graph DB)
        if neo4j_service.is_available:
            try:
                await neo4j_service.create_session_node(session)
            except Exception as e:
                msg = f"Neo4j error for session {session.session_id}: {e}"
                logger.error("ingest_neo4j_error", session_id=session.session_id, error=str(e))
                errors.append(msg)

        # Persist full session to Postgres (primary session store)
        await postgres_service.save_session(session)

        sessions_ok += 1
        logger.info("session_ingested", session_id=session.session_id, events=event_count)

    # Link failure patterns across sessions
    if neo4j_service.is_available:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception as e:
            logger.error("ingest_link_patterns_error", error=str(e))
            errors.append(f"Pattern linking error: {e}")

    result = IngestResult(
        sessions_ingested=sessions_ok,
        events_processed=total_events,
        errors=errors,
    )

    return ApiResponse(data=result, error=None)
