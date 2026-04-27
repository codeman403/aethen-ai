"""Pinecone vector database service."""

import structlog
from pinecone import Pinecone

from app.config import settings
from app.models.trace import Session
from app.services.embedding_service import embedding_service

logger = structlog.get_logger()


class PineconeService:
    """Manages trace storage and retrieval in Pinecone."""

    def __init__(self) -> None:
        self._client: Pinecone | None = None
        self._index = None

    async def initialize(self) -> None:
        """Initialize the Pinecone client and connect to the index."""
        if not settings.pinecone_api_key:
            logger.warning("pinecone_no_key", msg="PINECONE_API_KEY not set, vector DB unavailable")
            return
        self._client = Pinecone(api_key=settings.pinecone_api_key)
        self._index = self._client.Index(settings.pinecone_index)
        logger.info("pinecone_initialized", index=settings.pinecone_index)

    @property
    def is_available(self) -> bool:
        """Check if Pinecone is connected."""
        return self._index is not None

    async def upsert_session(self, session: Session, namespace: str = "traces") -> int:
        """Embed and store a session's trace events in Pinecone.

        Stores vectors in two namespaces:
        - "traces": Individual trace step embeddings (LLM calls, tool calls, retrievals)
        - "failure_patterns": Session-level failure summary embeddings for pattern matching

        Returns the number of vectors upserted (across both namespaces).
        """
        if not self.is_available:
            raise RuntimeError("PineconeService not initialized")

        # Build text representations for embedding
        texts: list[str] = []
        ids: list[str] = []
        metadata_list: list[dict] = []

        for llm_call in session.llm_calls:
            texts.append(f"LLM call: {llm_call.prompt[:500]} -> {llm_call.response[:500]}")
            ids.append(f"{session.session_id}:llm:{llm_call.call_id}")
            metadata_list.append({
                "session_id": session.session_id,
                "agent_id": session.agent_id,
                "event_type": "llm_call",
                "model": llm_call.model,
                "hallucination_flag": llm_call.hallucination_flag,
                "failure_type": session.failure_type or "",
                "outcome": session.outcome,
            })

        for tool_call in session.tool_calls:
            texts.append(f"Tool call: {tool_call.tool_name}({tool_call.parameters}) -> {tool_call.status}")
            ids.append(f"{session.session_id}:tool:{tool_call.call_id}")
            metadata_list.append({
                "session_id": session.session_id,
                "agent_id": session.agent_id,
                "event_type": "tool_call",
                "tool_name": tool_call.tool_name,
                "status": tool_call.status,
                "failure_type": session.failure_type or "",
                "outcome": session.outcome,
            })

        for retrieval in session.retrieval_events:
            texts.append(f"Retrieval: {retrieval.query[:500]} -> {retrieval.chunks_returned} chunks")
            ids.append(f"{session.session_id}:retrieval:{retrieval.event_id}")
            metadata_list.append({
                "session_id": session.session_id,
                "agent_id": session.agent_id,
                "event_type": "retrieval",
                "namespace": retrieval.namespace,
                "chunks_returned": retrieval.chunks_returned,
                "failure_type": session.failure_type or "",
                "outcome": session.outcome,
            })

        total_upserted = 0

        if texts:
            # Embed and upsert trace steps
            embeddings = await embedding_service.embed_batch(texts)
            vectors = [
                {"id": vid, "values": emb, "metadata": meta}
                for vid, emb, meta in zip(ids, embeddings, metadata_list)
            ]
            self._index.upsert(vectors=vectors, namespace=namespace)
            total_upserted += len(vectors)
            logger.info("pinecone_traces_upserted", session_id=session.session_id, count=len(vectors))

        # ── Also store session-level failure pattern embedding ─────────
        # This goes in a separate "failure_patterns" namespace so that
        # vector_retrieve can search failures-against-failures (matching
        # semantic intent) instead of failures-against-trace-steps.
        if session.outcome == "failure" and session.failure_summary:
            pattern_text = self._build_failure_pattern_text(session)
            pattern_embedding = await embedding_service.embed_text(pattern_text)
            pattern_meta = {
                "session_id": session.session_id,
                "agent_id": session.agent_id,
                "failure_type": session.failure_type or "",
                "failure_summary": session.failure_summary[:500],
                "outcome": session.outcome,
                "llm_call_count": len(session.llm_calls),
                "tool_call_count": len(session.tool_calls),
                "retrieval_count": len(session.retrieval_events),
            }
            self._index.upsert(
                vectors=[{
                    "id": f"{session.session_id}:pattern",
                    "values": pattern_embedding,
                    "metadata": pattern_meta,
                }],
                namespace="failure_patterns",
            )
            total_upserted += 1
            logger.info("pinecone_pattern_upserted", session_id=session.session_id)

        return total_upserted

    @staticmethod
    def _build_failure_pattern_text(session: Session) -> str:
        """Build a rich text summary of a session's failure for embedding.

        Combines the failure summary with key signals so that similar failures
        cluster together in vector space (e.g., "tool timeout" failures match
        other "tool timeout" failures, not random trace steps).
        """
        parts = [session.failure_summary or ""]

        # Add retrieval query context
        for evt in session.retrieval_events[:3]:
            if evt.query:
                parts.append(f"Query: {evt.query[:200]}")
            if evt.chunks_returned == 0:
                parts.append("No chunks retrieved")
            elif evt.relevance_scores:
                avg_score = sum(evt.relevance_scores) / len(evt.relevance_scores)
                parts.append(f"Avg relevance: {avg_score:.2f}")

        # Add tool error context
        for tc in session.tool_calls[:3]:
            if tc.error:
                parts.append(f"Tool error ({tc.tool_name}): {tc.error[:200]}")

        # Add LLM hallucination context
        for lc in session.llm_calls[:2]:
            if lc.hallucination_flag:
                parts.append(f"Hallucinated response from {lc.model}")

        return " | ".join(p for p in parts if p)

    async def query_similar(
        self,
        query_text: str,
        namespace: str = "traces",
        top_k: int = 10,
        filters: dict | None = None,
    ) -> list[dict]:
        """Find similar trace events by text query."""
        if not self.is_available:
            raise RuntimeError("PineconeService not initialized")

        embedding = await embedding_service.embed_text(query_text)
        results = self._index.query(
            vector=embedding,
            namespace=namespace,
            top_k=top_k,
            filter=filters,
            include_metadata=True,
        )

        return [
            {"id": match.id, "score": match.score, "metadata": match.metadata}
            for match in results.matches
        ]


pinecone_service = PineconeService()
