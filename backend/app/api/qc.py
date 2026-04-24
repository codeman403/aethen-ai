"""POST /api/qc — Quality check reporting endpoint.

Provides summary statistics and quality metrics across analyzed sessions.
"""

import time
import uuid

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.response import ApiResponse, ResponseMetadata
from app.models.trace import FailureType

router = APIRouter()
logger = structlog.get_logger()


class QCRequest(BaseModel):
    """Request body for quality check — accepts session IDs to report on."""

    session_ids: list[str] = Field(description="Session IDs to include in the QC report", min_length=1)


class QCMetrics(BaseModel):
    """Quality metrics for a set of analyzed sessions."""

    total_sessions: int = Field(description="Total sessions in the report")
    failure_distribution: dict[str, int] = Field(
        default_factory=dict,
        description="Count of each failure type",
    )
    avg_confidence: float = Field(default=0.0, description="Average analysis confidence score")
    high_severity_count: int = Field(default=0, description="Number of high/critical severity findings")
    top_root_causes: list[str] = Field(default_factory=list, description="Most common root causes")


class QCReport(BaseModel):
    """Quality check report summarizing analysis results."""

    metrics: QCMetrics = Field(description="Aggregate quality metrics")
    recommendations: list[str] = Field(default_factory=list, description="System-wide recommendations")


@router.post("/qc", response_model=ApiResponse[QCReport])
async def quality_check(request: QCRequest) -> ApiResponse[QCReport]:
    """Generate a quality check report for the specified sessions.

    This endpoint aggregates analysis results to provide system-wide
    quality insights and recommendations.

    NOTE: Full implementation requires a persistence layer to store
    analysis results. Current version returns a placeholder report
    based on the requested session IDs.
    """
    request_id = str(uuid.uuid4())
    start = time.perf_counter()

    logger.info("qc_request_received", request_id=request_id, session_count=len(request.session_ids))

    # Placeholder metrics — will be populated from stored analysis results
    # once a persistence layer is added
    metrics = QCMetrics(
        total_sessions=len(request.session_ids),
        failure_distribution={ft.value: 0 for ft in FailureType if ft != FailureType.UNKNOWN},
        avg_confidence=0.0,
        high_severity_count=0,
        top_root_causes=[],
    )

    report = QCReport(
        metrics=metrics,
        recommendations=[
            "Ingest and analyze sessions via POST /api/chat before running QC reports.",
            "Connect a persistence layer to store analysis results for aggregation.",
        ],
    )

    duration_ms = (time.perf_counter() - start) * 1000

    logger.info("qc_request_complete", request_id=request_id, duration_ms=f"{duration_ms:.0f}")

    return ApiResponse(
        data=report,
        metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms),
    )
