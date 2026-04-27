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

logger = structlog.get_logger()

SYNTHESIZE_PROMPT = """\
You are a senior AI systems reliability engineer producing a final diagnostic report.

Given the raw analysis from a specialized debug module, synthesize a clear,
actionable report. The analysis module has already identified the issues —
your job is to:

1. Write a concise executive summary (2-3 sentences)
2. Validate and refine the findings (remove duplicates, clarify severity)
3. Identify the single most likely root cause
4. Assign a confidence score (0.0-1.0) based on evidence quality
5. Ensure all recommendations are specific and actionable

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
    "root_cause": "The primary root cause identified",
    "confidence": 0.85
}
"""


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

    context = (
        f"Session ID: {session.session_id}\n"
        f"Failure Type: {failure_type}\n"
        f"Failure Summary: {session.failure_summary or 'N/A'}\n\n"
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
