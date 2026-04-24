"""Blind Spot Discovery node — identifies systemic knowledge gaps.

Uses Neo4j graph traversal results to find categories of questions the agent
consistently cannot answer, surfacing patterns across multiple sessions.
"""

import structlog
from langchain_openai import ChatOpenAI

from app.agents.state import AgentState
from app.config import settings

logger = structlog.get_logger()

BLIND_SPOT_PROMPT = """\
You are an expert AI systems analyst specializing in identifying systemic
knowledge gaps and blind spots in AI agent systems.

Analyze the following session trace data, graph relationships, and evidence to
discover blind spots — categories of questions or tasks the agent consistently
fails at.

Focus on:
1. **Topic gaps** — domains or subjects where the agent lacks knowledge
2. **Query patterns** — types of questions that consistently produce failures
3. **Cross-session patterns** — failures shared across multiple sessions indicating systemic issues
4. **Missing tool coverage** — capabilities the agent needs but doesn't have
5. **Data freshness gaps** — areas where knowledge base is outdated
6. **Edge case blind spots** — specific conditions that consistently cause failures

For each issue found, provide:
- A clear title
- Severity (low/medium/high/critical)
- Detailed description with specific evidence
- Actionable recommendation

Respond in this JSON format:
{
    "analysis": "Detailed narrative analysis of the knowledge gaps",
    "findings": [
        {
            "title": "Finding title",
            "severity": "high",
            "description": "What went wrong and why",
            "evidence": ["specific data points"],
            "recommendation": "What to fix"
        }
    ],
    "root_cause": "The primary systemic root cause of the blind spots"
}
"""


def _build_blind_spot_context(state: AgentState) -> str:
    """Build context string focused on graph relationships and cross-session patterns."""
    session = state["session"]
    parts = [
        f"Session: {session.session_id}",
        f"Failure summary: {session.failure_summary or 'N/A'}",
    ]

    # Graph results are critical for blind spot analysis
    graph_results = state.get("graph_results", [])
    if graph_results:
        parts.append("\n=== Graph Context (cross-session patterns) ===")
        for gr in graph_results:
            if gr.get("type") == "related_pattern":
                parts.append(
                    f"  Related session: {gr.get('session_id', 'N/A')}\n"
                    f"  Failure: {gr.get('failure_summary', 'N/A')}"
                )
            else:
                related = gr.get("related_sessions", [])
                parts.append(
                    f"  Session graph node: {gr.get('session', {}).get('session_id', 'N/A')}\n"
                    f"  Related sessions: {len(related)}\n"
                    f"  Tool calls in graph: {len(gr.get('tool_calls', []))}\n"
                    f"  LLM calls in graph: {len(gr.get('llm_calls', []))}"
                )

    # Session's own failure details
    if session.retrieval_events:
        parts.append("\n=== Failed Queries ===")
        for evt in session.retrieval_events:
            parts.append(f"  Query: {evt.query}")

    if session.llm_calls:
        parts.append("\n=== LLM Interactions ===")
        for lc in session.llm_calls:
            parts.append(f"  Prompt: {lc.prompt[:200]}")

    # Reranked evidence
    evidence = state.get("reranked_evidence", [])
    if evidence:
        parts.append("\n=== Retrieved Evidence (reranked) ===")
        for item in evidence:
            parts.append(f"[score={item['relevance_score']:.3f}] {item['text']}")

    return "\n".join(parts)


async def blind_spot(state: AgentState) -> dict:
    """Analyze systemic blind spots using GPT-4o-mini."""
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.openai_api_key,
        temperature=0,
        max_tokens=1500,
    )

    context = _build_blind_spot_context(state)

    response = await llm.ainvoke([
        {"role": "system", "content": BLIND_SPOT_PROMPT},
        {"role": "user", "content": context},
    ])

    logger.info("blind_spot_complete", session_id=state["session"].session_id)
    return {"analysis": response.content}
