"""Hallucination RCA node — root cause analysis for LLM hallucinations.

Cross-references LLM outputs against source documents to identify
fabricated claims, unsupported conclusions, and misquoted sources.
"""

import structlog
from langchain_openai import ChatOpenAI

from app.agents.state import AgentState
from app.config import settings

logger = structlog.get_logger()

HALLUCINATION_RCA_PROMPT = """\
You are an expert AI systems debugger specializing in LLM hallucination detection
and root cause analysis.

Analyze the following session trace data and evidence to diagnose hallucination failures.

Focus on:
1. **Ungrounded claims** — LLM responses containing facts not present in source documents
2. **Source misattribution** — claims attributed to wrong source documents
3. **Retrieval gaps** — hallucinations caused by insufficient context retrieval
4. **Stale sources** — outdated documents leading to incorrect information
5. **Confidence calibration** — model producing high-confidence responses despite weak evidence
6. **Fabricated references** — citations to non-existent documents or data

For each issue found, provide:
- A clear title
- Severity (low/medium/high/critical)
- Detailed description with specific evidence
- Actionable recommendation

Respond in this JSON format:
{
    "analysis": "Detailed narrative analysis of the hallucination root causes",
    "findings": [
        {
            "title": "Finding title",
            "severity": "high",
            "description": "What went wrong and why",
            "evidence": ["specific data points"],
            "recommendation": "What to fix"
        }
    ],
    "root_cause": "The primary root cause of the hallucinations"
}
"""


def _build_hallucination_context(state: AgentState) -> str:
    """Build context string focused on LLM calls and source grounding."""
    session = state["session"]
    parts = [
        f"Session: {session.session_id}",
        f"Failure summary: {session.failure_summary or 'N/A'}",
    ]

    if session.llm_calls:
        parts.append("\n=== LLM Calls ===")
        for i, lc in enumerate(session.llm_calls, 1):
            sources = ", ".join(lc.source_documents) or "none"
            parts.append(
                f"\n#{i} Model: {lc.model}\n"
                f"  Hallucination flagged: {lc.hallucination_flag}\n"
                f"  Source documents: [{sources}]\n"
                f"  Prompt (truncated): {lc.prompt[:300]}\n"
                f"  Response (truncated): {lc.response[:500]}"
            )

    if session.retrieval_events:
        parts.append("\n=== Retrieval Context ===")
        for evt in session.retrieval_events:
            scores = ", ".join(f"{s:.3f}" for s in evt.relevance_scores)
            parts.append(
                f"  Query: {evt.query[:200]}\n"
                f"  Actual docs: {evt.actual_doc_ids}\n"
                f"  Scores: [{scores}]"
            )

    # Include reranked evidence
    evidence = state.get("reranked_evidence", [])
    if evidence:
        parts.append("\n=== Retrieved Evidence (reranked) ===")
        for item in evidence:
            parts.append(f"[score={item['relevance_score']:.3f}] {item['text']}")

    return "\n".join(parts)


async def hallucination_rca(state: AgentState) -> dict:
    """Analyze hallucination root causes using GPT-4o-mini."""
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
        temperature=0,
        max_tokens=1500,
    )

    context = _build_hallucination_context(state)

    response = await llm.ainvoke([
        {"role": "system", "content": HALLUCINATION_RCA_PROMPT},
        {"role": "user", "content": context},
    ])

    logger.info("hallucination_rca_complete", session_id=state["session"].session_id)
    return {"analysis": response.content}
