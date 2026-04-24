"""Synthesize node — produces the final structured analysis report.

Uses Claude Sonnet 4.6 for high-quality reasoning and report generation.
Falls back to GPT-4o-mini if Anthropic API key is not configured.
"""

import json

import structlog
from langchain_openai import ChatOpenAI

from app.agents.state import AgentState, AnalysisReport, Finding
from app.config import settings
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


def _get_llm():
    """Get the synthesis LLM — Claude Sonnet 4.6 preferred, GPT-4o-mini fallback."""
    if settings.anthropic_api_key:
        try:
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model="claude-sonnet-4-6-20250514",
                api_key=settings.anthropic_api_key,
                anthropic_api_url=settings.anthropic_base_url or None,
                temperature=0,
                max_tokens=2000,
            )
        except ImportError:
            logger.warning("langchain_anthropic_not_installed_falling_back_to_openai")

    return ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
        temperature=0,
        max_tokens=2000,
    )


async def synthesize(state: AgentState) -> dict:
    """Synthesize the final analysis report from module output."""
    session = state["session"]
    failure_type = state.get("failure_type", FailureType.UNKNOWN)
    analysis = state.get("analysis", "")

    llm = _get_llm()

    context = (
        f"Session ID: {session.session_id}\n"
        f"Failure Type: {failure_type}\n"
        f"Failure Summary: {session.failure_summary or 'N/A'}\n\n"
        f"=== Raw Analysis from Debug Module ===\n{analysis}"
    )

    response = await llm.ainvoke([
        {"role": "system", "content": SYNTHESIZE_PROMPT},
        {"role": "user", "content": context},
    ])

    # Parse the structured response
    try:
        result = json.loads(response.content)
        report = AnalysisReport(
            session_id=session.session_id,
            failure_type=failure_type,
            summary=result.get("summary", "Analysis complete."),
            findings=[Finding(**f) for f in result.get("findings", [])],
            root_cause=result.get("root_cause", ""),
            confidence=float(result.get("confidence", 0.0)),
            raw_analysis=analysis,
        )
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("synthesize_parse_error", error=str(exc))
        report = AnalysisReport(
            session_id=session.session_id,
            failure_type=failure_type,
            summary="Analysis completed but structured parsing failed.",
            root_cause="See raw analysis for details.",
            raw_analysis=analysis,
        )

    logger.info(
        "synthesize_complete",
        session_id=session.session_id,
        findings_count=len(report.findings),
        confidence=report.confidence,
    )
    return {"report": report.model_dump()}
