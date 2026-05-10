"""Unit tests for the rule-based confidence scorer.

Tests every signal path for all 4 failure types, verifies clamping,
determinism, and the LLM adjustment mechanics.
"""

import pytest
from app.agents.nodes.confidence import (
    compute_confidence,
    _TIMEOUT_LATENCY_MS,
    _LOW_SCORE_THRESHOLD,
    _VERY_LOW_SCORE_THRESHOLD,
)
from app.models.trace import (
    FailureType, Session, LLMCall, ToolCall, RetrievalEvent, ToolCallStatus,
)

# ── Helpers ────────────────────────────────────────────────────────────────────

def make_session(**kwargs) -> Session:
    defaults = dict(
        session_id="test-session",
        agent_id="test-agent",
        outcome="failure",
        llm_calls=[],
        tool_calls=[],
        retrieval_events=[],
    )
    defaults.update(kwargs)
    return Session(**defaults)


def make_tool_call(status=ToolCallStatus.SUCCESS, error=None, latency_ms=500.0, name="test_tool"):
    return ToolCall(
        call_id="tc-1",
        tool_name=name,
        status=status,
        error=error,
        latency_ms=latency_ms,
    )


def make_retrieval(chunks=3, scores=None, expected=None, actual=None):
    return RetrievalEvent(
        event_id="re-1",
        query="test query",
        chunks_returned=chunks,
        relevance_scores=scores or [],
        expected_doc_ids=expected or [],
        actual_doc_ids=actual or [],
    )


def make_llm_call(hallucination_flag=False, source_documents=None, response="ok"):
    return LLMCall(
        call_id="lc-1",
        model="gpt-4o-mini",
        prompt="test",
        response=response,
        hallucination_flag=hallucination_flag,
        source_documents=source_documents or [],
    )


# ── Determinism ────────────────────────────────────────────────────────────────

class TestDeterminism:
    def test_same_input_same_output(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="permission denied")]
        )
        score1, _ = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.8)
        score2, _ = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.8)
        assert score1 == score2

    def test_different_llm_scores_produce_different_finals(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        low, _ = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.0)
        high, _ = compute_confidence(session, FailureType.TOOL_MISFIRE, 1.0)
        assert high > low
        assert abs(high - low) <= 0.15 + 0.001  # max LLM adjustment range


# ── Clamping ───────────────────────────────────────────────────────────────────

class TestClamping:
    def test_score_never_exceeds_095(self):
        session = make_session(
            tool_calls=[
                make_tool_call(status=ToolCallStatus.FAILED, error="err", latency_ms=10000),
                make_tool_call(status=ToolCallStatus.FAILED, error="err2", name="t2"),
            ]
        )
        score, _ = compute_confidence(session, FailureType.TOOL_MISFIRE, 1.0)
        assert score <= 0.95

    def test_score_never_below_005(self):
        session = make_session()
        score, _ = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.0)
        assert score >= 0.05

    def test_llm_adjustment_bounded(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="e")]
        )
        s_low, bd_low   = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.0)
        s_high, bd_high = compute_confidence(session, FailureType.TOOL_MISFIRE, 1.0)
        assert abs(bd_high.llm_adjustment - bd_low.llm_adjustment) <= 0.15 + 0.001


# ── Tool Misfire Scoring ───────────────────────────────────────────────────────

class TestToolMisfire:
    def test_failed_tool_with_error_is_high_confidence(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="PermissionError")]
        )
        score, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.7)
        assert score >= 0.60
        signal_names = [s["signal"] for s in bd.signals]
        assert "failed_tool_call_status" in signal_names
        assert "explicit_error_message" in signal_names

    def test_timeout_adds_signal(self):
        """Status=FAILED + high latency → timeout_latency_confirmed (doubly confirmed)."""
        session = make_session(
            tool_calls=[make_tool_call(
                status=ToolCallStatus.FAILED,
                error="timeout",
                latency_ms=_TIMEOUT_LATENCY_MS + 1
            )]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.5)
        signal_names = [s["signal"] for s in bd.signals]
        assert "timeout_latency_confirmed" in signal_names

    def test_cascade_multiple_failures_adds_signal(self):
        session = make_session(
            tool_calls=[
                make_tool_call(status=ToolCallStatus.FAILED, error="e1"),
                make_tool_call(status=ToolCallStatus.FAILED, error="e2", name="t2"),
            ]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.5)
        signal_names = [s["signal"] for s in bd.signals]
        assert "cascade_failures" in signal_names

    def test_failed_without_error_penalised(self):
        with_error = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        without_error = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED)]
        )
        score_w, _ = compute_confidence(with_error, FailureType.TOOL_MISFIRE, 0.5)
        score_wo, _ = compute_confidence(without_error, FailureType.TOOL_MISFIRE, 0.5)
        assert score_w > score_wo

    def test_no_failed_tools_is_low_confidence(self):
        session = make_session(tool_calls=[make_tool_call(status=ToolCallStatus.SUCCESS)])
        score, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.5)
        assert score < 0.30
        assert any(s["signal"] == "no_failed_tools" for s in bd.signals)


# ── Memory Scoring ─────────────────────────────────────────────────────────────

class TestMemory:
    def test_doc_id_full_miss_is_highest_confidence(self):
        """Expected docs set but nothing retrieved — strongest memory signal."""
        session = make_session(
            retrieval_events=[
                make_retrieval(
                    chunks=0,
                    scores=[],
                    expected=["doc-correct"],
                    actual=[],        # BUG FIX: actual empty was previously missed
                )
            ]
        )
        score, bd = compute_confidence(session, FailureType.MEMORY, 0.7)
        assert score >= 0.55
        assert any(s["signal"] == "doc_id_full_miss" for s in bd.signals)

    def test_doc_id_partial_mismatch_is_lower_than_full_miss(self):
        """Partial overlap should score lower than zero overlap."""
        full_miss = make_session(
            retrieval_events=[make_retrieval(expected=["a","b"], actual=[])]
        )
        partial = make_session(
            retrieval_events=[make_retrieval(expected=["a","b"], actual=["a","x"])]
        )
        s_full, _    = compute_confidence(full_miss, FailureType.MEMORY, 0.5)
        s_partial, _ = compute_confidence(partial, FailureType.MEMORY, 0.5)
        assert s_full > s_partial

    def test_doc_id_match_no_mismatch_signal(self):
        session = make_session(
            retrieval_events=[
                make_retrieval(
                    expected=["doc-1"],
                    actual=["doc-1"],
                    scores=[0.3],
                )
            ]
        )
        _, bd = compute_confidence(session, FailureType.MEMORY, 0.5)
        assert not any(
            s["signal"] in ("doc_id_mismatch", "doc_id_full_miss", "doc_id_partial_mismatch")
            for s in bd.signals
        )

    def test_very_low_scores_scored_higher_than_low(self):
        very_low = make_session(
            retrieval_events=[make_retrieval(scores=[_VERY_LOW_SCORE_THRESHOLD - 0.05])]
        )
        low = make_session(
            retrieval_events=[make_retrieval(scores=[_LOW_SCORE_THRESHOLD - 0.05])]
        )
        s_vl, _ = compute_confidence(very_low, FailureType.MEMORY, 0.5)
        s_l, _ = compute_confidence(low, FailureType.MEMORY, 0.5)
        assert s_vl > s_l

    def test_failure_summary_keyword_adds_signal(self):
        without_kw = make_session(
            retrieval_events=[make_retrieval(scores=[0.3])]
        )
        with_kw = make_session(
            retrieval_events=[make_retrieval(scores=[0.3])],
            failure_summary="Retrieved stale documents for query",
        )
        s_no, _  = compute_confidence(without_kw, FailureType.MEMORY, 0.5)
        s_yes, bd = compute_confidence(with_kw, FailureType.MEMORY, 0.5)
        assert s_yes > s_no
        assert any(s["signal"] == "failure_summary_confirms" for s in bd.signals)

    def test_no_retrieval_events_is_low_confidence(self):
        session = make_session()
        score, _ = compute_confidence(session, FailureType.MEMORY, 0.5)
        assert score < 0.30


# ── Hallucination Scoring ──────────────────────────────────────────────────────

class TestHallucination:
    def test_hallucination_flag_plus_no_sources_is_high(self):
        session = make_session(
            llm_calls=[make_llm_call(hallucination_flag=True, source_documents=[])]
        )
        score, bd = compute_confidence(session, FailureType.HALLUCINATION, 0.7)
        assert score >= 0.60
        signal_names = [s["signal"] for s in bd.signals]
        assert "hallucination_flag" in signal_names
        assert "no_source_documents" in signal_names

    def test_flag_alone_scores_decently(self):
        session = make_session(
            llm_calls=[make_llm_call(hallucination_flag=True, source_documents=["doc-1"])]
        )
        score, _ = compute_confidence(session, FailureType.HALLUCINATION, 0.5)
        assert score >= 0.30

    def test_all_calls_flagged_scores_higher_than_one_of_many(self):
        """Proportion of flagged calls affects hallucination confidence."""
        all_flagged = make_session(llm_calls=[
            make_llm_call(hallucination_flag=True),
            make_llm_call(hallucination_flag=True),
        ])
        one_of_two = make_session(llm_calls=[
            make_llm_call(hallucination_flag=True),
            make_llm_call(hallucination_flag=False),
        ])
        s_all, bd_all = compute_confidence(all_flagged, FailureType.HALLUCINATION, 0.5)
        s_one, bd_one = compute_confidence(one_of_two, FailureType.HALLUCINATION, 0.5)
        assert s_all > s_one

    def test_latency_timeout_on_success_status_caught(self):
        """Tool SUCCESS status but latency exceeded threshold — weaker but detected.
        base = 0.25 (latency_timeout_only) - 0.10 (no_error_detail) = 0.15.
        Intentionally lower than explicit failure — SUCCESS status is ambiguous.
        """
        session = make_session(
            tool_calls=[make_tool_call(
                status=ToolCallStatus.SUCCESS,
                latency_ms=_TIMEOUT_LATENCY_MS + 1000,
            )]
        )
        score, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.5)
        assert score >= 0.10   # weaker signal — no explicit failure status
        assert any(s["signal"] == "latency_timeout_only" for s in bd.signals)

    def test_relevant_docs_retrieved_adds_signal(self):
        without_ret = make_session(
            llm_calls=[make_llm_call(hallucination_flag=True)]
        )
        with_ret = make_session(
            llm_calls=[make_llm_call(hallucination_flag=True)],
            retrieval_events=[make_retrieval(scores=[0.75])]
        )
        s_no, _   = compute_confidence(without_ret, FailureType.HALLUCINATION, 0.5)
        s_yes, bd = compute_confidence(with_ret, FailureType.HALLUCINATION, 0.5)
        assert s_yes > s_no
        assert any(s["signal"] == "relevant_docs_retrieved" for s in bd.signals)

    def test_no_signals_penalised(self):
        session = make_session(
            llm_calls=[make_llm_call(source_documents=["doc-1"])]
        )
        score, bd = compute_confidence(session, FailureType.HALLUCINATION, 0.5)
        assert score < 0.35
        assert any(s["signal"] == "no_direct_hallucination_signals" for s in bd.signals)


# ── Blind Spot Scoring ─────────────────────────────────────────────────────────

class TestBlindSpot:
    def test_zero_chunks_is_high_confidence(self):
        session = make_session(
            retrieval_events=[make_retrieval(chunks=0, scores=[])]
        )
        score, bd = compute_confidence(session, FailureType.BLIND_SPOT, 0.7)
        # base=0.50 (zero_chunks) + llm_adj=0.03 (0.7→+0.03) = 0.53
        assert score >= 0.50
        assert any(s["signal"] == "zero_chunks_returned" for s in bd.signals)

    def test_all_very_low_scores_adds_signal(self):
        session = make_session(
            retrieval_events=[make_retrieval(
                chunks=2, scores=[_VERY_LOW_SCORE_THRESHOLD - 0.05] * 2
            )]
        )
        _, bd = compute_confidence(session, FailureType.BLIND_SPOT, 0.5)
        assert any(s["signal"] == "all_scores_very_low" for s in bd.signals)

    def test_agent_acknowledged_gap_adds_signal(self):
        session = make_session(
            retrieval_events=[make_retrieval(chunks=0)],
            failure_summary="No information found for this query",
        )
        _, bd = compute_confidence(session, FailureType.BLIND_SPOT, 0.5)
        assert any(s["signal"] == "agent_acknowledged_gap" for s in bd.signals)

    def test_partial_coverage_penalised(self):
        full_gap = make_session(
            retrieval_events=[make_retrieval(chunks=0)]
        )
        partial = make_session(
            retrieval_events=[make_retrieval(chunks=2, scores=[0.6])]
        )
        s_full, _     = compute_confidence(full_gap, FailureType.BLIND_SPOT, 0.5)
        s_partial, bd = compute_confidence(partial, FailureType.BLIND_SPOT, 0.5)
        assert s_full > s_partial
        assert any(s["signal"] == "partial_coverage_found" for s in bd.signals)

    def test_no_retrieval_events_is_low_moderate(self):
        session = make_session()
        score, bd = compute_confidence(session, FailureType.BLIND_SPOT, 0.5)
        assert 0.10 <= score <= 0.40
        assert any(s["signal"] == "no_retrieval_events" for s in bd.signals)


# ── LLM Adjustment Mechanics ───────────────────────────────────────────────────

class TestLLMAdjustment:
    def test_neutral_llm_score_zero_adjustment(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.5)
        assert bd.llm_adjustment == 0.0

    def test_high_llm_score_positive_adjustment(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 1.0)
        assert bd.llm_adjustment > 0

    def test_low_llm_score_negative_adjustment(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.0)
        assert bd.llm_adjustment < 0

    def test_max_adjustment_is_bounded(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 1.0)
        assert bd.llm_adjustment <= 0.075 + 0.001

        _, bd2 = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.0)
        assert bd2.llm_adjustment >= -0.075 - 0.001


# ── Breakdown Structure ────────────────────────────────────────────────────────

class TestBreakdown:
    def test_breakdown_has_all_fields(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        score, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.7)
        assert bd.failure_type == str(FailureType.TOOL_MISFIRE)
        assert bd.base_score > 0
        assert isinstance(bd.llm_adjustment, float)
        assert bd.final_score == score
        assert len(bd.signals) > 0

    def test_every_signal_has_required_keys(self):
        session = make_session(
            tool_calls=[
                make_tool_call(status=ToolCallStatus.FAILED, error="err", latency_ms=10000),
                make_tool_call(status=ToolCallStatus.FAILED, error="e2", name="t2"),
            ]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.8)
        for sig in bd.signals:
            assert "signal" in sig
            assert "weight" in sig
            assert "detail" in sig

    def test_to_log_dict_is_serialisable(self):
        import json
        session = make_session(
            retrieval_events=[make_retrieval(chunks=0)]
        )
        _, bd = compute_confidence(session, FailureType.BLIND_SPOT, 0.6)
        d = bd.to_log_dict()
        assert json.dumps(d)   # must be JSON-serialisable

    def test_base_score_matches_sum_of_signal_weights(self):
        session = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        _, bd = compute_confidence(session, FailureType.TOOL_MISFIRE, 0.5)
        expected_base = round(sum(s["weight"] for s in bd.signals), 4)
        assert abs(bd.base_score - expected_base) < 0.001


# ── Ordering guarantees ────────────────────────────────────────────────────────

class TestOrdering:
    """Stronger evidence must always produce higher score than weaker evidence."""

    def test_tool_with_error_beats_without(self):
        with_err = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED, error="err")]
        )
        without_err = make_session(
            tool_calls=[make_tool_call(status=ToolCallStatus.FAILED)]
        )
        s1, _ = compute_confidence(with_err, FailureType.TOOL_MISFIRE, 0.5)
        s2, _ = compute_confidence(without_err, FailureType.TOOL_MISFIRE, 0.5)
        assert s1 > s2

    def test_doc_id_mismatch_beats_low_scores_only(self):
        mismatch = make_session(
            retrieval_events=[make_retrieval(
                scores=[0.2], expected=["doc-a"], actual=["doc-b"]
            )]
        )
        low_only = make_session(
            retrieval_events=[make_retrieval(scores=[0.2])]
        )
        s1, _ = compute_confidence(mismatch, FailureType.MEMORY, 0.5)
        s2, _ = compute_confidence(low_only, FailureType.MEMORY, 0.5)
        assert s1 > s2

    def test_full_miss_beats_partial_mismatch(self):
        """Zero overlap is stronger signal than partial overlap."""
        full = make_session(
            retrieval_events=[make_retrieval(expected=["a","b","c"], actual=[])]
        )
        partial = make_session(
            retrieval_events=[make_retrieval(expected=["a","b","c"], actual=["a","b","x"])]
        )
        s_full, _   = compute_confidence(full, FailureType.MEMORY, 0.5)
        s_partial, _ = compute_confidence(partial, FailureType.MEMORY, 0.5)
        assert s_full > s_partial

    def test_hallucination_flag_beats_no_flag(self):
        flagged = make_session(llm_calls=[make_llm_call(hallucination_flag=True)])
        clean   = make_session(llm_calls=[make_llm_call(hallucination_flag=False)])
        s1, _ = compute_confidence(flagged, FailureType.HALLUCINATION, 0.5)
        s2, _ = compute_confidence(clean, FailureType.HALLUCINATION, 0.5)
        assert s1 > s2

    def test_zero_chunks_beats_partial_coverage(self):
        zero    = make_session(retrieval_events=[make_retrieval(chunks=0)])
        partial = make_session(retrieval_events=[make_retrieval(chunks=2, scores=[0.7])])
        s1, _ = compute_confidence(zero, FailureType.BLIND_SPOT, 0.5)
        s2, _ = compute_confidence(partial, FailureType.BLIND_SPOT, 0.5)
        assert s1 > s2
