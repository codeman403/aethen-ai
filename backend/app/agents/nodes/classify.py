"""Intent classification node — routes sessions to the correct analysis module.

Uses GPT-4o-mini to classify the session's failure type based on trace data.
"""

import json

import structlog
from langchain_openai import ChatOpenAI

from app.agents.state import AgentState
from app.config import settings
from app.models.trace import FailureType

logger = structlog.get_logger()

CLASSIFY_SYSTEM_PROMPT = """\
You are an AI agent failure classifier. Given a trace session from an AI agent,
classify the primary failure type into exactly one of these categories:

- memory: Retrieval failures — wrong chunks returned, low similarity scores,
  stale embeddings, metadata mismatches, missing expected documents.
- tool_misfire: Tool call failures — wrong parameters, permission errors,
  timeouts, infinite loops, cascading tool errors.
- hallucination: The LLM generated claims not grounded in source documents —
  fabricated facts, unsupported conclusions, misquoted sources.
- blind_spot: Systemic knowledge gaps — categories of questions the agent
  consistently cannot answer, missing domain coverage.
- unknown: Cannot determine failure type from available evidence.

Respond with a JSON object:
{"failure_type": "<category>", "reasoning": "<one sentence explanation>"}
"""


def _session_to_evidence_text(state: AgentState) -> str:
    """Serialize the session trace into a compact text summary for the LLM."""
    session = state["session"]
    parts = [
        f"Session ID: {session.session_id}",
        f"Agent: {session.agent_id}",
        f"Outcome: {session.outcome}",
        f"Failure summary: {session.failure_summary or 'N/A'}",
    ]

    if session.retrieval_events:
        parts.append("\n--- Retrieval Events ---")
        for evt in session.retrieval_events:
            scores = ", ".join(f"{s:.3f}" for s in evt.relevance_scores[:5])
            expected = ", ".join(evt.expected_doc_ids[:5]) or "N/A"
            actual = ", ".join(evt.actual_doc_ids[:5]) or "N/A"
            parts.append(
                f"  Query: {evt.query[:200]}\n"
                f"  Chunks: {evt.chunks_returned}, Scores: [{scores}]\n"
                f"  Expected docs: [{expected}], Actual docs: [{actual}]"
            )

    if session.tool_calls:
        parts.append("\n--- Tool Calls ---")
        for tc in session.tool_calls:
            error_info = f", Error: {tc.error}" if tc.error else ""
            parts.append(
                f"  {tc.tool_name}: status={tc.status}, latency={tc.latency_ms:.0f}ms{error_info}"
            )

    if session.llm_calls:
        parts.append("\n--- LLM Calls ---")
        for lc in session.llm_calls:
            halluc = " [HALLUCINATION FLAGGED]" if lc.hallucination_flag else ""
            sources = ", ".join(lc.source_documents[:3]) or "none"
            parts.append(
                f"  {lc.model}: tokens_in={lc.tokens_in}, tokens_out={lc.tokens_out}, "
                f"sources=[{sources}]{halluc}"
            )

    return "\n".join(parts)


async def classify_intent(state: AgentState) -> dict:
    """Classify the session's failure type using GPT-4o-mini."""
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.openai_api_key,
        temperature=0,
        max_tokens=200,
    )

    evidence_text = _session_to_evidence_text(state)

    response = await llm.ainvoke([
        {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
        {"role": "user", "content": f"Classify this session:\n\n{evidence_text}"},
    ])

    # Parse the response
    try:
        result = json.loads(response.content)
        failure_type = FailureType(result["failure_type"])
        logger.info(
            "session_classified",
            session_id=state["session"].session_id,
            failure_type=failure_type,
            reasoning=result.get("reasoning", ""),
        )
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        logger.warning(
            "classification_parse_error",
            error=str(exc),
            raw_response=response.content,
        )
        # Fall back to the session's own failure_type label, or unknown
        failure_type = state["session"].failure_type or FailureType.UNKNOWN

    return {"failure_type": failure_type}
