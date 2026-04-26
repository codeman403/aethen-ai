"""Intent classification node — routes sessions to the correct analysis module.

Uses GPT-4o-mini to classify the session's failure type based on trace data.
"""

import json

import structlog

from app.agents.llm import get_openai_llm
from app.agents.state import AgentState, ensure_session
from app.config import settings
from app.models.trace import FailureType

logger = structlog.get_logger()

CLASSIFY_SYSTEM_PROMPT = """\
You are an AI agent failure classifier. Read the session evidence carefully and
classify the PRIMARY failure type into exactly one of these categories:

memory
  Signals: retrieval events returning wrong/mismatched docs, low similarity scores
  (<0.5), expected docs not in actual docs, chunks_returned=0 when docs exist,
  stale or irrelevant context passed to the LLM.

tool_misfire
  Signals: tool calls with status=failed or status=timeout, PermissionError,
  ValueError in tool parameters, ConnectionError, repeated identical tool calls
  (loop), cascading failures across multiple tools.

hallucination
  Signals: LLM response contradicts or is unsupported by retrieved source docs,
  LLM states facts not present in its prompt context, hallucination_flag=True,
  response contains fabricated citations, numbers, or policies not in sources,
  LLM says "based on the documents" but sources=none.

blind_spot
  Signals: retrieval returns 0 chunks for a valid query, the LLM responds with
  "I don't have information about X" or "not found in knowledge base",
  consistent failure on a specific topic or domain that clearly exists but is
  not in the knowledge base.

unknown
  Use only when there is genuinely insufficient evidence to distinguish between
  the categories above.

Base your decision on the EVIDENCE in the session trace — tool call statuses,
retrieval scores, LLM prompts and responses — not on labels or summaries alone.

Respond with ONLY a JSON object (no markdown):
{"failure_type": "<category>", "reasoning": "<one sentence citing the key evidence>"}
"""


def _session_to_evidence_text(state: AgentState) -> str:
    """Serialize the session trace into a compact text summary for the LLM."""
    session = ensure_session(state["session"])
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
            if lc.prompt:
                parts.append(f"  Prompt: {lc.prompt[:300]}")
            if lc.response:
                parts.append(f"  Response: {lc.response[:300]}")
            # Include prompt/response text so the classifier can detect hallucinations
            # from content even when hallucination_flag is not explicitly set
            if lc.prompt:
                parts.append(f"  Prompt: {lc.prompt[:300]}")
            if lc.response:
                parts.append(f"  Response: {lc.response[:300]}")

    return "\n".join(parts)


async def classify_intent(state: AgentState) -> dict:
    """Classify the session's failure type using GPT-4o-mini.

    Always uses the LLM to read actual session evidence — retrieval events,
    tool calls, LLM prompts and responses — and determine the correct failure
    type. Pre-set labels are included as a hint but are NOT trusted blindly,
    because they may have been inferred incorrectly upstream.
    """
    session = ensure_session(state["session"])

    llm = get_openai_llm(temperature=0, max_tokens=200)
    evidence_text = _session_to_evidence_text(state)

    response = await llm.ainvoke([
        {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
        {"role": "user", "content": f"Classify this session:\n\n{evidence_text}"},
    ])

    try:
        result = json.loads(response.content)
        failure_type = FailureType(result["failure_type"])
        logger.info(
            "session_classified",
            session_id=session.session_id,
            failure_type=failure_type,
            reasoning=result.get("reasoning", ""),
        )
    except (json.JSONDecodeError, ValueError, KeyError) as exc:
        logger.warning(
            "classification_parse_error",
            error=str(exc),
            raw_response=response.content,
        )
        # Fall back to pre-set type only if LLM parse fails
        failure_type = session.failure_type or FailureType.UNKNOWN

    return {"failure_type": failure_type}
