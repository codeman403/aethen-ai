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

        Returns the number of vectors upserted.
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

        if not texts:
            return 0

        # Embed and upsert
        embeddings = await embedding_service.embed_batch(texts)
        vectors = [
            {"id": vid, "values": emb, "metadata": meta}
            for vid, emb, meta in zip(ids, embeddings, metadata_list)
        ]
        self._index.upsert(vectors=vectors, namespace=namespace)

        logger.info("pinecone_upserted", session_id=session.session_id, count=len(vectors))
        return len(vectors)

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
