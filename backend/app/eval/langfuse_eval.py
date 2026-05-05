"""Langfuse eval integration — pushes per-session scores via score() API.

Creates a time-series of eval metrics in the Langfuse dashboard so regressions
are visible when prompts or models change. If Langfuse is not configured the
push is a no-op (same graceful pattern as make_langfuse_handler).
"""

from __future__ import annotations

import structlog

from app.eval.metrics import ClassificationMetrics, RetrievalMetrics, SynthesisMetrics
from app.utils.langfuse_utils import make_langfuse_handler

logger = structlog.get_logger()


def push_session_scores(
    session_id: str,
    predicted_type: str,
    expected_type: str,
    confidence: float,
    context_recall: float | None = None,
    keyword_match: bool | None = None,
    judge_score: float | None = None,
) -> None:
    """Push per-session eval scores to Langfuse.

    Scores appear as named metrics on the trace matching session_id, creating
    a visual time-series whenever eval is re-run after prompt/model changes.

    Args:
        session_id: Langfuse trace ID to attach scores to
        predicted_type: what classify_intent predicted
        expected_type: ground-truth failure type
        confidence: AnalysisReport.confidence
        context_recall: fraction of expected docs retrieved (None if N/A)
        keyword_match: whether root_cause contained ground-truth keywords
        judge_score: LLM judge score 0-1 (None in fast mode)
    """
    _, langfuse = make_langfuse_handler()
    if langfuse is None:
        return

    try:
        is_correct = predicted_type == expected_type
        langfuse.create_score(
            trace_id=session_id,
            name="classification_correct",
            value=1.0 if is_correct else 0.0,
            comment=f"expected={expected_type} predicted={predicted_type}",
        )
        langfuse.create_score(
            trace_id=session_id,
            name="classification_confidence",
            value=confidence,
        )
        if context_recall is not None:
            langfuse.create_score(
                trace_id=session_id,
                name="context_recall",
                value=context_recall,
            )
        if keyword_match is not None:
            langfuse.create_score(
                trace_id=session_id,
                name="root_cause_keyword_match",
                value=1.0 if keyword_match else 0.0,
            )
        if judge_score is not None:
            langfuse.create_score(
                trace_id=session_id,
                name="synthesis_judge_score",
                value=judge_score,
            )
    except Exception as exc:
        logger.warning("langfuse_eval_push_failed", session_id=session_id, error=str(exc))


def push_aggregate_scores(
    run_id: str,
    classification: ClassificationMetrics,
    retrieval: RetrievalMetrics,
    synthesis: SynthesisMetrics,
) -> None:
    """Push aggregate eval run metrics to Langfuse as a named dataset run.

    Uses a synthetic trace_id (run_id) so the aggregate appears alongside
    per-session scores in the Langfuse UI.
    """
    _, langfuse = make_langfuse_handler()
    if langfuse is None:
        return

    try:
        scores = {
            "eval_classification_accuracy": classification.accuracy,
            "eval_confidence_calibration_r": classification.confidence_calibration_r,
            "eval_context_recall": retrieval.context_recall,
            "eval_context_precision": retrieval.context_precision,
            "eval_hit_rate": retrieval.hit_rate,
            "eval_keyword_match_rate": synthesis.keyword_match_rate,
            "eval_avg_confidence": synthesis.avg_confidence,
        }
        if synthesis.judge_score is not None:
            scores["eval_judge_score"] = synthesis.judge_score

        for name, value in scores.items():
            langfuse.create_score(trace_id=run_id, name=name, value=value)

        langfuse.flush()
        logger.info("langfuse_eval_aggregate_pushed", run_id=run_id, scores=scores)
    except Exception as exc:
        logger.warning("langfuse_eval_aggregate_failed", run_id=run_id, error=str(exc))
