"""Memory Debug node — analyzes retrieval failures in AI agent sessions.

Identifies: wrong chunks returned, low similarity scores, stale embeddings,
metadata mismatches, missing expected documents.
"""

import structlog
from langchain_openai import ChatOpenAI

from app.agents.state import AgentState
from app.config import settings

logger = structlog.get_logger()

MEMORY_DEBUG_PROMPT = """\
You are an expert AI systems debugger specializing in RAG (Retrieval-Augmented Generation) failures.

Analyze the following session trace data and evidence to diagnose memory/retrieval failures.

Focus on:
1. **Low similarity scores** — chunks returned with scores below 0.7 indicate embedding quality issues
2. **Missing documents** — expected doc IDs not found in actual results
3. **Metadata mismatches** — wrong namespace, stale filters, incorrect metadata
4. **Chunk quality** — irrelevant or partial chunks that don't answer the query
5. **Embedding drift** — signs that embeddings are outdated relative to source documents

For each issue found, provide:
- A clear title
- Severity (low/medium/high/critical)
- Detailed description with specific evidence
- Actionable recommendation

Respond in this JSON format:
{
    "analysis": "Detailed narrative analysis of the retrieval failures",
    "findings": [
        {
            "title": "Finding title",
            "severity": "high",
            "description": "What went wrong and why",
            "evidence": ["specific data points"],
            "recommendation": "What to fix"
        }
    ],
    "root_cause": "The primary root cause of the retrieval failure"
}
"""


def _build_memory_context(state: AgentState) -> str:
    """Build context string focused on retrieval events."""
    session = state["session"]
    parts = [
        f"Session: {session.session_id}",
        f"Failure summary: {session.failure_summary or 'N/A'}",
    ]

    if session.retrieval_events:
        parts.append("\n=== Retrieval Events ===")
        for evt in session.retrieval_events:
            scores = ", ".join(f"{s:.3f}" for s in evt.relevance_scores)
            parts.append(
                f"\nQuery: {evt.query}\n"
                f"Namespace: {evt.namespace}\n"
                f"Chunks returned: {evt.chunks_returned}\n"
                f"Relevance scores: [{scores}]\n"
                f"Expected docs: {evt.expected_doc_ids}\n"
                f"Actual docs: {evt.actual_doc_ids}\n"
                f"Metadata filters: {evt.metadata_filters}"
            )

    # Include reranked evidence
    evidence = state.get("reranked_evidence", [])
    if evidence:
        parts.append("\n=== Retrieved Evidence (reranked) ===")
        for item in evidence:
            parts.append(f"[score={item['relevance_score']:.3f}] {item['text']}")

    return "\n".join(parts)


async def memory_debug(state: AgentState) -> dict:
    """Analyze retrieval failures using GPT-4o-mini."""
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
        temperature=0,
        max_tokens=1500,
    )

    context = _build_memory_context(state)

    response = await llm.ainvoke([
        {"role": "system", "content": MEMORY_DEBUG_PROMPT},
        {"role": "user", "content": context},
    ])

    logger.info("memory_debug_complete", session_id=state["session"].session_id)
    return {"analysis": response.content}
