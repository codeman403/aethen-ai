"""Rerank node — uses Cohere Rerank v3 to score and filter combined evidence.

Takes vector + graph results, re-scores them by relevance to the session's
failure context, and returns the top evidence for the analysis module.
"""

import cohere
import structlog

from app.agents.state import AgentState
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
        if gr.get("type") == "related_pattern":
            doc_text = (
                f"[Related session: {gr.get('session_id', 'N/A')}] "
                f"{gr.get('failure_summary', '')}"
            )
        else:
            session_data = gr.get("session", {})
            related = gr.get("related_sessions", [])
            doc_text = (
                f"[Graph context] Session: {session_data.get('session_id', 'N/A')}, "
                f"Related sessions: {len(related)}, "
                f"Tool calls: {len(gr.get('tool_calls', []))}, "
                f"LLM calls: {len(gr.get('llm_calls', []))}"
            )
        documents.append(doc_text.strip())

    return documents[:MAX_EVIDENCE]


async def rerank(state: AgentState) -> dict:
    """Re-rank combined evidence using Cohere Rerank v3.

    Falls back to passing through raw evidence if Cohere is unavailable.
    """
    session = state["session"]

    # Build the query from the session's failure context
    query = (
        f"Analyze failure in session {session.session_id}: "
        f"{session.failure_summary or session.outcome}"
    )

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

        logger.info(
            "rerank_complete",
            session_id=session.session_id,
            input_docs=len(documents),
            output_docs=len(reranked),
            top_score=reranked[0]["relevance_score"] if reranked else 0.0,
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
