"""Retrieval nodes — fetch evidence from Pinecone (vector) and Neo4j (graph).

These two nodes run in parallel in the LangGraph pipeline.
"""

import structlog

from app.agents.state import AgentState
from app.services.embedding_service import EmbeddingService
from app.services.neo4j_service import Neo4jService
from app.services.pinecone_service import PineconeService

logger = structlog.get_logger()


async def vector_retrieve(state: AgentState) -> dict:
    """Query Pinecone for semantically similar trace evidence.

    Uses the session's failure summary + retrieval queries as the search input.
    Returns top-k matching vectors with metadata.
    """
    session = state["session"]

    # Build a query from the session's failure context
    query_parts = []
    if session.failure_summary:
        query_parts.append(session.failure_summary)
    for evt in session.retrieval_events[:3]:
        query_parts.append(evt.query)
    for lc in session.llm_calls[:2]:
        if lc.hallucination_flag:
            query_parts.append(f"Hallucinated response: {lc.response[:200]}")

    query_text = " | ".join(query_parts) if query_parts else f"Session {session.session_id} failure analysis"

    try:
        embedding_svc = EmbeddingService()
        pinecone_svc = PineconeService()

        embedding = await embedding_svc.embed(query_text)
        results = await pinecone_svc.query(
            vector=embedding,
            namespace="traces",
            top_k=10,
            include_metadata=True,
        )

        vector_results = [
            {
                "id": match.get("id", ""),
                "score": match.get("score", 0.0),
                "metadata": match.get("metadata", {}),
            }
            for match in results.get("matches", [])
        ]

        logger.info(
            "vector_retrieve_complete",
            session_id=session.session_id,
            results_count=len(vector_results),
        )
        return {"vector_results": vector_results}

    except Exception as exc:
        logger.warning("vector_retrieve_failed", error=str(exc))
        return {"vector_results": []}


async def graph_traverse(state: AgentState) -> dict:
    """Traverse Neo4j to find related sessions and failure patterns.

    Follows FAILED_WITH and RELATED_TO relationships to discover
    systemic patterns across sessions.
    """
    session = state["session"]
    failure_type = state.get("failure_type", session.failure_type)

    try:
        neo4j_svc = Neo4jService()

        # Find sessions with the same failure type and their relationships
        query = """
        MATCH (s:Session {session_id: $session_id})
        OPTIONAL MATCH (s)-[:FAILED_WITH]->(f:FailureType)
        OPTIONAL MATCH (s)-[:RELATED_TO]-(related:Session)
        OPTIONAL MATCH (s)-[:HAS_TOOL_CALL]->(tc:ToolCall)
        OPTIONAL MATCH (s)-[:HAS_LLM_CALL]->(lc:LLMCall)
        RETURN s, f, collect(DISTINCT related) as related_sessions,
               collect(DISTINCT tc) as tool_calls,
               collect(DISTINCT lc) as llm_calls
        """

        records = await neo4j_svc.execute_read(query, {"session_id": session.session_id})

        graph_results = []
        for record in records:
            graph_results.append({
                "session": dict(record["s"]) if record["s"] else {},
                "failure_type": dict(record["f"]) if record["f"] else {},
                "related_sessions": [dict(r) for r in record["related_sessions"]],
                "tool_calls": [dict(tc) for tc in record["tool_calls"]],
                "llm_calls": [dict(lc) for lc in record["llm_calls"]],
            })

        # Also find sessions with the same failure pattern
        pattern_query = """
        MATCH (other:Session)-[:FAILED_WITH]->(f:FailureType {name: $failure_type})
        WHERE other.session_id <> $session_id
        RETURN other.session_id as session_id,
               other.failure_summary as failure_summary
        LIMIT 5
        """

        pattern_records = await neo4j_svc.execute_read(
            pattern_query,
            {"session_id": session.session_id, "failure_type": str(failure_type) if failure_type else "unknown"},
        )

        for record in pattern_records:
            graph_results.append({
                "type": "related_pattern",
                "session_id": record["session_id"],
                "failure_summary": record["failure_summary"],
            })

        logger.info(
            "graph_traverse_complete",
            session_id=session.session_id,
            results_count=len(graph_results),
        )
        return {"graph_results": graph_results}

    except Exception as exc:
        logger.warning("graph_traverse_failed", error=str(exc))
        return {"graph_results": []}
