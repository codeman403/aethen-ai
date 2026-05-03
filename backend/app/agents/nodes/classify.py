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
You are an AI agent failure classifier. Read the session evidence and classify
the PRIMARY failure type into exactly one of these categories.

━━━ CATEGORY DEFINITIONS ━━━

tool_misfire
  The agent attempted a tool call and it failed structurally.
  Signals: status=failed/timeout, PermissionError, ConnectionError, ValueError,
  cascading failures, repeated identical tool calls (loop).
  → Classify tool_misfire if ANY tool call has status=failed regardless of retrieval.

memory
  Retrieval ran and returned docs, but the docs are from the WRONG SPECIFIC CONTENT
  within the SAME BROAD DOMAIN. The knowledge base HAS the relevant domain covered,
  but the retrieval system fetched the wrong specific document.
  Signals: low scores (<0.5) AND doc_content covers the same product/functional area
  as the query but the wrong specific topic within it; expected_doc_ids ≠ actual_doc_ids.
  Example: user asks about enterprise pricing → docs show standard/pro pricing (same
  product domain, wrong specific tier).

blind_spot
  The knowledge base contains NO content covering the query topic at all. Whatever
  was retrieved is from a CATEGORICALLY DIFFERENT functional area.
  Signals: chunks_returned=0; OR doc_content functional category is entirely different
  from the query (billing/legal/policy query → docs are about API/authentication/
  technical setup); LLM says "couldn't find information" without adding specific claims.
  KEY RULE: Ask "are the retrieved docs from the same functional category as the query?"
    • Query about billing/refund/cancellation → docs about API/auth/setup → BLIND SPOT
    • Query about API limits (enterprise) → docs about API limits (standard) → MEMORY
  Scores do NOT decide memory vs blind_spot — the subject category does.

hallucination
  Retrieval ran successfully (docs found, reasonable scores) but the LLM response
  includes specific facts, numbers, or claims that are NOT present in the retrieved
  doc_content AND are stated with confidence.
  Signals: high retrieval scores (>0.5) with non-empty doc_content; LLM response
  introduces specifics (exact numbers, policies, thresholds) not found in the
  retrieved content; hallucination_flag=True.

  ⚠ CRITICAL PATTERN — HEDGE-THEN-ASSERT:
  When the LLM says "I couldn't find specific documentation... HOWEVER, a common
  practice is X" or "typically X" or "usually X" — this IS hallucination, NOT
  blind_spot. The LLM is adding specific technical claims (X) from training
  knowledge even though those claims are absent from the retrieved documents.
  The initial hedge does NOT change the classification — what matters is whether
  the response introduces concrete specifics not in the doc_content.

  Compare doc_content carefully against the LLM response. If ANY specific claim
  in the response (a number, a time period, a recommendation, a technical detail)
  is absent from doc_content, classify hallucination — even if the LLM hedged first.

unknown
  Use only when evidence is genuinely insufficient to distinguish the above.

━━━ DECISION GUIDE ━━━

Step 1: Tool failures first.
  ANY tool status=failed → tool_misfire (done).

Step 2: No tools failed — check retrieval.
  No retrieval events → check LLM response for unsupported claims → hallucination or unknown.

Step 3: Retrieval ran. Compare query topic vs doc_content topic:
  doc_content covers a COMPLETELY different subject than the query → blind_spot.
  doc_content is same domain but wrong specific content + low scores (<0.5) → memory.
  doc_content is relevant but LLM response adds specific facts not in docs → hallucination.
  doc_content is relevant and LLM response stays within it but LLM says "not found" → blind_spot.

Step 4: Compare scores:
  All scores < 0.5: lean toward memory (wrong docs) or blind_spot (unrelated docs).
  Scores ≥ 0.5: docs were likely relevant → lean toward hallucination if LLM added claims.

Step 5: Check for hedge-then-assert BEFORE finalising blind_spot:
  If you are about to classify blind_spot, re-read the LLM response for phrases like
  "however", "typically", "usually", "common practice is", "generally" followed by
  specific technical claims. If present, reclassify as hallucination — the LLM is
  supplementing absent doc content with training knowledge.

━━━ OUTPUT FORMAT ━━━
Respond with ONLY a JSON object (no markdown, no extra text):
{"failure_type": "<category>", "reasoning": "<one sentence citing the key discriminating evidence>"}
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
            max_score = max(evt.relevance_scores) if evt.relevance_scores else 0.0
            score_signal = "HIGH (docs likely relevant)" if max_score >= 0.5 else "LOW (docs likely wrong/missing)"
            expected = ", ".join(evt.expected_doc_ids[:5]) or "N/A"
            actual = ", ".join(evt.actual_doc_ids[:5]) or "N/A"
            # Full doc content for domain mismatch analysis (key for memory vs blind_spot)
            content_snippet = " | ".join(c[:200] for c in evt.doc_content[:3]) or "N/A"
            parts.append(
                f"  Query: {evt.query[:200]}\n"
                f"  Chunks: {evt.chunks_returned}, Scores: [{scores}] — {score_signal}\n"
                f"  Expected docs: [{expected}], Actual docs: [{actual}]\n"
                f"  Retrieved content (compare to query topic): {content_snippet}"
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
                # Full response is critical for hallucination detection — compare against doc_content
                parts.append(f"  Response: {lc.response[:600]}")

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
