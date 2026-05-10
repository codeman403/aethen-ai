"""Synthesize node — produces the final structured analysis report.

Uses Claude Sonnet 4.6 for high-quality reasoning and report generation.
Falls back to GPT-4o-mini if the Anthropic proxy rejects the request.
"""

import json
import re
import traceback

import structlog

import asyncio

from app.agents.llm import get_anthropic_llm, get_openai_llm
from app.agents.state import AgentState, AnalysisReport, Finding, ensure_session
from app.models.trace import FailureType
from app.utils.sanitize import strip_injection

logger = structlog.get_logger()

SYNTHESIZE_PROMPT = """\
You are a senior AI systems reliability engineer producing a final diagnostic report.

Given the raw analysis from a specialized debug module AND the session trace evidence,
synthesize a clear, actionable report. Your job is to:

1. Write a concise executive summary (2-3 sentences)
2. Validate and refine the findings (remove duplicates, clarify severity)
3. Identify the single most likely root cause — with precision (see rule below)
4. Assign a confidence score (0.0-1.0) based on evidence quality
5. Ensure all recommendations are specific and actionable

━━━ ROOT CAUSE PRECISION RULE ━━━
The root_cause field must name THREE things in one sentence:
  (1) The specific component or mechanism that failed
  (2) The measurable evidence that confirms it (score value, error message, latency, doc ID mismatch)
  (3) The downstream effect on the agent's response

Good: "Embedding similarity scores peaked at 0.43 — below the 0.5 relevance threshold —
  causing the retrieval system to surface billing policy docs instead of the expected
  enterprise API rate limit documentation, so the LLM answered with stale pricing data."

Bad: "The retrieval system returned incorrect documents."
Bad: "The tool call failed due to an error."
Bad: "The LLM hallucinated information."

Use the Session Evidence section to ground the root cause in actual numbers and identifiers
from the trace. If the evidence section contains retrieval scores, doc IDs, error messages,
or latency values, include the most diagnostic ones in your root_cause.

Respond in this exact JSON format:
{
    "summary": "Executive summary of the analysis",
    "findings": [
        {
            "title": "Finding title",
            "severity": "high",
            "description": "Clear description",
            "evidence": ["evidence item 1", "evidence item 2"],
            "recommendation": "Specific action to take"
        }
    ],
    "root_cause": "One precise sentence: component that failed + measurable evidence + downstream effect",
    "confidence": 0.85
}
"""


def _session_evidence(session) -> str:
    """Compact key-metric summary for the synthesis context.

    Gives synthesize concrete numbers (scores, error messages, doc IDs) so the
    root_cause can reference specific evidence rather than generic descriptions.
    """
    lines = []

    if session.retrieval_events:
        for evt in session.retrieval_events:
            scores = evt.relevance_scores[:5]
            max_score = max(scores) if scores else 0.0
            score_str = ", ".join(f"{s:.2f}" for s in scores)
            expected = evt.expected_doc_ids[:3]
            actual = evt.actual_doc_ids[:3]
            doc_mismatch = expected and set(expected) != set(actual)
            lines.append(
                f"Retrieval: query='{evt.query[:120]}' | "
                f"chunks={evt.chunks_returned} | scores=[{score_str}] max={max_score:.2f} | "
                f"expected_docs={expected} | actual_docs={actual}"
                + (" | DOC_MISMATCH=True" if doc_mismatch else "")
            )
            if evt.doc_content:
                lines.append(f"  Retrieved content snippet: {evt.doc_content[0][:150]}")

    if session.tool_calls:
        for tc in session.tool_calls:
            status_str = f"status={tc.status}"
            if tc.error:
                status_str += f" | error='{strip_injection(tc.error, full_redact=True)[:150]}'"
            if tc.latency_ms > 5000:
                status_str += f" | latency={tc.latency_ms:.0f}ms (HIGH)"
            lines.append(f"Tool: {tc.tool_name} | {status_str}")

    if session.llm_calls:
        for lc in session.llm_calls:
            halluc = " | HALLUCINATION_FLAGGED=True" if lc.hallucination_flag else ""
            sources = lc.source_documents[:3]
            lines.append(
                f"LLM: model={lc.model} | sources={sources}{halluc}"
            )
            if lc.response:
                lines.append(f"  Response snippet: {strip_injection(lc.response, full_redact=True)[:200]}")

    return "\n".join(lines) if lines else "No trace evidence available."


def _extract_content(response) -> str:
    raw = response.content if hasattr(response, "content") else str(response)
    if isinstance(raw, list):
        parts = []
        for block in raw:
            if isinstance(block, dict):
                parts.append(block.get("text", ""))
            elif hasattr(block, "text"):
                parts.append(block.text)
            else:
                parts.append(str(block))
        raw = "".join(parts)
    raw = re.sub(r"^```(?:json)?\s*\n?", "", str(raw).strip())
    raw = re.sub(r"\n?```\s*$", "", raw)
    return raw


async def _invoke_llm(messages: list[dict]) -> str:
    """Try Claude Sonnet 4.6 first; fall back to GPT-4o-mini on any failure."""
    llms = [
        ("claude-sonnet-4-6", get_anthropic_llm(temperature=0, max_tokens=2000)),
        ("gpt-4o-mini",       get_openai_llm(temperature=0, max_tokens=2000)),
    ]
    for label, llm in llms:
        try:
            response = await llm.ainvoke(messages)
            logger.info("synthesize_llm_used", model=label)
            return _extract_content(response)
        except Exception as exc:
            logger.warning("synthesize_llm_error", model=label, error=str(exc),
                           tb=traceback.format_exc())
    return ""


async def synthesize(state: AgentState) -> dict:
    """Synthesize the final analysis report from module output."""
    session = ensure_session(state["session"])
    failure_type = state.get("failure_type", FailureType.UNKNOWN)
    analysis = state.get("analysis", "")

    # No failure detected — skip LLM and return a clean success report
    if failure_type == FailureType.UNKNOWN or failure_type is None:
        report = AnalysisReport(
            session_id=session.session_id,
            failure_type=failure_type,
            summary="No failure detected. The session completed without identifiable issues.",
            findings=[],
            root_cause="",
            confidence=1.0,
            raw_analysis=analysis,
        )
        return {"report": report.model_dump(mode="json")}


    context = (
        f"Session ID: {session.session_id}\n"
        f"Failure Type: {failure_type}\n"
        f"Failure Summary: {session.failure_summary or 'N/A'}\n\n"
        f"=== Session Evidence ===\n{_session_evidence(session)}\n\n"
        f"=== Raw Analysis from Debug Module ===\n{analysis}"
    )
    messages = [
        {"role": "system", "content": SYNTHESIZE_PROMPT},
        {"role": "user", "content": context},
    ]

    raw_content = await _invoke_llm(messages)

    # Parse the structured response — catch all exceptions so report is always set
    try:
        parsed = json.loads(raw_content)
        report = AnalysisReport(
            session_id=session.session_id,
            failure_type=failure_type,
            summary=parsed.get("summary", "Analysis complete."),
            findings=[Finding(**f) for f in parsed.get("findings", [])],
            root_cause=parsed.get("root_cause", ""),
            confidence=float(parsed.get("confidence", 0.0)),
            raw_analysis=analysis,
        )
    except Exception as exc:
        logger.warning("synthesize_parse_error", error=str(exc), tb=traceback.format_exc())
        report = AnalysisReport(
            session_id=session.session_id,
            failure_type=failure_type,
            summary="Analysis completed but structured parsing failed.",
            root_cause="See raw analysis for details.",
            raw_analysis=str(raw_content),
        )

    logger.info(
        "synthesize_complete",
        session_id=session.session_id,
        findings_count=len(report.findings),
        confidence=report.confidence,
    )
    return {"report": report.model_dump()}
