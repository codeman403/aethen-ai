"""POST /api/chat — Primary debug interface for analyzing AI agent sessions."""

import time
import traceback
import uuid

import structlog
from fastapi import APIRouter

from app.agents.graph import analysis_graph
from app.agents.state import AnalysisReport
from app.models.response import ApiResponse, ResponseMetadata
from app.models.trace import Session

router = APIRouter()
logger = structlog.get_logger()


class ChatRequest(Session):
    """Chat endpoint accepts a full Session object for analysis.

    Extends Session directly so the request body IS the session trace.
    """

    pass


@router.post("/chat", response_model=ApiResponse[AnalysisReport])
async def analyze_session(request: ChatRequest) -> ApiResponse[AnalysisReport]:
    """Analyze an AI agent session trace for failure diagnosis.

    Runs the full LangGraph pipeline:
    classify → retrieve → rerank → analyze → synthesize
    """
    request_id = str(uuid.uuid4())
    start = time.perf_counter()

    logger.info("chat_request_received", session_id=request.session_id, request_id=request_id)

    try:
        # Run the analysis graph
        result = await analysis_graph.ainvoke({"session": request})

        report = AnalysisReport(**result["report"])
        duration_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "chat_request_complete",
            session_id=request.session_id,
            request_id=request_id,
            duration_ms=f"{duration_ms:.0f}",
            failure_type=report.failure_type,
            findings_count=len(report.findings),
        )

        return ApiResponse(
            data=report,
            metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms),
        )

    except Exception as exc:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.error(
            "chat_request_failed",
            session_id=request.session_id,
            request_id=request_id,
            error=str(exc),
            traceback=traceback.format_exc(),
        )
        return ApiResponse(
            error=f"Analysis failed: {exc!s}",
            metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms),
        )
