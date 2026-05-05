"""CLI entry point for Aethen eval pipeline.

Usage:
    # Fast mode — classify-only, keyword synthesis, no LLM judge
    poetry run python scripts/run_eval.py

    # Full mode — complete pipeline + LLM-as-judge
    poetry run python scripts/run_eval.py --mode full

    # Subset (quick smoke test)
    poetry run python scripts/run_eval.py --limit 20

    # Skip Langfuse push
    poetry run python scripts/run_eval.py --no-langfuse
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import structlog

structlog.configure(processors=[structlog.dev.ConsoleRenderer()])


def _print_report(report) -> None:
    """Print a human-readable eval report to stdout."""
    gate_icon = lambda g: "[PASS]" if g["passed"] else "[FAIL]"

    lines = [
        "",
        f"Aethen Eval Report — {report.timestamp[:19]}",
        f"Run ID: {report.run_id}",
        f"Dataset: {report.dataset_size} sessions | Mode: {report.mode}",
        "",
        "CLASSIFICATION",
        f"  Accuracy:              {report.classification.accuracy:.2%}",
    ]

    for ft, m in sorted(report.classification.per_class.items()):
        lines.append(f"  {ft.replace('_', ' ').title()} F1:".ljust(30) + f"{m.f1:.2%}  (support={m.support})")

    lines += [
        f"  Confidence calib. r:   {report.classification.confidence_calibration_r:.3f}",
        "",
        "RETRIEVAL",
    ]

    if report.retrieval.sample_count > 0:
        lines += [
            f"  Context Recall:        {report.retrieval.context_recall:.2%}",
            f"  Context Precision:     {report.retrieval.context_precision:.2%}",
            f"  Hit Rate:              {report.retrieval.hit_rate:.2%}",
            f"  (n={report.retrieval.sample_count} sessions with expected docs)",
        ]
    else:
        lines.append("  N/A (no sessions with expected_doc_ids in subset)")

    lines += ["", "SYNTHESIS"]
    if report.synthesis.sample_count > 0:
        lines += [
            f"  Root Cause Match:      {report.synthesis.keyword_match_rate:.2%}",
            f"  Avg Confidence:        {report.synthesis.avg_confidence:.2%}",
        ]
        if report.synthesis.judge_score is not None:
            lines.append(f"  LLM Judge Score:       {report.synthesis.judge_score:.2%}")
    else:
        lines.append("  N/A (fast mode — run with --mode full for synthesis metrics)")

    lines += ["", "REGRESSION GATES"]
    for gate_name, gate in sorted(report.gates.items()):
        icon = gate_icon(gate)
        lines.append(f"  {icon} {gate_name}: {gate['actual']:.2%} (threshold ≥ {gate['threshold']:.0%})")

    lines += [
        "",
        "━" * 50,
        f"  Overall: {'✓ PASSED' if report.regression_passed else '✗ FAILED'}",
        "━" * 50,
        "",
    ]

    print("\n".join(lines))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run Aethen eval pipeline")
    parser.add_argument("--mode", choices=["fast", "full"], default="fast")
    parser.add_argument("--limit", type=int, default=None, help="Cap sessions (e.g. 20 for smoke test)")
    parser.add_argument("--no-langfuse", action="store_true", help="Skip Langfuse score push")
    args = parser.parse_args()

    print(f"\nStarting Aethen eval (mode={args.mode}, limit={args.limit or 'all'})...")

    from app.eval.runner import run_eval

    report = await run_eval(
        mode=args.mode,
        limit=args.limit,
        push_to_langfuse=not args.no_langfuse,
    )

    _print_report(report)
    sys.exit(0 if report.regression_passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
