"""Tool Debug node — analyzes tool call failures in AI agent sessions.

Identifies: wrong parameters, permission errors, timeouts, infinite loops,
cascading tool errors.
"""

import structlog

from app.agents.llm import get_openai_llm
from app.agents.state import AgentState, ensure_session
from app.config import settings

logger = structlog.get_logger()

TOOL_DEBUG_PROMPT = """\
You are an expert AI systems debugger specializing in tool/API integration failures.

Analyze the following session trace data and evidence to diagnose tool misfire failures.

Focus on:
1. **Wrong parameters** — tools called with incorrect argument types or values
2. **Permission errors** — authentication/authorization failures in tool calls
3. **Timeouts** — tools exceeding expected latency thresholds (>5000ms is suspicious)
4. **Infinite loops** — repeated tool calls with the same parameters suggesting retry storms
5. **Cascading failures** — one tool failure triggering downstream tool failures
6. **Error patterns** — common error messages across multiple tool calls

For each issue found, provide:
- A clear title
- Severity (low/medium/high/critical)
- Detailed description with specific evidence
- Actionable recommendation

Respond in this JSON format:
{
    "analysis": "Detailed narrative analysis of the tool failures",
    "findings": [
        {
            "title": "Finding title",
            "severity": "high",
            "description": "What went wrong and why",
            "evidence": ["specific data points"],
            "recommendation": "What to fix"
        }
    ],
    "root_cause": "The primary root cause of the tool failures"
}
"""


def _build_tool_context(state: AgentState) -> str:
    """Build context string focused on tool call events."""
    session = ensure_session(state["session"])
    parts = [
        f"Session: {session.session_id}",
        f"Failure summary: {session.failure_summary or 'N/A'}",
    ]

    if session.tool_calls:
        parts.append("\n=== Tool Calls (chronological) ===")
        for i, tc in enumerate(session.tool_calls, 1):
            parts.append(
                f"\n#{i} {tc.tool_name}\n"
                f"  Status: {tc.status}\n"
                f"  Parameters: {tc.parameters}\n"
                f"  Result: {tc.result or 'N/A'}\n"
                f"  Error: {tc.error or 'none'}\n"
                f"  Latency: {tc.latency_ms:.0f}ms"
            )

    # Include reranked evidence
    evidence = state.get("reranked_evidence", [])
    if evidence:
        parts.append("\n=== Retrieved Evidence (reranked) ===")
        for item in evidence:
            parts.append(f"[score={item['relevance_score']:.3f}] {item['text']}")

    return "\n".join(parts)


async def tool_debug(state: AgentState) -> dict:
    """Analyze tool call failures using GPT-4o-mini."""
    from app.agents.nodes.diagnostic_utils import parse_diagnostic_output

    llm = get_openai_llm(temperature=0, max_tokens=1500)

    context = _build_tool_context(state)

    response = await llm.ainvoke([
        {"role": "system", "content": TOOL_DEBUG_PROMPT},
        {"role": "user", "content": context},
    ])

    raw = response.content if hasattr(response, "content") else str(response)
    validated = parse_diagnostic_output(raw, "tool_debug")

    logger.info("tool_debug_complete", session_id=state["session"].session_id,
                findings_count=len(validated["findings"]))
    return {"analysis": raw, "_validated": validated}
