"""Retrieval nodes — fetch evidence from Pinecone (vector) and Neo4j (graph).

These two nodes run in parallel in the LangGraph pipeline.
"""

import structlog

from app.agents.state import AgentState, ensure_session
from app.services.neo4j_service import neo4j_service
from app.services.vector_service import vector_service

logger = structlog.get_logger()


async def vector_retrieve(state: AgentState) -> dict:
    """Query Pinecone for semantically similar trace evidence.

    Searches two namespaces and merges results:
    - "failure_patterns": Session-level failure summaries (best for finding similar failures)
    - "traces": Individual trace steps (best for finding specific event patterns)

    This dual-namespace approach solves the semantic gap between failure summaries
    and individual trace step descriptions.
    """
    session = ensure_session(state["session"])
    failure_type = state.get("failure_type", session.failure_type)
    ft_key = str(failure_type.value if hasattr(failure_type, "value") else failure_type or "")

    # Failure-type-aware query phrases produce better semantic matches than
    # pipe-joined concatenations of raw session strings.
    _TYPE_QUERIES = {
        "memory":        "retrieval failure wrong documents returned low similarity scores stale embeddings",
        "tool_misfire":  "tool call failed permission error timeout connection error invalid parameters",
        "hallucination": "LLM response unsupported by sources fabricated claims ungrounded assertions",
        "blind_spot":    "knowledge gap zero retrieval results missing topic not found in knowledge base",
    }

    if ft_key in _TYPE_QUERIES:
        query_text = _TYPE_QUERIES[ft_key]
    else:
        # Unknown failure type — fall back to session content
        query_parts = []
        if session.failure_summary:
            query_parts.append(session.failure_summary)
        for evt in session.retrieval_events[:3]:
            query_parts.append(evt.query)
        query_text = " ".join(query_parts) if query_parts else "agent failure analysis"

    vector_results = []

    try:
        # ── Search failure_patterns namespace (session-level, high semantic match)
        try:
            pattern_matches = await vector_service.query_similar(
                query_text=query_text,
                namespace="failure_patterns",
                top_k=5,
                filters={"session_id": {"$ne": session.session_id}},
            )
            for m in pattern_matches:
                vector_results.append({
                    "id": m.get("id", ""),
                    "score": m.get("score", 0.0),
                    "metadata": {**m.get("metadata", {}), "_source_namespace": "failure_patterns"},
                })
        except Exception as exc:
            logger.debug("failure_patterns_search_failed", error=str(exc))

        # ── Search traces namespace (event-level, granular evidence)
        try:
            trace_matches = await vector_service.query_similar(
                query_text=query_text,
                namespace="traces",
                top_k=7,
                filters={"session_id": {"$ne": session.session_id}},
            )
            for m in trace_matches:
                vector_results.append({
                    "id": m.get("id", ""),
                    "score": m.get("score", 0.0),
                    "metadata": {**m.get("metadata", {}), "_source_namespace": "traces"},
                })
        except Exception as exc:
            logger.debug("traces_search_failed", error=str(exc))

        # Sort merged results by score (highest first) and deduplicate by session_id
        vector_results.sort(key=lambda x: x["score"], reverse=True)
        seen_sessions: set[str] = set()
        deduped: list[dict] = []
        for r in vector_results:
            sid = r.get("metadata", {}).get("session_id", "")
            # Allow multiple results from same session (different events)
            # but cap at 2 per session to avoid domination
            session_count = sum(1 for d in deduped if d.get("metadata", {}).get("session_id") == sid)
            if session_count < 2:
                deduped.append(r)
            if len(deduped) >= 10:
                break
        vector_results = deduped

        logger.info(
            "vector_retrieve_complete",
            session_id=session.session_id,
            results_count=len(vector_results),
            pattern_results=sum(1 for r in vector_results if r.get("metadata", {}).get("_source_namespace") == "failure_patterns"),
            trace_results=sum(1 for r in vector_results if r.get("metadata", {}).get("_source_namespace") == "traces"),
        )
        return {"vector_results": vector_results}

    except Exception as exc:
        logger.warning("vector_retrieve_failed", error=str(exc))
        return {"vector_results": []}


async def graph_traverse(state: AgentState) -> dict:
    """Traverse Neo4j to find related sessions and failure patterns.

    Skipped immediately (returns empty) when state["skip_graph"] is True —
    saves ~3s for orgs without cross-session history in Neo4j.

    Performs multi-hop traversals to discover:
    1. Direct relationships (1-hop): FAILED_WITH, RELATED_TO
    2. Shared chunk patterns (2-hop): sessions retrieving the same documents
    3. Systemic blind spots (2-hop): recurring knowledge gaps across agents
    4. Same-query failures (2-hop): identical queries failing in different ways
    """
    if state.get("skip_graph"):
        logger.debug("graph_traverse_skipped", reason="skip_graph=True")
        return {"graph_results": []}

    session = ensure_session(state["session"])
    failure_type = state.get("failure_type", session.failure_type)

    try:
        graph_results = []

        # ── 1-hop: Direct relationships ────────────────────────────────
        query = """
        MATCH (s:Session {session_id: $session_id})
        OPTIONAL MATCH (s)-[:FAILED_WITH]->(f:FailureType)
        OPTIONAL MATCH (s)-[:RELATED_TO]-(related:Session)
        RETURN s, f, collect(DISTINCT related) as related_sessions
        """

        records = await neo4j_service.execute_read(query, {"session_id": session.session_id})
        for record in records:
            graph_results.append({
                "type": "direct",
                "session": dict(record["s"]) if record["s"] else {},
                "failure_type": dict(record["f"]) if record["f"] else {},
                "related_sessions": [dict(r) for r in record["related_sessions"]],
            })

        # ── 1-hop: Sessions with same failure type ─────────────────────
        pattern_query = """
        MATCH (other:Session)-[:FAILED_WITH]->(f:FailureType {name: $failure_type})
        WHERE other.session_id <> $session_id
        RETURN other.session_id as session_id,
               other.failure_summary as failure_summary,
               other.agent_id as agent_id
        LIMIT 5
        """
        pattern_records = await neo4j_service.execute_read(
            pattern_query,
            {"session_id": session.session_id, "failure_type": str(failure_type) if failure_type else "unknown"},
        )
        for record in pattern_records:
            graph_results.append({
                "type": "related_pattern",
                "session_id": record["session_id"],
                "failure_summary": record["failure_summary"],
                "agent_id": record.get("agent_id", ""),
            })

        # ── 2-hop: Shared chunks — sessions retrieving the same docs ───
        # Finds other sessions that retrieved the same chunks as this one,
        # revealing whether the same documents cause failures elsewhere.
        shared_chunk_query = """
        MATCH (s:Session {session_id: $session_id})-[:CONTAINS_QUERY]->(q:Query)-[:RETRIEVED]->(c:Chunk)
        MATCH (c)<-[:RETRIEVED]-(q2:Query)<-[:CONTAINS_QUERY]-(s2:Session)
        WHERE s2.session_id <> $session_id
        WITH c.doc_id as shared_doc, s2.session_id as other_session,
             s2.failure_type as other_failure, s2.failure_summary as other_summary,
             count(DISTINCT q2) as shared_query_count
        RETURN shared_doc, other_session, other_failure, other_summary, shared_query_count
        ORDER BY shared_query_count DESC
        LIMIT 5
        """
        try:
            chunk_records = await neo4j_service.execute_read(
                shared_chunk_query, {"session_id": session.session_id}
            )
            for record in chunk_records:
                graph_results.append({
                    "type": "shared_chunk",
                    "shared_doc_id": record["shared_doc"],
                    "other_session_id": record["other_session"],
                    "other_failure_type": record["other_failure"],
                    "other_failure_summary": record["other_summary"],
                    "shared_query_count": record["shared_query_count"],
                })
        except Exception as exc:
            logger.debug("shared_chunk_query_failed", error=str(exc))

        # ── 2-hop: Systemic blind spots across agents ──────────────────
        # Finds BlindSpot topics hit by multiple different agents,
        # revealing systemic knowledge gaps (not just one session).
        blind_spot_query = """
        MATCH (s:Session {session_id: $session_id})-[:CONTAINS_QUERY]->(q:Query)
              -[:UNRESOLVED_DUE_TO]->(b:BlindSpot)
        OPTIONAL MATCH (b)<-[:UNRESOLVED_DUE_TO]-(q2:Query)<-[:CONTAINS_QUERY]-(s2:Session)
        WHERE s2.session_id <> $session_id
        WITH b.topic as topic, b.query_count as total_hits,
             collect(DISTINCT s2.agent_id) as affected_agents,
             collect(DISTINCT s2.session_id) as affected_sessions
        RETURN topic, total_hits, affected_agents, affected_sessions
        ORDER BY total_hits DESC
        LIMIT 5
        """
        try:
            bs_records = await neo4j_service.execute_read(
                blind_spot_query, {"session_id": session.session_id}
            )
            for record in bs_records:
                graph_results.append({
                    "type": "systemic_blind_spot",
                    "topic": record["topic"],
                    "total_hits": record["total_hits"],
                    "affected_agents": record["affected_agents"],
                    "affected_sessions_count": len(record["affected_sessions"]),
                })
        except Exception as exc:
            logger.debug("blind_spot_query_failed", error=str(exc))

        # ── 2-hop: Same query failing in different ways ────────────────
        # Finds sessions where similar queries (same text) led to different
        # failure types — reveals unstable/flaky failure modes.
        same_query_query = """
        MATCH (s:Session {session_id: $session_id})-[:CONTAINS_QUERY]->(q:Query)
        WITH q.text as query_text
        MATCH (q2:Query {text: query_text})<-[:CONTAINS_QUERY]-(s2:Session)
        WHERE s2.session_id <> $session_id
        RETURN query_text, s2.session_id as other_session,
               s2.failure_type as other_failure_type,
               s2.outcome as other_outcome
        LIMIT 5
        """
        try:
            sq_records = await neo4j_service.execute_read(
                same_query_query, {"session_id": session.session_id}
            )
            for record in sq_records:
                graph_results.append({
                    "type": "same_query_different_outcome",
                    "query_text": record["query_text"],
                    "other_session_id": record["other_session"],
                    "other_failure_type": record["other_failure_type"],
                    "other_outcome": record["other_outcome"],
                })
        except Exception as exc:
            logger.debug("same_query_query_failed", error=str(exc))

        logger.info(
            "graph_traverse_complete",
            session_id=session.session_id,
            results_count=len(graph_results),
            result_types=[r["type"] for r in graph_results],
        )
        return {"graph_results": graph_results}

    except Exception as exc:
        logger.warning("graph_traverse_failed", error=str(exc))
        return {"graph_results": []}
