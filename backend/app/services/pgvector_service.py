"""pgvector-backed vector storage — drop-in replacement for PineconeService.

Uses the session_vectors table in Postgres with HNSW cosine-similarity index.
Interface is intentionally identical to PineconeService so vector_service.py
can route transparently between the two.
"""

from __future__ import annotations

import structlog

from app.models.trace import Session
from app.services.embedding_service import embedding_service
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()


class PgVectorService:

    @property
    def is_available(self) -> bool:
        return postgres_service.is_available

    # ── Write ──────────────────────────────────────────────────────────────

    async def upsert_session(self, session: Session, org_id: str | None = None) -> int:
        """Embed and store a session's trace events in session_vectors.

        Mirrors PineconeService.upsert_session() — same namespaces, same text
        representations, same metadata schema.
        """
        if not self.is_available:
            raise RuntimeError("pgvector: Postgres not available")

        texts:    list[str]  = []
        ids:      list[str]  = []
        ns_list:  list[str]  = []
        et_list:  list[str]  = []
        meta_list: list[dict] = []

        fs = (session.failure_summary or "")[:300]

        for lc in session.llm_calls:
            texts.append(f"LLM call: {lc.prompt[:500]} -> {lc.response[:500]}")
            ids.append(f"{session.session_id}:llm:{lc.call_id}")
            ns_list.append("traces"); et_list.append("llm_call")
            meta_list.append({
                "session_id": session.session_id, "agent_id": session.agent_id,
                "event_type": "llm_call", "model": lc.model,
                "hallucination_flag": lc.hallucination_flag,
                "failure_type": session.failure_type or "",
                "failure_summary": fs, "outcome": session.outcome,
                "text": f"LLM: {lc.prompt[:200]} → {lc.response[:200]}",
            })

        for tc in session.tool_calls:
            texts.append(f"Tool call: {tc.tool_name}({tc.parameters}) -> {tc.status}")
            ids.append(f"{session.session_id}:tool:{tc.call_id}")
            ns_list.append("traces"); et_list.append("tool_call")
            err = f" | error: {tc.error[:150]}" if tc.error else ""
            meta_list.append({
                "session_id": session.session_id, "agent_id": session.agent_id,
                "event_type": "tool_call", "tool_name": tc.tool_name,
                "status": tc.status, "failure_type": session.failure_type or "",
                "failure_summary": fs, "outcome": session.outcome,
                "text": f"Tool {tc.tool_name}: {str(tc.parameters)[:100]} → {tc.status}{err}",
            })

        for ret in session.retrieval_events:
            texts.append(f"Retrieval: {ret.query[:500]} -> {ret.chunks_returned} chunks")
            ids.append(f"{session.session_id}:retrieval:{ret.event_id}")
            ns_list.append("traces"); et_list.append("retrieval")
            avg = round(sum(ret.relevance_scores) / len(ret.relevance_scores), 3) if ret.relevance_scores else None
            sp = f", avg_score={avg}" if avg is not None else ""
            meta_list.append({
                "session_id": session.session_id, "agent_id": session.agent_id,
                "event_type": "retrieval", "namespace": ret.namespace,
                "chunks_returned": ret.chunks_returned,
                "failure_type": session.failure_type or "",
                "failure_summary": fs, "outcome": session.outcome,
                "text": f"Query: '{ret.query[:250]}' → {ret.chunks_returned} chunks{sp}",
            })

        total = 0

        if texts:
            embeddings = await embedding_service.embed_batch(texts)
            async with postgres_service._pool.acquire() as conn:
                for vid, emb, ns, et, meta in zip(ids, embeddings, ns_list, et_list, meta_list):
                    await conn.execute(
                        """
                        INSERT INTO session_vectors (id, session_id, namespace, org_id, event_type, metadata, embedding)
                        VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
                        ON CONFLICT (id) DO UPDATE
                          SET embedding = EXCLUDED.embedding,
                              metadata  = EXCLUDED.metadata
                        """,
                        vid, session.session_id, ns, org_id, et,
                        __import__("json").dumps(meta), str(emb),
                    )
            total += len(texts)
            logger.info("pgvector_traces_upserted", session_id=session.session_id, count=len(texts))

        # Failure pattern (mirrors pinecone "failure_patterns" namespace)
        if session.outcome == "failure" and session.failure_summary:
            from app.services.pinecone_service import PineconeService
            pattern_text = PineconeService._build_failure_pattern_text(session)
            emb = await embedding_service.embed_text(pattern_text)
            meta = {
                "session_id": session.session_id, "agent_id": session.agent_id,
                "failure_type": session.failure_type or "",
                "failure_summary": session.failure_summary[:500],
                "outcome": session.outcome,
                "llm_call_count": len(session.llm_calls),
                "tool_call_count": len(session.tool_calls),
                "retrieval_count": len(session.retrieval_events),
            }
            async with postgres_service._pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO session_vectors (id, session_id, namespace, org_id, event_type, metadata, embedding)
                    VALUES ($1, $2, 'failure_patterns', $3, 'pattern', $4, $5::vector)
                    ON CONFLICT (id) DO UPDATE
                      SET embedding = EXCLUDED.embedding,
                          metadata  = EXCLUDED.metadata
                    """,
                    f"{session.session_id}:pattern",
                    session.session_id, org_id,
                    __import__("json").dumps(meta), str(emb),
                )
            total += 1
            logger.info("pgvector_pattern_upserted", session_id=session.session_id)

        return total

    # ── Read ───────────────────────────────────────────────────────────────

    async def query_similar(
        self,
        query_text: str,
        namespace: str = "traces",
        top_k: int = 10,
        filters: dict | None = None,
        org_id: str | None = None,
    ) -> list[dict]:
        """Find similar vectors by cosine similarity.

        filters: optional dict — currently supports {"session_id": {"$ne": "..."}}
                 to exclude the current session (mirrors Pinecone filter syntax).
        """
        if not self.is_available:
            raise RuntimeError("pgvector: Postgres not available")

        embedding = await embedding_service.embed_text(query_text)

        # Extract exclude_session_id from Pinecone-style filter
        exclude_sid: str | None = None
        if filters and "session_id" in filters:
            ne = filters["session_id"].get("$ne")
            if ne:
                exclude_sid = ne

        async with postgres_service._pool.acquire() as conn:
            async with conn.transaction():
                # Exact cosine search at this data size (~1-5K vectors).
                # <5ms here; eliminates HNSW approximation error entirely.
                # Re-enable indexscan when vectors exceed ~100K.
                await conn.execute("SET LOCAL enable_indexscan = off")

                if exclude_sid and org_id:
                    rows = await conn.fetch(
                        """
                        SELECT id, session_id, metadata,
                               1 - (embedding <=> $1::vector) AS score
                        FROM session_vectors
                        WHERE namespace = $2
                          AND session_id <> $3
                          AND (org_id = $4 OR org_id IS NULL)
                        ORDER BY embedding <=> $1::vector
                        LIMIT $5
                        """,
                        str(embedding), namespace, exclude_sid, org_id, top_k,
                    )
                elif exclude_sid:
                    rows = await conn.fetch(
                        """
                        SELECT id, session_id, metadata,
                               1 - (embedding <=> $1::vector) AS score
                        FROM session_vectors
                        WHERE namespace = $2 AND session_id <> $3
                        ORDER BY embedding <=> $1::vector
                        LIMIT $4
                        """,
                        str(embedding), namespace, exclude_sid, top_k,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT id, session_id, metadata,
                               1 - (embedding <=> $1::vector) AS score
                        FROM session_vectors
                        WHERE namespace = $2
                        ORDER BY embedding <=> $1::vector
                        LIMIT $3
                        """,
                        str(embedding), namespace, top_k,
                    )

        import json
        return [
            {
                "id": r["id"],
                "score": float(r["score"]),
                "metadata": r["metadata"] if isinstance(r["metadata"], dict) else json.loads(r["metadata"]),
            }
            for r in rows
        ]

    async def count_vectors(self, namespace: str | None = None) -> int:
        """Return total vector count (optionally filtered by namespace)."""
        if not self.is_available:
            return 0
        async with postgres_service._pool.acquire() as conn:
            if namespace:
                return await conn.fetchval(
                    "SELECT COUNT(*) FROM session_vectors WHERE namespace = $1", namespace
                ) or 0
            return await conn.fetchval("SELECT COUNT(*) FROM session_vectors") or 0


pgvector_service = PgVectorService()
