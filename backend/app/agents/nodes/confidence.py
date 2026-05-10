"""Rule-based confidence scorer for Aethen analysis results.

Replaces LLM self-reported confidence with a deterministic, evidence-driven
score computed from measurable signals in the session trace.

Design principles:
- Fully deterministic — same input always produces same output
- Evidence-based — every point contribution is traceable to a specific signal
- LLM score is a secondary ±adjustment, not the primary value
- Capped at 0.95 (never claim certainty; evidence could be incomplete)
- Min at 0.05 (even weak evidence is meaningful)

Score composition:
  base_score   — sum of signal weights for the classified failure type
  llm_adjust   — (llm_confidence - 0.5) × 0.15  (secondary ±adjustment)
  final        — clamp(base + llm_adjust, 0.05, 0.95)
"""

from dataclasses import dataclass, field

import structlog

from app.models.trace import FailureType, Session, ToolCallStatus

logger = structlog.get_logger()

# Latency threshold above which a tool call is considered a timeout candidate
_TIMEOUT_LATENCY_MS = 5_000.0

# Retrieval score threshold below which evidence is considered weak
_LOW_SCORE_THRESHOLD = 0.5
_VERY_LOW_SCORE_THRESHOLD = 0.3


@dataclass
class ConfidenceBreakdown:
    """Detailed breakdown of every signal that contributed to the final score."""

    failure_type: str
    base_score: float
    llm_adjustment: float
    final_score: float
    signals: list[dict] = field(default_factory=list)

    def add(self, signal: str, weight: float, detail: str = "") -> None:
        self.signals.append({"signal": signal, "weight": weight, "detail": detail})
        self.base_score = round(self.base_score + weight, 4)

    def to_log_dict(self) -> dict:
        return {
            "failure_type": self.failure_type,
            "base_score": self.base_score,
            "llm_adjustment": self.llm_adjustment,
            "final_score": self.final_score,
            "signals": self.signals,
        }


def compute_confidence(
    session: Session,
    failure_type: FailureType,
    llm_confidence: float,
) -> tuple[float, ConfidenceBreakdown]:
    """Compute a deterministic, evidence-based confidence score.

    Args:
        session:        The session being analysed (provides all trace evidence).
        failure_type:   The classified failure type (drives which signals are scored).
        llm_confidence: Raw confidence value returned by the LLM (0.0–1.0).
                        Used only as a ±0.15 secondary adjustment.

    Returns:
        (final_score, breakdown) — score in [0.05, 0.95], full signal breakdown.
    """
    bd = ConfidenceBreakdown(
        failure_type=str(failure_type),
        base_score=0.0,
        llm_adjustment=0.0,
        final_score=0.0,
    )

    if failure_type == FailureType.TOOL_MISFIRE:
        _score_tool_misfire(session, bd)
    elif failure_type == FailureType.MEMORY:
        _score_memory(session, bd)
    elif failure_type == FailureType.HALLUCINATION:
        _score_hallucination(session, bd)
    elif failure_type == FailureType.BLIND_SPOT:
        _score_blind_spot(session, bd)
    else:
        # UNKNOWN — should not reach here (early_exit fires first), but guard anyway
        bd.final_score = 0.0
        return 0.0, bd

    # Secondary LLM adjustment — keeps human intuition in the loop without
    # letting it dominate. Range: llm=0.0 → -0.075; llm=1.0 → +0.075
    llm_adj = round((llm_confidence - 0.5) * 0.15, 4)
    bd.llm_adjustment = llm_adj

    final = round(max(0.05, min(0.95, bd.base_score + llm_adj)), 3)
    bd.final_score = final

    logger.info(
        "confidence_computed",
        failure_type=str(failure_type),
        base=bd.base_score,
        llm_raw=llm_confidence,
        llm_adj=llm_adj,
        final=final,
        signals=[s["signal"] for s in bd.signals],
    )
    return final, bd


# ── Signal scorers per failure type ───────────────────────────────────────────

def _score_tool_misfire(session: Session, bd: ConfidenceBreakdown) -> None:
    """Tool call failures are the most unambiguous — evidence is structural."""
    # Explicit status failures
    status_failed = [
        tc for tc in session.tool_calls
        if tc.status in (ToolCallStatus.FAILED, ToolCallStatus.TIMEOUT, "failed", "timeout")
    ]
    # Timeout via latency on ANY status (tool may report SUCCESS despite hanging)
    latency_timed_out = [
        tc for tc in session.tool_calls
        if tc.latency_ms >= _TIMEOUT_LATENCY_MS and tc not in status_failed
    ]
    failed_tools = status_failed + latency_timed_out

    if not failed_tools:
        bd.add("no_failed_tools", 0.10,
               "classified as tool_misfire but no failed/timeout tool calls found")
        return

    # Core: explicit status failure vs latency-only timeout
    if status_failed:
        bd.add("failed_tool_call_status", 0.45,
               f"{len(status_failed)} tool call(s) with explicit failed/timeout status")
    else:
        bd.add("latency_timeout_only", 0.25,
               f"no explicit failure status, but {len(latency_timed_out)} call(s) "
               f"exceeded {_TIMEOUT_LATENCY_MS:.0f}ms latency threshold")

    # Strongest detail: error message distinguishes config error from transient
    tools_with_error = [tc for tc in failed_tools if tc.error]
    if tools_with_error:
        bd.add("explicit_error_message", 0.25,
               f"error: '{tools_with_error[0].error[:80]}'")

    # Timeout signal: high latency in status-failed tools (doubly confirmed)
    status_timed_out = [tc for tc in status_failed if tc.latency_ms >= _TIMEOUT_LATENCY_MS]
    if status_timed_out:
        bd.add("timeout_latency_confirmed", 0.10,
               f"latency={status_timed_out[0].latency_ms:.0f}ms AND status=timeout/failed")

    # Cascade: multiple tools failed (one failure triggered others)
    if len(failed_tools) > 1:
        bd.add("cascade_failures", 0.10,
               f"{len(failed_tools)} tools failed — likely cascaded")

    # Penalty: no error message (harder to diagnose root cause)
    if not tools_with_error:
        bd.add("no_error_detail", -0.10,
               "failed status with no error message — cause unclear")


def _score_memory(session: Session, bd: ConfidenceBreakdown) -> None:
    """Retrieval failures — strongest signal is doc ID mismatch."""
    if not session.retrieval_events:
        bd.add("no_retrieval_events", 0.15,
               "classified as memory but no retrieval events — weaker evidence")
        return

    doc_mismatch_found = False
    low_score_found = False
    very_low_score_found = False

    for evt in session.retrieval_events:
        # Strongest: expected_doc_ids mismatch.
        # Bug fix: check expected_doc_ids alone (actual may be empty — nothing retrieved)
        if evt.expected_doc_ids:
            expected = set(evt.expected_doc_ids)
            actual   = set(evt.actual_doc_ids)   # may be empty — that's still a mismatch

            if expected != actual:
                overlap = len(expected & actual)
                overlap_pct = overlap / len(expected) if expected else 0.0

                if overlap == 0:
                    # Worst case: none of the expected docs retrieved
                    bd.add("doc_id_full_miss", 0.58,
                           f"expected {sorted(expected)[:3]} — got nothing matching "
                           f"(actual={sorted(actual)[:3] or 'empty'})")
                else:
                    # Partial overlap — scale weight by miss fraction
                    miss_fraction = 1.0 - overlap_pct
                    weight = round(0.55 * miss_fraction + 0.20, 3)
                    bd.add("doc_id_partial_mismatch", weight,
                           f"expected {sorted(expected)[:3]} — got {sorted(actual)[:3]} "
                           f"(overlap={overlap}/{len(expected)}, "
                           f"miss={miss_fraction:.0%})")
                doc_mismatch_found = True
                break  # one confirmed event is sufficient

        # Secondary: low relevance scores
        if evt.relevance_scores:
            max_score = max(evt.relevance_scores)
            if max_score < _VERY_LOW_SCORE_THRESHOLD:
                very_low_score_found = True
            elif max_score < _LOW_SCORE_THRESHOLD:
                low_score_found = True

    if not doc_mismatch_found:
        if very_low_score_found:
            bd.add("very_low_retrieval_scores", 0.30,
                   f"max score < {_VERY_LOW_SCORE_THRESHOLD} — wrong content domain likely")
        elif low_score_found:
            bd.add("low_retrieval_scores", 0.20,
                   f"max score < {_LOW_SCORE_THRESHOLD} — weak relevance")
        else:
            bd.add("adequate_retrieval_scores", 0.10,
                   "scores ≥ 0.5 — memory misfire less obvious from scores alone")

    # Bonus: LLM called out the mismatch in failure_summary
    if session.failure_summary and any(
        kw in session.failure_summary.lower()
        for kw in ("wrong", "stale", "mismatch", "incorrect", "outdated")
    ):
        bd.add("failure_summary_confirms", 0.10,
               f"failure_summary mentions retrieval issue: '{session.failure_summary[:60]}'")


def _score_hallucination(session: Session, bd: ConfidenceBreakdown) -> None:
    """Hallucination — strongest signal is explicit flag + absence of source docs."""
    halluc_calls = [lc for lc in session.llm_calls if lc.hallucination_flag]
    total_llm = len(session.llm_calls)

    if halluc_calls:
        # Scale by proportion: all calls flagged = maximum signal
        proportion = len(halluc_calls) / total_llm if total_llm else 1.0
        weight = round(0.30 + 0.20 * proportion, 3)   # 0.30 (1 of many) → 0.50 (all flagged)
        bd.add("hallucination_flag", weight,
               f"{len(halluc_calls)}/{total_llm} LLM call(s) with hallucination_flag=True "
               f"({proportion:.0%} of calls)")

    # Grounding gap: response present but no source documents provided
    ungrounded = [
        lc for lc in session.llm_calls
        if lc.response and not lc.source_documents
    ]
    if ungrounded:
        proportion_ug = len(ungrounded) / total_llm if total_llm else 1.0
        bd.add("no_source_documents", round(0.15 + 0.15 * proportion_ug, 3),
               f"{len(ungrounded)}/{total_llm} LLM response(s) with no source_documents")

    # Retrieval scores present but high — docs were retrieved but LLM ignored them
    for evt in session.retrieval_events:
        if evt.relevance_scores and max(evt.relevance_scores) >= _LOW_SCORE_THRESHOLD:
            bd.add("relevant_docs_retrieved", 0.15,
                   f"max score={max(evt.relevance_scores):.2f} — docs were relevant, "
                   f"LLM added claims beyond them")
            break

    # Penalty: no hallucination flag and docs were provided — weaker case
    if not halluc_calls and not ungrounded:
        bd.add("no_direct_hallucination_signals", -0.10,
               "no hallucination_flag and docs were provided — inferred from other signals")


def _score_blind_spot(session: Session, bd: ConfidenceBreakdown) -> None:
    """Blind spot — strongest signal is zero retrieval results."""
    if not session.retrieval_events:
        bd.add("no_retrieval_events", 0.20,
               "no retrieval events at all — complete knowledge gap possible")
        return

    zero_chunk_events = [e for e in session.retrieval_events if e.chunks_returned == 0]
    if zero_chunk_events:
        bd.add("zero_chunks_returned", 0.50,
               f"{len(zero_chunk_events)} retrieval event(s) returned 0 chunks — "
               f"topic absent from KB")

    # All retrieval scores very low — off-topic results returned
    all_scores = [
        score
        for evt in session.retrieval_events
        for score in evt.relevance_scores
    ]
    if all_scores:
        overall_max = max(all_scores)
        if overall_max < _VERY_LOW_SCORE_THRESHOLD:
            bd.add("all_scores_very_low", 0.30,
                   f"max score across all events={overall_max:.2f} — "
                   f"KB has no relevant content for this topic")
        elif overall_max < _LOW_SCORE_THRESHOLD:
            bd.add("all_scores_low", 0.15,
                   f"max score={overall_max:.2f} — marginal coverage only")

    # LLM acknowledged the gap
    if session.failure_summary and any(
        kw in session.failure_summary.lower()
        for kw in ("not found", "no information", "unable to find",
                   "no results", "not available", "don't have")
    ):
        bd.add("agent_acknowledged_gap", 0.15,
               f"failure_summary confirms agent knew it lacked info: "
               f"'{session.failure_summary[:60]}'")

    # Penalty: some chunks were returned — less certain it's a complete blind spot
    if not zero_chunk_events and all_scores and max(all_scores) >= _LOW_SCORE_THRESHOLD:
        bd.add("partial_coverage_found", -0.15,
               "some relevant chunks exist — may be memory failure not blind_spot")
