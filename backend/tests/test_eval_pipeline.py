"""Regression tests for the Aethen eval pipeline.

All tests are CI-safe: no live LLM calls, no DB connections, no network I/O.
Tests cover:
  - metrics.py pure functions (classification, retrieval, synthesis)
  - eval_dataset.json schema validity
  - regression gate logic
"""

import json
from pathlib import Path

import pytest

from app.eval.metrics import (
    REGRESSION_THRESHOLDS,
    ClassificationMetrics,
    RetrievalMetrics,
    SynthesisMetrics,
    _RetrievalSample,
    _pearson_r,
    check_regression_gates,
    compute_classification_metrics,
    compute_retrieval_metrics,
    compute_synthesis_metrics_fast,
    retrieval_sample_from_session,
)
from app.models.trace import FailureType

EVAL_DATASET_PATH = Path(__file__).parent.parent / "data" / "eval_dataset.json"


# ── Classification metrics ─────────────────────────────────────────────────────


def test_classification_accuracy_all_correct():
    preds = [
        ("memory", "memory", 0.9),
        ("tool_misfire", "tool_misfire", 0.85),
        ("hallucination", "hallucination", 0.8),
        ("blind_spot", "blind_spot", 0.75),
    ]
    result = compute_classification_metrics(preds)
    assert result.accuracy == 1.0
    assert result.sample_count == 4


def test_classification_accuracy_all_wrong():
    preds = [
        ("tool_misfire", "memory", 0.5),
        ("memory", "tool_misfire", 0.5),
        ("blind_spot", "hallucination", 0.5),
        ("hallucination", "blind_spot", 0.5),
    ]
    result = compute_classification_metrics(preds)
    assert result.accuracy == 0.0


def test_classification_accuracy_partial():
    preds = [
        ("memory", "memory", 0.9),
        ("memory", "tool_misfire", 0.4),  # wrong
        ("hallucination", "hallucination", 0.8),
        ("blind_spot", "blind_spot", 0.7),
    ]
    result = compute_classification_metrics(preds)
    assert result.accuracy == 0.75


def test_per_class_f1_computed_correctly():
    # memory: 2 TP, 0 FP, 1 FN → precision=1.0, recall=0.667, F1=0.8
    preds = [
        ("memory", "memory", 0.9),
        ("memory", "memory", 0.85),
        ("tool_misfire", "memory", 0.3),   # FP for tool_misfire, FN for memory
        ("tool_misfire", "tool_misfire", 0.8),
    ]
    result = compute_classification_metrics(preds)
    mem = result.per_class["memory"]
    assert mem.precision == 1.0
    assert round(mem.recall, 3) == 0.667
    assert round(mem.f1, 2) == 0.8
    assert mem.support == 3


def test_confusion_matrix_shape():
    preds = [
        ("memory", "memory", 0.9),
        ("tool_misfire", "memory", 0.4),
        ("hallucination", "hallucination", 0.85),
        ("blind_spot", "blind_spot", 0.7),
    ]
    result = compute_classification_metrics(preds)
    assert len(result.confusion_matrix) == 4
    assert all(len(row) == 4 for row in result.confusion_matrix)
    assert result.confusion_labels == ["memory", "tool_misfire", "hallucination", "blind_spot"]


def test_classification_empty_predictions():
    result = compute_classification_metrics([])
    assert result.accuracy == 0.0
    assert result.sample_count == 0
    assert result.confidence_calibration_r == 0.0


def test_confidence_calibration_r_perfect_correlation():
    # High confidence → correct, low confidence → wrong
    preds = [
        ("memory", "memory", 0.95),
        ("memory", "memory", 0.90),
        ("tool_misfire", "memory", 0.10),  # wrong, low confidence
        ("hallucination", "memory", 0.05),  # wrong, low confidence
    ]
    result = compute_classification_metrics(preds)
    assert result.confidence_calibration_r > 0.8


# ── Retrieval metrics ──────────────────────────────────────────────────────────


def test_context_recall_full_match():
    samples = [_RetrievalSample(
        expected_doc_ids=["doc-a", "doc-b"],
        actual_doc_ids=["doc-a", "doc-b", "doc-c"],
        source_documents=["doc-a", "doc-b"],
    )]
    result = compute_retrieval_metrics(samples)
    assert result.context_recall == 1.0
    assert result.hit_rate == 1.0
    assert result.sample_count == 1


def test_context_recall_partial_match():
    samples = [_RetrievalSample(
        expected_doc_ids=["doc-a", "doc-b"],
        actual_doc_ids=["doc-a", "doc-c"],  # doc-b missing
        source_documents=["doc-a"],
    )]
    result = compute_retrieval_metrics(samples)
    assert result.context_recall == 0.5
    assert result.hit_rate == 1.0  # at least one hit


def test_context_recall_no_match():
    samples = [_RetrievalSample(
        expected_doc_ids=["doc-a", "doc-b"],
        actual_doc_ids=["doc-x", "doc-y"],
        source_documents=[],
    )]
    result = compute_retrieval_metrics(samples)
    assert result.context_recall == 0.0
    assert result.hit_rate == 0.0


def test_context_precision_perfect():
    samples = [_RetrievalSample(
        expected_doc_ids=["doc-a"],
        actual_doc_ids=["doc-a", "doc-b"],
        source_documents=["doc-a", "doc-b"],  # all retrieved docs were used
    )]
    result = compute_retrieval_metrics(samples)
    assert result.context_precision == 1.0


def test_context_precision_zero():
    samples = [_RetrievalSample(
        expected_doc_ids=["doc-a"],
        actual_doc_ids=["doc-a", "doc-b"],
        source_documents=["doc-z"],  # LLM used unrelated doc (not from retrieval)
    )]
    result = compute_retrieval_metrics(samples)
    assert result.context_precision == 0.0


def test_retrieval_skips_empty_expected_doc_ids():
    # blind_spot sessions have no expected_doc_ids — should be excluded from recall
    samples = [
        _RetrievalSample(expected_doc_ids=[], actual_doc_ids=["doc-x"], source_documents=[]),
        _RetrievalSample(expected_doc_ids=["doc-a"], actual_doc_ids=["doc-a"], source_documents=["doc-a"]),
    ]
    result = compute_retrieval_metrics(samples)
    assert result.sample_count == 1  # only the second sample counted
    assert result.context_recall == 1.0


def test_retrieval_sample_from_session_extracts_correctly():
    session = {
        "retrieval_events": [{
            "event_id": "ret-001",
            "query": "test",
            "expected_doc_ids": ["doc-a", "doc-b"],
            "actual_doc_ids": ["doc-a", "doc-c"],
        }],
        "llm_calls": [{
            "call_id": "llm-001",
            "model": "gpt-4o-mini",
            "prompt": "test",
            "response": "test",
            "source_documents": ["doc-a"],
        }],
    }
    sample = retrieval_sample_from_session(session)
    assert sample is not None
    assert sample.expected_doc_ids == ["doc-a", "doc-b"]
    assert sample.actual_doc_ids == ["doc-a", "doc-c"]
    assert sample.source_documents == ["doc-a"]


def test_retrieval_sample_none_when_no_retrieval_events():
    session = {"retrieval_events": [], "llm_calls": []}
    assert retrieval_sample_from_session(session) is None


# ── Synthesis metrics ──────────────────────────────────────────────────────────


def test_synthesis_keyword_match_hit():
    results = [
        ("The root cause is a retrieval mismatch — wrong documents were fetched.", ["wrong document", "retrieval", "mismatch"], 0.85),
    ]
    metric = compute_synthesis_metrics_fast(results)
    assert metric.keyword_match_rate == 1.0
    assert metric.avg_confidence == 0.85
    assert metric.mode == "fast"
    assert metric.judge_score is None


def test_synthesis_keyword_match_miss():
    results = [
        ("The system encountered an unexpected error during processing.", ["wrong document", "retrieval", "mismatch"], 0.4),
    ]
    metric = compute_synthesis_metrics_fast(results)
    assert metric.keyword_match_rate == 0.0


def test_synthesis_keyword_match_case_insensitive():
    results = [
        ("Root cause: HALLUCINATION detected in LLM response.", ["hallucination", "fabricated"], 0.9),
    ]
    metric = compute_synthesis_metrics_fast(results)
    assert metric.keyword_match_rate == 1.0


def test_synthesis_keyword_partial_batch():
    results = [
        ("Wrong documents were retrieved causing memory failure.", ["wrong document", "retrieval"], 0.8),
        ("The tool timed out unexpectedly.", ["wrong document", "retrieval"], 0.6),
        ("Retrieval returned stale embeddings.", ["wrong document", "retrieval"], 0.75),
    ]
    metric = compute_synthesis_metrics_fast(results)
    assert metric.keyword_match_rate == pytest.approx(2 / 3, abs=0.01)
    assert metric.avg_confidence == pytest.approx(0.717, abs=0.01)


def test_synthesis_empty_results():
    metric = compute_synthesis_metrics_fast([])
    assert metric.keyword_match_rate == 0.0
    assert metric.sample_count == 0


# ── Eval dataset schema validation ─────────────────────────────────────────────


def test_eval_dataset_exists():
    assert EVAL_DATASET_PATH.exists(), f"eval_dataset.json not found at {EVAL_DATASET_PATH}"


def test_eval_dataset_valid_schema():
    data = json.loads(EVAL_DATASET_PATH.read_text())
    sessions = data["sessions"]
    assert len(sessions) == 100

    required_top = {"session_id", "agent_id", "outcome", "failure_type", "metadata"}
    required_gt = {"failure_type", "root_cause_keywords", "min_confidence"}
    valid_types = {ft.value for ft in FailureType}

    for s in sessions:
        assert required_top.issubset(s.keys()), f"Missing fields in {s.get('session_id')}"
        gt = s["metadata"].get("_ground_truth")
        assert gt is not None, f"No _ground_truth in {s.get('session_id')}"
        assert required_gt.issubset(gt.keys()), f"Missing ground truth fields in {s.get('session_id')}"
        assert gt["failure_type"] in valid_types, f"Invalid failure_type in {s.get('session_id')}"
        assert isinstance(gt["root_cause_keywords"], list)
        assert len(gt["root_cause_keywords"]) >= 2
        assert 0.0 <= gt["min_confidence"] <= 1.0


def test_eval_dataset_type_distribution():
    data = json.loads(EVAL_DATASET_PATH.read_text())
    sessions = data["sessions"]
    by_type: dict[str, int] = {}
    for s in sessions:
        ft = s["metadata"]["_ground_truth"]["failure_type"]
        by_type[ft] = by_type.get(ft, 0) + 1

    for ft in ["memory", "tool_misfire", "hallucination", "blind_spot"]:
        assert by_type.get(ft, 0) == 25, f"Expected 25 {ft} sessions, got {by_type.get(ft, 0)}"


def test_eval_dataset_session_ids_unique():
    data = json.loads(EVAL_DATASET_PATH.read_text())
    ids = [s["session_id"] for s in data["sessions"]]
    assert len(ids) == len(set(ids)), "Duplicate session_ids in eval dataset"


# ── Regression gates ───────────────────────────────────────────────────────────


def _make_metrics(accuracy: float = 0.85, recall: float = 0.75, kwmatch: float = 0.80) -> tuple:
    """Helper: build minimal metric objects for gate tests."""
    classification = ClassificationMetrics(
        accuracy=accuracy, per_class={}, confusion_matrix=[],
        confusion_labels=[], confidence_calibration_r=0.7, sample_count=10,
    )
    retrieval = RetrievalMetrics(
        context_recall=recall, context_precision=0.8, hit_rate=0.9, sample_count=10,
    )
    synthesis = SynthesisMetrics(
        mode="fast", keyword_match_rate=kwmatch, avg_confidence=0.75,
        judge_score=None, sample_count=10,
    )
    return classification, retrieval, synthesis


def _make_full_synthesis(kwmatch: float = 0.80, judge: float = 0.70) -> SynthesisMetrics:
    return SynthesisMetrics(
        mode="full", keyword_match_rate=kwmatch, avg_confidence=0.80,
        judge_score=judge, sample_count=10,
    )


def test_regression_gates_all_pass():
    c, r, _ = _make_metrics(accuracy=0.95, recall=0.75, kwmatch=0.80)
    s = _make_full_synthesis(kwmatch=0.80, judge=0.80)
    result = check_regression_gates(c, r, s, mode="full")
    assert result.passed is True
    assert all(g["passed"] for g in result.gates.values())


def test_regression_gates_accuracy_fails():
    c, r, s = _make_metrics(accuracy=0.85)  # below 0.90 threshold
    result = check_regression_gates(c, r, s, mode="full")
    assert result.passed is False
    assert result.gates["classification_accuracy"]["passed"] is False


def test_regression_gates_recall_never_gated():
    # context_recall is informational only — never a regression gate
    c, r, s = _make_metrics(recall=0.30)
    result = check_regression_gates(c, r, s, mode="full")
    assert "context_recall" not in result.gates
    result_fast = check_regression_gates(c, r, s, mode="fast")
    assert "context_recall" not in result_fast.gates


def test_regression_gates_synthesis_keyword_fails():
    c, r, _ = _make_metrics(kwmatch=0.60)
    s = _make_full_synthesis(kwmatch=0.60, judge=0.70)
    result = check_regression_gates(c, r, s, mode="full")
    assert result.passed is False
    assert result.gates["keyword_match_rate"]["passed"] is False


def test_regression_gates_judge_score_fails():
    c, r, _ = _make_metrics()
    s = _make_full_synthesis(kwmatch=0.80, judge=0.70)  # below 0.75 threshold
    result = check_regression_gates(c, r, s, mode="full")
    assert result.passed is False
    assert result.gates["judge_score"]["passed"] is False


def test_regression_gates_synthesis_skipped_in_fast_mode():
    c, r, _ = _make_metrics()
    s_empty = SynthesisMetrics(mode="fast", keyword_match_rate=0.0, avg_confidence=0.0, judge_score=None, sample_count=0)
    result = check_regression_gates(c, r, s_empty, mode="fast")
    assert "keyword_match_rate" not in result.gates
    assert "judge_score" not in result.gates


def test_regression_gates_custom_thresholds():
    c, r, _ = _make_metrics(accuracy=0.85)  # below default 0.90 but above custom 0.80
    s = _make_full_synthesis()
    result = check_regression_gates(c, r, s, mode="full", thresholds={"classification_accuracy": 0.80})
    assert result.gates["classification_accuracy"]["passed"] is True


# ── Internal helpers ───────────────────────────────────────────────────────────


def test_pearson_r_perfect_positive():
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 4.0, 6.0, 8.0]
    assert _pearson_r(xs, ys) == pytest.approx(1.0)


def test_pearson_r_no_correlation():
    xs = [1.0, 1.0, 1.0, 1.0]
    ys = [1.0, 2.0, 3.0, 4.0]
    assert _pearson_r(xs, ys) == 0.0  # zero variance in xs


def test_pearson_r_too_short():
    assert _pearson_r([1.0], [1.0]) == 0.0
