"""Rerank node — uses Cohere Rerank v3 to score and filter combined evidence.

Takes vector + graph results, re-scores them by relevance to the session's
failure context, and returns the top evidence for the analysis module.
"""

import cohere
import structlog

from app.agents.state import AgentState, ensure_session
from app.config import settings

logger = structlog.get_logger()

MAX_EVIDENCE = 20  # max documents to send to reranker
TOP_K_RERANKED = 8  # top results to keep after reranking


def _evidence_to_documents(state: AgentState) -> list[str]:
    """Convert vector + graph results into text documents for reranking."""
    documents = []

    for vr in state.get("vector_results", []):
        meta = vr.get("metadata", {})
        score = vr.get("score", 0.0)
        doc_text = (
            f"[Vector match, score={score:.3f}] "
            f"{meta.get('failure_summary', '')} | "
            f"{meta.get('session_text', meta.get('text', ''))}"
        )
        documents.append(doc_text.strip())

    for gr in state.get("graph_results", []):
        gr_type = gr.get("type", "")

        if gr_type == "related_pattern":
            doc_text = (
                f"[Related failure — agent: {gr.get('agent_id', 'unknown')}] "
                f"{gr.get('failure_summary', '')}"
            )
        elif gr_type == "shared_chunk":
            doc_text = (
                f"[Shared document '{gr.get('shared_doc_id', '?')}'] "
                f"Also caused {gr.get('other_failure_type', 'failure')} in another session: "
                f"{gr.get('other_failure_summary', '')}"
            )
        elif gr_type == "systemic_blind_spot":
            agents = ", ".join((gr.get("affected_agents") or [])[:3])
            doc_text = (
                f"[Systemic blind spot] Topic: '{gr.get('topic', '')}' — "
                f"hit {gr.get('total_hits', 0)} times across agents: {agents}"
            )
        elif gr_type == "same_query_different_outcome":
            doc_text = (
                f"[Unstable query] '{str(gr.get('query_text', ''))[:100]}' — "
                f"produced {gr.get('other_failure_type', 'different')} failure in another session"
            )
        elif gr_type == "direct":
            # Use failure summary from the session node; skip if no content
            summary = (gr.get("session") or {}).get("failure_summary", "")
            if not summary:
                continue
            doc_text = f"[Direct context] {summary}"
        else:
            continue

        if doc_text.strip():
            documents.append(doc_text.strip())

    return documents[:MAX_EVIDENCE]


async def rerank(state: AgentState) -> dict:
    """Re-rank combined evidence using Cohere Rerank v3.

    Falls back to passing through raw evidence if Cohere is unavailable.
    """
    session = ensure_session(state["session"])
    failure_type = state.get("failure_type", session.failure_type)
    ft_key = str(failure_type.value if hasattr(failure_type, "value") else failure_type or "")

    # Failure-type-aware query gives Cohere a meaningful signal to rank against.
    _RERANK_QUERIES = {
        "memory":        "retrieval failure wrong documents low similarity scores stale embeddings",
        "tool_misfire":  "tool call failed permission error timeout connection error",
        "hallucination": "LLM response unsupported by sources fabricated ungrounded claims",
        "blind_spot":    "knowledge gap zero results missing topic not in knowledge base",
    }
    query = _RERANK_QUERIES.get(ft_key, session.failure_summary or session.outcome)

    documents = _evidence_to_documents(state)

    if not documents:
        logger.info("rerank_skipped_no_evidence", session_id=session.session_id)
        return {"reranked_evidence": []}

    # Try Cohere reranking; fall back to raw evidence if unavailable
    if not settings.cohere_api_key:
        logger.warning("rerank_skipped_no_api_key", session_id=session.session_id)
        return {
            "reranked_evidence": [
                {"text": doc, "relevance_score": 0.5, "index": i}
                for i, doc in enumerate(documents[:TOP_K_RERANKED])
            ]
        }

    try:
        client = cohere.AsyncClientV2(api_key=settings.cohere_api_key)

        response = await client.rerank(
            model="rerank-v3.5",
            query=query,
            documents=documents,
            top_n=TOP_K_RERANKED,
        )

        reranked = [
            {
                "text": documents[result.index],
                "relevance_score": result.relevance_score,
                "index": result.index,
            }
            for result in response.results
        ]

        scores = [r["relevance_score"] for r in reranked]
        logger.info(
            "rerank_complete",
            session_id=session.session_id,
            input_docs=len(documents),
            output_docs=len(reranked),
            top_score=round(scores[0], 3) if scores else 0.0,
            min_score=round(min(scores), 3) if scores else 0.0,
            avg_score=round(sum(scores) / len(scores), 3) if scores else 0.0,
            above_threshold=sum(1 for s in scores if s > 0.5),
        )
        return {"reranked_evidence": reranked}

    except Exception as exc:
        logger.warning("rerank_failed", error=str(exc), session_id=session.session_id)
        return {
            "reranked_evidence": [
                {"text": doc, "relevance_score": 0.5, "index": i}
                for i, doc in enumerate(documents[:TOP_K_RERANKED])
            ]
        }
