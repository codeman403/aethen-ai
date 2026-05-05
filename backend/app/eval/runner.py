"""Eval runner — orchestrates the full eval pipeline against the golden dataset.

Two modes:
  fast (default): runs classify_intent only — 1 LLM call per session.
    Computes: classification accuracy, retrieval metrics (from session data).
    No Pinecone/Neo4j required. Synthesis skipped (no root_cause available).

  full: runs the complete analysis_graph.ainvoke pipeline.
    Computes: all metrics including synthesis with LLM-as-judge.
    Requires: all services initialized (Pinecone, Neo4j, Postgres).

The golden dataset (data/eval_dataset.json) provides ground truth labels via
metadata._ground_truth for each session.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

import structlog

from app.agents.nodes.classify import classify_intent
from app.agents.state import AgentState, AnalysisReport
from app.eval.langfuse_eval import push_aggregate_scores, push_session_scores
from app.eval.metrics import (
    ClassificationMetrics,
    RetrievalMetrics,
    SynthesisMetrics,
    _RetrievalSample,
    check_regression_gates,
    compute_classification_metrics,
    compute_retrieval_metrics,
    compute_synthesis_metrics_fast,
    compute_synthesis_metrics_full,
    retrieval_sample_from_session,
)
from app.models.trace import FailureType, Session

logger = structlog.get_logger()

EVAL_DATASET_PATH = Path(__file__).parent.parent.parent / "data" / "eval_dataset.json"
CONCURRENCY = 5  # max parallel LLM calls


@dataclass
class EvalReport:
    """Complete output of an eval run."""

    run_id: str
    timestamp: str
    dataset_size: int
    mode: Literal["fast", "full"]
    classification: ClassificationMetrics
    retrieval: RetrievalMetrics
    synthesis: SynthesisMetrics
    regression_passed: bool
    gates: dict

    def to_dict(self) -> dict:
        from dataclasses import asdict
        return asdict(self)


def load_eval_dataset(limit: int | None = None) -> list[dict]:
    """Load golden sessions from data/eval_dataset.json."""
    if not EVAL_DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Eval dataset not found at {EVAL_DATASET_PATH}. "
            "Run: poetry run python scripts/generate_eval_dataset.py"
        )
    data = json.loads(EVAL_DATASET_PATH.read_text())
    sessions = data["sessions"]
    if limit:
        sessions = sessions[:limit]
    return sessions


async def _run_classify_only(session_dict: dict) -> tuple[str, str, float]:
    """Run classify_intent on a single session dict.

    Returns (predicted_type, expected_type, confidence).
    confidence is 0.7 placeholder when running classify-only (no AnalysisReport).
    """
    expected = session_dict["metadata"]["_ground_truth"]["failure_type"]

    try:
        session = Session(**{k: v for k, v in session_dict.items() if k != "metadata"} | {"metadata": session_dict.get("metadata", {})})
        state: AgentState = {"session": session}
        result = await classify_intent(state)
        predicted = str(result.get("failure_type", FailureType.UNKNOWN))
    except Exception as exc:
        logger.warning("classify_only_failed", session_id=session_dict.get("session_id"), error=str(exc))
        predicted = FailureType.UNKNOWN

    return predicted, expected, 0.7


async def _run_full_pipeline(session_dict: dict) -> tuple[str, str, float, str | None]:
    """Run complete analysis pipeline on a session dict.

    Returns (predicted_type, expected_type, confidence, root_cause | None).
    """
    from app.agents.graph import analysis_graph

    expected = session_dict["metadata"]["_ground_truth"]["failure_type"]

    try:
        session = Session(**{k: v for k, v in session_dict.items() if k != "metadata"} | {"metadata": session_dict.get("metadata", {})})
        result = await analysis_graph.ainvoke({"session": session})
        report_dict = result.get("report") or {}
        predicted = str(report_dict.get("failure_type", FailureType.UNKNOWN))
        confidence = float(report_dict.get("confidence", 0.0))
        root_cause = report_dict.get("root_cause", "")
    except Exception as exc:
        logger.warning("full_pipeline_failed", session_id=session_dict.get("session_id"), error=str(exc))
        predicted = FailureType.UNKNOWN
        confidence = 0.0
        root_cause = None

    return predicted, expected, confidence, root_cause


async def run_eval(
    mode: Literal["fast", "full"] = "fast",
    limit: int | None = None,
    push_to_langfuse: bool = True,
) -> EvalReport:
    """Run the eval pipeline against the golden dataset.

    Args:
        mode: "fast" = classify-only (1 LLM call/session, no services required)
              "full" = complete pipeline + LLM judge (requires all services)
        limit: cap number of sessions (useful for quick smoke tests)
        push_to_langfuse: whether to push per-session scores to Langfuse

    Returns:
        EvalReport with all computed metrics.
    """
    run_id = f"eval-run-{str(uuid.uuid4())[:8]}"
    logger.info("eval_run_started", run_id=run_id, mode=mode, limit=limit)

    sessions = load_eval_dataset(limit)
    semaphore = asyncio.Semaphore(CONCURRENCY)

    # ── Fast mode: classify-only ──────────────────────────────────────────────
    if mode == "fast":
        async def _bounded_classify(s: dict) -> tuple[str, str, float]:
            async with semaphore:
                return await _run_classify_only(s)

        results = await asyncio.gather(*[_bounded_classify(s) for s in sessions])

        clf_inputs = [(pred, exp, conf) for pred, exp, conf in results]
        classification = compute_classification_metrics(clf_inputs)

        retrieval_samples = [r for s in sessions if (r := retrieval_sample_from_session(s)) is not None]
        retrieval = compute_retrieval_metrics(retrieval_samples)

        synthesis = SynthesisMetrics(
            mode="fast",
            keyword_match_rate=0.0,
            avg_confidence=0.0,
            judge_score=None,
            sample_count=0,
        )

        if push_to_langfuse:
            for (pred, exp, conf), s in zip(results, sessions):
                rsample = retrieval_sample_from_session(s)
                recall = None
                if rsample and rsample.expected_doc_ids:
                    expected_set = set(rsample.expected_doc_ids)
                    actual_set = set(rsample.actual_doc_ids)
                    recall = len(expected_set & actual_set) / len(expected_set)
                push_session_scores(
                    session_id=s["session_id"],
                    predicted_type=pred,
                    expected_type=exp,
                    confidence=conf,
                    context_recall=recall,
                )

    # ── Full mode: complete pipeline + LLM judge ─────────────────────────────
    else:
        async def _bounded_full(s: dict) -> tuple[str, str, float, str | None]:
            async with semaphore:
                return await _run_full_pipeline(s)

        full_results = await asyncio.gather(*[_bounded_full(s) for s in sessions])

        clf_inputs = [(pred, exp, conf) for pred, exp, conf, _ in full_results]
        classification = compute_classification_metrics(clf_inputs)

        retrieval_samples = [r for s in sessions if (r := retrieval_sample_from_session(s)) is not None]
        retrieval = compute_retrieval_metrics(retrieval_samples)

        # Synthesis: keyword match + LLM judge
        synth_inputs_fast = []
        synth_inputs_full = []
        for (pred, exp, conf, root_cause), s in zip(full_results, sessions):
            if root_cause:
                kws = s["metadata"]["_ground_truth"]["root_cause_keywords"]
                desc = s.get("failure_summary") or f"Failure type: {exp}"
                synth_inputs_fast.append((root_cause, kws, conf))
                synth_inputs_full.append((root_cause, kws, conf, desc))

        synthesis = await compute_synthesis_metrics_full(synth_inputs_full) if synth_inputs_full else SynthesisMetrics(
            mode="full", keyword_match_rate=0.0, avg_confidence=0.0, judge_score=None, sample_count=0,
        )

        if push_to_langfuse:
            for (pred, exp, conf, root_cause), s in zip(full_results, sessions):
                rsample = retrieval_sample_from_session(s)
                recall = None
                if rsample and rsample.expected_doc_ids:
                    expected_set = set(rsample.expected_doc_ids)
                    actual_set = set(rsample.actual_doc_ids)
                    recall = len(expected_set & actual_set) / len(expected_set)
                kws = s["metadata"]["_ground_truth"]["root_cause_keywords"]
                kw_match = any(kw.lower() in (root_cause or "").lower() for kw in kws)
                push_session_scores(
                    session_id=s["session_id"],
                    predicted_type=pred,
                    expected_type=exp,
                    confidence=conf,
                    context_recall=recall,
                    keyword_match=kw_match,
                )

    # ── Regression gates ──────────────────────────────────────────────────────
    regression = check_regression_gates(classification, retrieval, synthesis, mode=mode)

    if push_to_langfuse:
        push_aggregate_scores(run_id, classification, retrieval, synthesis)

    report = EvalReport(
        run_id=run_id,
        timestamp=datetime.now(UTC).isoformat(),
        dataset_size=len(sessions),
        mode=mode,
        classification=classification,
        retrieval=retrieval,
        synthesis=synthesis,
        regression_passed=regression.passed,
        gates=regression.gates,
    )

    logger.info(
        "eval_run_complete",
        run_id=run_id,
        accuracy=classification.accuracy,
        context_recall=retrieval.context_recall,
        regression_passed=regression.passed,
    )
    return report
