"""Quality check endpoints.

POST /api/qc          — aggregate analysis metrics for specific session IDs
GET  /api/qc/report   — full automated data quality report across all 4 sources
"""

import math
import time
import uuid
from collections import Counter
from datetime import datetime, timezone

import structlog
from app.utils.request_context import get_data_org_id
from fastapi import APIRouter, Request  # noqa: F401 — Request used in quality_check
from pydantic import BaseModel, Field

from app import store
from app.models.response import ApiResponse, ResponseMetadata
from app.models.trace import FailureType, ToolCallStatus

router = APIRouter()
logger = structlog.get_logger()


class QCRequest(BaseModel):
    """Request body — session IDs to include in the report."""

    session_ids: list[str] = Field(description="Session IDs to include in the QC report", min_length=1)


class QCMetrics(BaseModel):
    total_sessions: int
    failure_distribution: dict[str, int] = Field(default_factory=dict)
    avg_confidence: float = Field(default=0.0)
    high_severity_count: int = Field(default=0)
    top_root_causes: list[str] = Field(default_factory=list)


class QCReport(BaseModel):
    metrics: QCMetrics
    recommendations: list[str] = Field(default_factory=list)


@router.post("/qc", response_model=ApiResponse[QCReport])
async def quality_check(request: QCRequest, http_request: Request) -> ApiResponse[QCReport]:
    """Aggregate analysis results for the given session IDs."""
    request_id = str(uuid.uuid4())
    start = time.perf_counter()
    org_id = get_data_org_id(http_request)

    logger.info("qc_request_received", request_id=request_id, session_count=len(request.session_ids))

    # Validate each requested session_id belongs to the calling org before
    # returning cached analysis reports — prevents cross-org disclosure.
    if org_id:
        from app.services.postgres_service import postgres_service
        allowed_ids: list[str] = []
        for sid in request.session_ids:
            row = await postgres_service.get_session(sid, org_id=org_id)
            if row:
                allowed_ids.append(sid)
        session_ids = allowed_ids
    else:
        session_ids = request.session_ids

    reports = store.get_many(session_ids)
    missing = len(request.session_ids) - len(reports)

    failure_dist: Counter[str] = Counter({ft.value: 0 for ft in FailureType if ft != FailureType.UNKNOWN})
    confidence_sum = 0.0
    high_sev = 0
    root_causes: list[str] = []

    for r in reports:
        failure_dist[r.failure_type.value] += 1
        confidence_sum += r.confidence
        high_sev += sum(1 for f in r.findings if f.severity in {"high", "critical"})
        if r.root_cause:
            root_causes.append(r.root_cause)

    avg_confidence = confidence_sum / len(reports) if reports else 0.0

    # Most common root causes — deduplicate by taking top 3 unique strings
    root_cause_counts = Counter(root_causes)
    top_causes = [cause for cause, _ in root_cause_counts.most_common(3)]

    recommendations: list[str] = []
    if missing:
        recommendations.append(
            f"{missing} requested session(s) not found — run /api/chat for those sessions first."
        )
    dominant = failure_dist.most_common(1)
    if dominant and dominant[0][1] > 0:
        recommendations.append(f"Primary failure pattern: {dominant[0][0]} ({dominant[0][1]} sessions).")
    if avg_confidence < 0.5 and reports:
        recommendations.append("Low average confidence — consider ingesting richer trace data.")

    metrics = QCMetrics(
        total_sessions=len(reports),
        failure_distribution=dict(failure_dist),
        avg_confidence=round(avg_confidence, 3),
        high_severity_count=high_sev,
        top_root_causes=top_causes,
    )

    duration_ms = (time.perf_counter() - start) * 1000
    logger.info("qc_request_complete", request_id=request_id, duration_ms=f"{duration_ms:.0f}")

    return ApiResponse(
        data=QCReport(metrics=metrics, recommendations=recommendations),
        metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Data Quality Report  (GET /api/qc/report)
# ─────────────────────────────────────────────────────────────────────────────

class QualityCheck(BaseModel):
    name: str
    status: str           # "pass" | "warn" | "fail"
    detail: str
    count: int = 0        # items checked
    flagged: int = 0      # items with issues
    flagged_session_ids: list[str] = Field(default_factory=list)  # specific sessions to investigate


class SourceReport(BaseModel):
    source: str
    total: int = 0
    status: str = "pass"   # set by the check functions after appending all checks
    checks: list[QualityCheck] = Field(default_factory=list)

    def compute_status(self) -> "SourceReport":
        statuses = [c.status for c in self.checks]
        if "fail" in statuses:
            self.status = "fail"
        elif "warn" in statuses:
            self.status = "warn"
        else:
            self.status = "pass"
        return self


class DataQualityReport(BaseModel):
    generated_at: str
    overall_status: str           # "pass" | "warn" | "fail"
    sources: list[SourceReport]
    summary_text: str             # formatted report like the proposal


def _check_agent_traces(sessions: list[dict]) -> SourceReport:
    """2 checks on ingested session data (accepts list of session dicts from Postgres)."""
    report = SourceReport(source="Agent Traces", total=len(sessions))
    REQUIRED_FIELDS = {"session_id", "agent_id", "outcome"}

    # ── Check 1: Schema Validation ────────────────────────────────────────
    invalid_ids: list[str] = []
    for data in sessions:
        missing = REQUIRED_FIELDS - set(data.keys())
        if missing or not data.get("session_id"):
            invalid_ids.append(data.get("session_id", ""))
    invalid = len(invalid_ids)
    pct = round((len(sessions) - invalid) / max(len(sessions), 1) * 100, 1)
    report.checks.append(QualityCheck(
        name="Schema Validation",
        status="pass" if invalid == 0 else ("warn" if invalid / max(len(sessions), 1) < 0.05 else "fail"),
        detail=f"{len(sessions) - invalid}/{len(sessions)} passed schema validation ({pct}%)",
        count=len(sessions),
        flagged=invalid,
        flagged_session_ids=invalid_ids,
    ))

    # ── Check 2: Completeness (sessions with 0 events) ───────────────────
    empty = 0
    missing_summary = 0
    completeness_ids: list[str] = []
    for data in sessions:
        events = len(data.get("llm_calls", [])) + len(data.get("tool_calls", [])) + len(data.get("retrieval_events", []))
        flagged = False
        if events == 0:
            empty += 1
            flagged = True
        if data.get("outcome") == "failure" and not data.get("failure_summary"):
            missing_summary += 1
            flagged = True
        if flagged and data.get("session_id"):
            completeness_ids.append(data["session_id"])
    issues = empty + missing_summary
    report.checks.append(QualityCheck(
        name="Completeness",
        status="pass" if issues == 0 else "warn",
        detail=(
            f"{empty} sessions with 0 events (quarantined); "
            f"{missing_summary} failure sessions missing summary"
        ),
        count=len(sessions),
        flagged=len(completeness_ids),
        flagged_session_ids=completeness_ids,
    ))

    return report


async def _check_vector_db() -> SourceReport:
    """2 checks on Pinecone index health (async-safe — runs sync Pinecone call in executor)."""
    import asyncio
    from app.services.pinecone_service import pinecone_service

    report = SourceReport(source="Vector DB Chunks")

    if not pinecone_service.is_available:
        report.checks.append(QualityCheck(
            name="Index Connectivity",
            status="fail",
            detail="Pinecone unavailable — PINECONE_API_KEY not set or index not initialized",
        ))
        report.checks.append(QualityCheck(
            name="Namespace Population",
            status="fail",
            detail="Cannot check namespaces — Pinecone unavailable",
        ))
        return report

    try:
        # Run sync Pinecone call in executor to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        stats = await asyncio.wait_for(
            loop.run_in_executor(None, pinecone_service._index.describe_index_stats),
            timeout=15.0,
        )
        total_vectors = stats.total_vector_count
        namespaces = stats.namespaces or {}
        report.total = total_vectors

        # ── Check 1: Coverage (≥1,000 vectors) ───────────────────────────
        threshold = 1000
        report.checks.append(QualityCheck(
            name="Coverage (≥1,000 vectors)",
            status="pass" if total_vectors >= threshold else "fail",
            detail=f"{total_vectors:,} vectors in index (threshold: {threshold:,})",
            count=total_vectors,
            flagged=0 if total_vectors >= threshold else 1,
        ))

        # ── Check 2: Namespace Population ────────────────────────────────
        expected_ns = "traces"
        ns_count = namespaces.get(expected_ns, {})
        ns_vectors = getattr(ns_count, "vector_count", 0) if hasattr(ns_count, "vector_count") else (ns_count.get("vector_count", 0) if isinstance(ns_count, dict) else 0)
        empty_ns = [ns for ns, info in namespaces.items() if (getattr(info, "vector_count", 0) if hasattr(info, "vector_count") else 0) == 0]
        report.checks.append(QualityCheck(
            name="Namespace Population",
            status="pass" if expected_ns in namespaces else "warn",
            detail=(
                f"Namespaces: {list(namespaces.keys()) or ['(default)']}. "
                f"'{expected_ns}' namespace: {ns_vectors:,} vectors"
            ),
            count=len(namespaces),
            flagged=len(empty_ns),
        ))

    except asyncio.TimeoutError:
        report.checks.append(QualityCheck(
            name="Coverage (≥1,000 vectors)",
            status="fail",
            detail="Pinecone timed out after 15s — index may be unreachable",
        ))
        report.checks.append(QualityCheck(
            name="Namespace Population",
            status="fail",
            detail="Pinecone timed out — cannot check namespaces",
        ))
    except Exception as exc:
        report.checks.append(QualityCheck(
            name="Coverage (≥1,000 vectors)",
            status="fail",
            detail=f"Error querying Pinecone stats: {exc}",
        ))
        report.checks.append(QualityCheck(
            name="Namespace Population",
            status="fail",
            detail=f"Error querying Pinecone: {exc}",
        ))

    return report


def _check_tool_call_logs(sessions: list[dict]) -> SourceReport:
    """2 checks on tool call data across all ingested sessions."""
    # Collect all tool calls; track which session each call belongs to
    tool_stats: dict[str, dict] = {}  # tool_name -> {total, failed, latencies, session_ids}
    # session_id -> list of (tool_name, latency) for outlier linking
    session_tool_latencies: dict[str, list[float]] = {}

    for data in sessions:
        sid = data.get("session_id", "")
        for tc in data.get("tool_calls", []):
            name = tc.get("tool_name", "unknown")
            if name not in tool_stats:
                tool_stats[name] = {"total": 0, "failed": 0, "latencies": [], "session_ids": set()}
            tool_stats[name]["total"] += 1
            tool_stats[name]["session_ids"].add(sid)
            status = tc.get("status", "")
            if status in (ToolCallStatus.FAILED, ToolCallStatus.TIMEOUT, "failed", "timeout"):
                tool_stats[name]["failed"] += 1
            lat = tc.get("latency_ms")
            if lat is not None:
                tool_stats[name]["latencies"].append(float(lat))
                session_tool_latencies.setdefault(sid, []).append(float(lat))

    total_calls = sum(s["total"] for s in tool_stats.values())
    report = SourceReport(source="Tool Call Logs", total=total_calls)

    if total_calls == 0:
        report.checks.append(QualityCheck(
            name="Error Rate Monitoring",
            status="warn",
            detail="No tool calls found in ingested sessions",
        ))
        report.checks.append(QualityCheck(
            name="Latency Outlier Detection",
            status="warn",
            detail="No tool calls found — cannot compute latency statistics",
        ))
        return report

    # ── Check 1: Error Rate per tool (>10% → warn) ────────────────────────
    high_error_tools = []
    error_rate_session_ids: set[str] = set()
    for name, s in tool_stats.items():
        if s["total"] > 0:
            rate = s["failed"] / s["total"]
            if rate > 0.10:
                high_error_tools.append(f"{name} ({rate:.0%} error rate)")
                error_rate_session_ids.update(s["session_ids"])

    report.checks.append(QualityCheck(
        name="Error Rate Monitoring",
        status="warn" if high_error_tools else "pass",
        detail=(
            f"High error rate tools (>10%): {', '.join(high_error_tools)}"
            if high_error_tools
            else f"All {len(tool_stats)} tools within acceptable error rate (<10%)"
        ),
        count=len(tool_stats),
        flagged=len(high_error_tools),
        flagged_session_ids=sorted(error_rate_session_ids),
    ))

    # ── Check 2: Latency Outliers (>mean + 3σ) ────────────────────────────
    all_latencies = [lat for s in tool_stats.values() for lat in s["latencies"]]
    outlier_count = 0
    outlier_detail = "Insufficient latency data"
    outlier_session_ids: set[str] = set()

    if len(all_latencies) >= 3:
        mean_lat = sum(all_latencies) / len(all_latencies)
        variance = sum((x - mean_lat) ** 2 for x in all_latencies) / len(all_latencies)
        std_lat = math.sqrt(variance)
        threshold_lat = mean_lat + 3 * std_lat
        outlier_count = sum(1 for x in all_latencies if x > threshold_lat)
        outlier_detail = (
            f"mean={mean_lat:.0f}ms, σ={std_lat:.0f}ms, "
            f"threshold={threshold_lat:.0f}ms — "
            f"{outlier_count} outlier call(s) flagged"
        )
        # Collect sessions that have at least one outlier latency call
        for sid, lats in session_tool_latencies.items():
            if any(lat > threshold_lat for lat in lats):
                outlier_session_ids.add(sid)

    report.checks.append(QualityCheck(
        name="Latency Outlier Detection (>3σ)",
        status="warn" if outlier_count > 0 else "pass",
        detail=outlier_detail,
        count=len(all_latencies),
        flagged=outlier_count,
        flagged_session_ids=sorted(outlier_session_ids),
    ))

    return report


def _check_user_feedback(total_analyzed: int = 0) -> SourceReport:
    """2 checks on user feedback data (framework ready; no feedback collected yet)."""
    report = SourceReport(source="User Feedback")

    sessions_with_feedback = 0  # No feedback store yet — always 0

    # ── Check 1: Coverage (% sessions with feedback) ──────────────────────
    coverage_pct = (sessions_with_feedback / max(total_analyzed, 1)) * 100
    report.checks.append(QualityCheck(
        name="Coverage",
        status="warn" if coverage_pct < 10 else "pass",
        detail=(
            f"{sessions_with_feedback}/{total_analyzed} analyzed sessions have user feedback "
            f"({coverage_pct:.0f}%). Feedback collection not yet enabled."
        ),
        count=total_analyzed,
        flagged=total_analyzed - sessions_with_feedback,
    ))

    # ── Check 2: Label Distribution (>90% positive = biased) ─────────────
    report.checks.append(QualityCheck(
        name="Label Distribution",
        status="pass",
        detail="No feedback data collected yet — label bias check will run once feedback is enabled.",
        count=0,
        flagged=0,
    ))

    return report


def _build_summary_text(sources: list[SourceReport], generated_at: str) -> str:
    """Generate the formatted quality report text shown in the proposal."""
    date_str = generated_at[:10]
    lines = [
        f"{'═' * 51}",
        f"║{'DATA QUALITY REPORT — ' + date_str:^49}║",
        f"{'╠' + '═' * 49 + '╣'}",
    ]
    for src in sources:
        icon = "✅" if src.status == "pass" else ("⚠️ " if src.status == "warn" else "🔴")
        lines.append(f"║ {icon} {src.source:<45}║")
        for chk in src.checks:
            chk_icon = "  ✅" if chk.status == "pass" else ("  ⚠️ " if chk.status == "warn" else "  🔴")
            label = f"{chk_icon} {chk.name}: {chk.detail}"
            # Wrap at 47 chars
            for i in range(0, max(len(label), 1), 47):
                lines.append(f"║  {label[i:i+47]:<47}║")
    lines.append(f"{'╚' + '═' * 49 + '╝'}")
    return "\n".join(lines)


@router.get("/qc/report", response_model=ApiResponse[DataQualityReport])
async def data_quality_report(request: Request) -> ApiResponse[DataQualityReport]:
    """Run the full automated data quality report across all 4 sources.

    Checks:
      Source 1 — Agent Traces   : schema validation, completeness
      Source 2 — Vector DB      : coverage (≥1,000 vectors), namespace population
      Source 3 — Tool Call Logs : error rate per tool (>10%), latency outliers (>3σ)
      Source 4 — User Feedback  : session coverage, label distribution bias
    """
    generated_at = datetime.now(timezone.utc).isoformat()
    request_id = str(uuid.uuid4())
    start = time.perf_counter()

    try:
        from app.services.postgres_service import postgres_service

        # Fetch sessions scoped to this org
        org_id = get_data_org_id(request)
        sessions = await postgres_service.get_all_sessions(limit=500, org_id=org_id)
        session_count = len(sessions)

        # Only run Pinecone/vector checks if org has ingested data — prevents
        # showing global vector stats to orgs that haven't ingested anything yet.
        if org_id and session_count == 0:
            vector_report = SourceReport(source="Vector DB Chunks")
            vector_report.checks.append(QualityCheck(
                name="Coverage",
                status="pass",
                detail="No sessions ingested yet — vector check will run after first ingest.",
            ))
            vector_report.checks.append(QualityCheck(
                name="Namespace Population",
                status="pass",
                detail="No sessions ingested yet.",
            ))
        else:
            vector_report = await _check_vector_db()

        sources = [
            _check_agent_traces(sessions).compute_status(),
            vector_report.compute_status(),
            _check_tool_call_logs(sessions).compute_status(),
            _check_user_feedback(session_count).compute_status(),
        ]

        all_statuses = [s.status for s in sources]
        overall = "fail" if "fail" in all_statuses else ("warn" if "warn" in all_statuses else "pass")

        summary = _build_summary_text(sources, generated_at)

        logger.info("qc_report_generated", overall=overall, sources=len(sources))

        return ApiResponse(
            data=DataQualityReport(
                generated_at=generated_at,
                overall_status=overall,
                sources=sources,
                summary_text=summary,
            ),
            metadata=ResponseMetadata(
                request_id=request_id,
                duration_ms=(time.perf_counter() - start) * 1000,
            ),
        )
    except Exception as exc:
        logger.error("qc_report_failed", error=str(exc))
        return ApiResponse(
            error=f"Quality report failed: {exc!s}",
            metadata=ResponseMetadata(
                request_id=request_id,
                duration_ms=(time.perf_counter() - start) * 1000,
            ),
        )
