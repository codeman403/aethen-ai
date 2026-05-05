"""Eval metrics for the Aethen diagnostic pipeline.

All functions are pure (no I/O) so they run in CI without network or LLM calls.

Three metric families:
  - ClassificationMetrics: accuracy, per-class F1, confusion matrix, calibration
  - RetrievalMetrics:      context recall, context precision, hit rate
  - SynthesisMetrics:      root-cause keyword match (fast), LLM judge score (full)
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal

from app.models.trace import FailureType

_FAILURE_TYPES = [
    FailureType.MEMORY,
    FailureType.TOOL_MISFIRE,
    FailureType.HALLUCINATION,
    FailureType.BLIND_SPOT,
]


# ── Classification ─────────────────────────────────────────────────────────────


@dataclass
class PerClassMetrics:
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    support: int = 0  # number of ground-truth examples


@dataclass
class ClassificationMetrics:
    accuracy: float
    per_class: dict[str, PerClassMetrics]
    confusion_matrix: list[list[int]]   # rows = actual, cols = predicted
    confusion_labels: list[str]         # label order for the matrix
    confidence_calibration_r: float     # Pearson r between confidence and correctness
    sample_count: int


def compute_classification_metrics(
    predictions: list[tuple[str, str, float]],
) -> ClassificationMetrics:
    """Compute classification metrics from (predicted, expected, confidence) triples.

    Args:
        predictions: list of (predicted_failure_type, expected_failure_type, confidence)

    Returns:
        ClassificationMetrics with accuracy, per-class F1, confusion matrix,
        and confidence calibration Pearson r.
    """
    if not predictions:
        empty_per_class = {ft.value: PerClassMetrics() for ft in _FAILURE_TYPES}
        n = len(_FAILURE_TYPES)
        return ClassificationMetrics(
            accuracy=0.0,
            per_class=empty_per_class,
            confusion_matrix=[[0] * n for _ in range(n)],
            confusion_labels=[ft.value for ft in _FAILURE_TYPES],
            confidence_calibration_r=0.0,
            sample_count=0,
        )

    labels = [ft.value for ft in _FAILURE_TYPES]
    label_idx = {lbl: i for i, lbl in enumerate(labels)}
    n = len(labels)

    correct = 0
    matrix = [[0] * n for _ in range(n)]
    tp: dict[str, int] = defaultdict(int)
    fp: dict[str, int] = defaultdict(int)
    fn: dict[str, int] = defaultdict(int)
    confidences: list[float] = []
    correctness: list[float] = []

    for pred, expected, conf in predictions:
        is_correct = pred == expected
        correct += int(is_correct)
        confidences.append(conf)
        correctness.append(1.0 if is_correct else 0.0)

        row = label_idx.get(expected, -1)
        col = label_idx.get(pred, -1)
        if row >= 0 and col >= 0:
            matrix[row][col] += 1

        if is_correct:
            tp[expected] += 1
        else:
            fp[pred] += 1
            fn[expected] += 1

    per_class: dict[str, PerClassMetrics] = {}
    for lbl in labels:
        support = tp[lbl] + fn[lbl]
        p = tp[lbl] / (tp[lbl] + fp[lbl]) if (tp[lbl] + fp[lbl]) > 0 else 0.0
        r = tp[lbl] / (tp[lbl] + fn[lbl]) if (tp[lbl] + fn[lbl]) > 0 else 0.0
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
        per_class[lbl] = PerClassMetrics(precision=round(p, 4), recall=round(r, 4), f1=round(f1, 4), support=support)

    cal_r = _pearson_r(confidences, correctness)

    return ClassificationMetrics(
        accuracy=round(correct / len(predictions), 4),
        per_class=per_class,
        confusion_matrix=matrix,
        confusion_labels=labels,
        confidence_calibration_r=round(cal_r, 4),
        sample_count=len(predictions),
    )


# ── Retrieval ──────────────────────────────────────────────────────────────────


@dataclass
class RetrievalMetrics:
    context_recall: float     # |expected ∩ actual| / |expected|  (skip when expected empty)
    context_precision: float  # |source_docs ∩ actual| / |actual| (skip when actual empty)
    hit_rate: float           # % sessions where ≥1 expected doc was retrieved
    sample_count: int         # sessions included (excludes those with empty expected_doc_ids)


@dataclass
class _RetrievalSample:
    expected_doc_ids: list[str]
    actual_doc_ids: list[str]
    source_documents: list[str]  # LLM source_documents for precision


def compute_retrieval_metrics(samples: list[_RetrievalSample]) -> RetrievalMetrics:
    """Compute retrieval metrics from RetrievalEvent + LLMCall data.

    Skips sessions where expected_doc_ids is empty (blind_spot type by design
    has no expected docs, so recall is undefined for those).
    """
    recall_scores: list[float] = []
    precision_scores: list[float] = []
    hits: list[int] = []

    for s in samples:
        if not s.expected_doc_ids:
            continue

        expected = set(s.expected_doc_ids)
        actual = set(s.actual_doc_ids)
        sources = set(s.source_documents)

        recall = len(expected & actual) / len(expected)
        recall_scores.append(recall)
        hits.append(1 if len(expected & actual) > 0 else 0)

        if actual:
            precision = len(sources & actual) / len(actual)
            precision_scores.append(precision)

    if not recall_scores:
        return RetrievalMetrics(context_recall=0.0, context_precision=0.0, hit_rate=0.0, sample_count=0)

    return RetrievalMetrics(
        context_recall=round(sum(recall_scores) / len(recall_scores), 4),
        context_precision=round(sum(precision_scores) / len(precision_scores), 4) if precision_scores else 0.0,
        hit_rate=round(sum(hits) / len(hits), 4),
        sample_count=len(recall_scores),
    )


def retrieval_sample_from_session(session: dict) -> _RetrievalSample | None:
    """Extract a RetrievalSample from a raw session dict."""
    retrieval_events = session.get("retrieval_events", [])
    llm_calls = session.get("llm_calls", [])

    if not retrieval_events:
        return None

    # Aggregate across all retrieval events in the session
    all_expected: list[str] = []
    all_actual: list[str] = []
    for ev in retrieval_events:
        all_expected.extend(ev.get("expected_doc_ids") or [])
        all_actual.extend(ev.get("actual_doc_ids") or [])

    all_sources: list[str] = []
    for call in llm_calls:
        all_sources.extend(call.get("source_documents") or [])

    return _RetrievalSample(
        expected_doc_ids=all_expected,
        actual_doc_ids=all_actual,
        source_documents=all_sources,
    )


# ── Synthesis ──────────────────────────────────────────────────────────────────


@dataclass
class SynthesisMetrics:
    mode: Literal["fast", "full"]
    keyword_match_rate: float     # % sessions where root_cause contains ≥1 ground-truth keyword
    avg_confidence: float         # mean AnalysisReport.confidence across sessions
    judge_score: float | None     # mean LLM judge score (0-1); None in fast mode
    sample_count: int


def compute_synthesis_metrics_fast(
    results: list[tuple[str, list[str], float]],
) -> SynthesisMetrics:
    """Keyword-based synthesis scoring (CI-safe, no LLM).

    Args:
        results: list of (root_cause_text, ground_truth_keywords, confidence)

    Returns:
        SynthesisMetrics with keyword_match_rate and avg_confidence.
    """
    if not results:
        return SynthesisMetrics(mode="fast", keyword_match_rate=0.0, avg_confidence=0.0, judge_score=None, sample_count=0)

    matches = 0
    confidences: list[float] = []

    for root_cause, keywords, confidence in results:
        root_cause_lower = root_cause.lower()
        if any(kw.lower() in root_cause_lower for kw in keywords):
            matches += 1
        confidences.append(confidence)

    return SynthesisMetrics(
        mode="fast",
        keyword_match_rate=round(matches / len(results), 4),
        avg_confidence=round(sum(confidences) / len(confidences), 4),
        judge_score=None,
        sample_count=len(results),
    )


async def compute_synthesis_metrics_full(
    results: list[tuple[str, list[str], float, str]],
) -> SynthesisMetrics:
    """LLM-as-judge synthesis scoring (full mode, burns API credits).

    Args:
        results: list of (root_cause_text, ground_truth_keywords, confidence, session_description)
            session_description: the failure_summary or prompt context for the judge

    Returns:
        SynthesisMetrics with keyword_match_rate, avg_confidence, and judge_score.
    """
    from app.agents.llm import get_anthropic_llm

    # Fast metrics first
    fast_inputs = [(rc, kws, conf) for rc, kws, conf, _ in results]
    fast = compute_synthesis_metrics_fast(fast_inputs)

    if not results:
        return SynthesisMetrics(mode="full", keyword_match_rate=0.0, avg_confidence=0.0, judge_score=None, sample_count=0)

    llm = get_anthropic_llm()
    judge_scores: list[float] = []

    for root_cause, _, _, session_desc in results:
        prompt = (
            f"You are evaluating a diagnostic tool's root cause analysis.\n\n"
            f"Failure scenario: {session_desc}\n\n"
            f"Proposed root cause: {root_cause}\n\n"
            f"Rate how well the proposed root cause identifies the core problem on a scale 0-3:\n"
            f"0 = completely wrong or irrelevant\n"
            f"1 = partially correct but misses the key issue\n"
            f"2 = mostly correct, captures the main problem\n"
            f"3 = exactly right, precisely identifies the root cause\n\n"
            f"Reply with only the integer score (0, 1, 2, or 3)."
        )
        try:
            response = await llm.ainvoke(prompt)
            score_text = response.content.strip() if hasattr(response, "content") else str(response).strip()
            raw_score = int(score_text[0])  # take first char in case of trailing text
            judge_scores.append(min(max(raw_score, 0), 3) / 3.0)  # normalize to 0-1
        except Exception:
            judge_scores.append(0.5)  # neutral fallback on parse error

    return SynthesisMetrics(
        mode="full",
        keyword_match_rate=fast.keyword_match_rate,
        avg_confidence=fast.avg_confidence,
        judge_score=round(sum(judge_scores) / len(judge_scores), 4) if judge_scores else None,
        sample_count=len(results),
    )


# ── Regression gates ───────────────────────────────────────────────────────────


REGRESSION_THRESHOLDS = {
    "classification_accuracy": 0.90,
    "keyword_match_rate": 0.70,
    "judge_score": 0.75,
}


@dataclass
class RegressionResult:
    passed: bool
    gates: dict[str, dict]  # gate_name → {threshold, actual, passed}


def check_regression_gates(
    classification: ClassificationMetrics,
    retrieval: RetrievalMetrics,
    synthesis: SynthesisMetrics,
    thresholds: dict[str, float] | None = None,
    mode: str = "fast",
) -> RegressionResult:
    """Check whether all metrics clear the minimum thresholds.

    Args:
        thresholds: override default REGRESSION_THRESHOLDS

    Returns:
        RegressionResult with per-gate pass/fail and overall passed flag.
    """
    t = {**REGRESSION_THRESHOLDS, **(thresholds or {})}
    gates: dict[str, dict] = {}

    def _gate(name: str, actual: float) -> None:
        threshold = t[name]
        gates[name] = {"threshold": threshold, "actual": round(actual, 4), "passed": actual >= threshold}

    _gate("classification_accuracy", classification.accuracy)
    # context_recall is informational only — not a gate. It reflects retrieval quality in
    # the synthetic dataset where memory failures intentionally have mismatched docs.
    # keyword_match_rate and judge_score only gate when synthesis was actually run
    if synthesis.sample_count > 0:
        _gate("keyword_match_rate", synthesis.keyword_match_rate)
        if synthesis.judge_score is not None:
            _gate("judge_score", synthesis.judge_score)

    return RegressionResult(passed=all(g["passed"] for g in gates.values()), gates=gates)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _pearson_r(xs: list[float], ys: list[float]) -> float:
    """Pearson correlation coefficient between two equal-length lists."""
    n = len(xs)
    if n < 2:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    denom = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return num / denom if denom > 0 else 0.0
