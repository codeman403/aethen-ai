"""Per-call credential analysis endpoint.

Accepts Langfuse/LangSmith credentials for a single request — fetches the
trace, ingests it, runs analysis, and returns the AnalysisReport. Credentials
are used in memory only and discarded after the request completes.

Used by the aethen-sdk when the caller does not want to register credentials
permanently in Aethen.
"""

import uuid
from typing import Literal

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.graph import analysis_graph
from app.agents.state import AnalysisReport
from app.middleware import pii_redactor
from app.models.response import ApiResponse, ResponseMetadata
from app.models.trace import FailureType, Session
from app.services.neo4j_service import neo4j_service
from app.services.vector_service import vector_service
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()
router = APIRouter(tags=["analyze"])


class AnalyzeRawRequest(BaseModel):
    """Per-call analysis request — credentials are used once and discarded."""

    format: Literal["langfuse", "langsmith", "session"] = Field(
        default="langfuse",
        description="Trace format: 'langfuse', 'langsmith', or 'session' (Aethen schema)",
    )
    # For langfuse / langsmith
    trace_id: str | None = Field(default=None, description="Langfuse trace ID or LangSmith run ID")
    public_key: str | None = Field(default=None, description="Provider public key (langfuse)")
    secret_key: str | None = Field(default=None, description="Provider secret key — used once, never stored")
    base_url: str | None = Field(default=None, description="Optional self-hosted provider URL")
    # For session format
    session: dict | None = Field(default=None, description="Aethen Session dict (format='session')")
    analyze: bool = Field(default=True, description="Run full LangGraph pipeline (default: true)")


class AnalyzeRawResult(BaseModel):
    session_id: str
    report: dict | None = None


@router.post("/analyze/raw", response_model=ApiResponse[AnalyzeRawResult])
async def analyze_raw(request: AnalyzeRawRequest) -> ApiResponse[AnalyzeRawResult]:
    """Fetch a trace with per-call credentials, ingest, and analyze.

    Credentials are used in-memory for this request only — never written
    to any store. Suitable for SDK callers who own their own credentials.
    """
    session: Session | None = None

    if request.format == "session":
        if not request.session:
            raise HTTPException(status_code=422, detail="'session' field required when format='session'")
        try:
            session = Session(**request.session)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid session schema: {exc}")

    elif request.format == "langfuse":
        if not request.trace_id or not request.secret_key:
            raise HTTPException(status_code=422, detail="'trace_id' and 'secret_key' required for format='langfuse'")
        session = await _fetch_from_langfuse(
            trace_id=request.trace_id,
            public_key=request.public_key or "",
            secret_key=request.secret_key,
            base_url=request.base_url or "",
        )

    elif request.format == "langsmith":
        if not request.trace_id or not request.secret_key:
            raise HTTPException(status_code=422, detail="'trace_id' (run_id) and 'secret_key' required for format='langsmith'")
        session = await _fetch_from_langsmith(
            run_id=request.trace_id,
            api_key=request.secret_key,
        )

    if session is None:
        raise HTTPException(status_code=404, detail="Could not fetch or build session from provided data")

    # PII/PHI redaction before any storage
    session = pii_redactor.redact_session(session)

    # Ingest into all stores
    await _ingest_session(session)

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
            logger.error("analyze_raw_pipeline_failed", session_id=session.session_id, error=str(exc))

    logger.info("analyze_raw_complete", session_id=session.session_id, format=request.format, analyzed=request.analyze)
    return ApiResponse(
        data=AnalyzeRawResult(session_id=session.session_id, report=report_dict),
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


async def _fetch_from_langfuse(trace_id: str, public_key: str, secret_key: str, base_url: str) -> Session:
    """Fetch a single Langfuse trace by ID using per-call credentials."""
    from app.providers.langfuse_provider import LangfuseProvider
    host = base_url or "https://us.cloud.langfuse.com"
    provider = LangfuseProvider(public_key=public_key, secret_key=secret_key, host=host)
    try:
        sessions = await provider.fetch_traces(limit=200)
        for s in sessions:
            if s.session_id == trace_id or trace_id in s.session_id:
                return s
        # If not in recent traces, try fetching directly
        session = await provider.fetch_trace_by_id(trace_id)
        if session:
            return session
        raise HTTPException(status_code=404, detail=f"Trace '{trace_id}' not found in Langfuse")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Langfuse fetch failed: {exc}")


async def _fetch_from_langsmith(run_id: str, api_key: str) -> Session:
    """Fetch a single LangSmith run by ID."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                f"https://api.smith.langchain.com/api/v1/runs/{run_id}",
                headers={"x-api-key": api_key},
            )
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail=f"LangSmith run '{run_id}' not found")
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"LangSmith returned HTTP {r.status_code}")
        run = r.json()
        return _langsmith_run_to_session(run)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LangSmith fetch failed: {exc}")


def _langsmith_run_to_session(run: dict) -> Session:
    """Convert a LangSmith run dict to an Aethen Session."""
    from app.models.trace import LLMCall, ToolCall
    run_type = run.get("run_type", "chain")
    llm_calls = []
    tool_calls = []

    if run_type == "llm":
        inputs = run.get("inputs", {})
        outputs = run.get("outputs", {})
        prompt = str(inputs.get("messages", inputs.get("prompt", "")))
        response = str(outputs.get("generations", outputs.get("output", "")))
        llm_calls.append(LLMCall(
            call_id=run.get("id", str(uuid.uuid4()))[:8],
            model=run.get("serialized", {}).get("name", "unknown"),
            prompt=prompt,
            response=response,
            latency_ms=float(run.get("latency", 0) * 1000),
        ))
    elif run_type == "tool":
        tool_calls.append(ToolCall(
            call_id=run.get("id", str(uuid.uuid4()))[:8],
            tool_name=run.get("name", "unknown"),
            parameters=run.get("inputs", {}),
            result=str(run.get("outputs", {}).get("output", "")),
            error=run.get("error"),
            status="failed" if run.get("error") else "success",
            latency_ms=float(run.get("latency", 0) * 1000),
        ))

    return Session(
        session_id=run.get("id", str(uuid.uuid4())),
        agent_id=run.get("name", "langsmith-agent"),
        outcome="failure" if run.get("error") else "success",
        failure_type=None,
        failure_summary=run.get("error"),
        llm_calls=llm_calls,
        tool_calls=tool_calls,
        retrieval_events=[],
        trace_source="langsmith",
    )


async def _ingest_session(session: Session) -> None:
    """Persist session to Pinecone + Neo4j + Postgres."""
    if vector_service.is_available:
        try:
            await vector_service.upsert_session(session)
        except Exception as exc:
            logger.warning("analyze_raw_vector_error", session_id=session.session_id, error=str(exc))

    if neo4j_service.is_available:
        try:
            await neo4j_service.create_session_node(session)
        except Exception as exc:
            logger.warning("analyze_raw_neo4j_error", session_id=session.session_id, error=str(exc))

    await postgres_service.save_session(session)
