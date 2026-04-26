# Pinecone Patterns — Aethen-AI

> Embedding and ingestion patterns for vector search across agent traces.

---

## 1. Session Upsert (Multi-Event Embedding)

```python
async def upsert_session(self, session: Session):
    """Embed all events in a session and upsert to Pinecone."""
    vectors = []
    for event in self._extract_events(session):
        embedding = await embedding_service.embed(event["text"])
        vectors.append({
            "id": event["id"],
            "values": embedding,
            "metadata": {
                "session_id": session.session_id,
                "failure_type": session.failure_type,
                "event_type": event["type"],  # llm_call | tool_call | retrieval
                "text": event["text"][:1000],  # Pinecone metadata limit
            },
        })
    self._index.upsert(vectors=vectors, namespace="traces")
```

**Pattern**: Embed each event (LLM call, tool call, retrieval) separately rather than the entire session. This gives finer-grained similarity search.

**Gotcha**: Pinecone metadata values have a 40KB total limit per vector. Truncate text fields.

**Used in**: `app/services/pinecone_service.py`

---

## 2. Similarity Search for Evidence Retrieval

```python
results = index.query(
    vector=query_embedding,
    top_k=10,
    namespace="traces",
    include_metadata=True,
    filter={
        "failure_type": {"$eq": target_failure_type}
    },
)
```

**Pattern**: Filter by `failure_type` to scope search to relevant failure category. This prevents memory failures from returning tool misfire evidence.

**Used in**: `app/agents/nodes/retrieve.py`

---

## 3. Text Extraction for Embedding

```python
def _event_to_text(event, event_type: str) -> str:
    """Convert a trace event to embeddable text."""
    if event_type == "llm_call":
        return f"Prompt: {event.prompt}\nResponse: {event.response}"
    elif event_type == "tool_call":
        return f"Tool: {event.tool_name} | Params: {event.parameters} | Result: {event.result or event.error}"
    elif event_type == "retrieval":
        return f"Query: {event.query} | Chunks: {event.chunks_returned} | Docs: {event.actual_doc_ids}"
```

**Pattern**: Structured text templates produce better embeddings than raw JSON dumps. Include the key fields that differentiate success from failure.

**Used in**: `app/services/pinecone_service.py`

---

## 4. Namespace Strategy

| Namespace | Contents | Used By |
|-----------|----------|---------|
| `traces` | All trace events (LLM, tool, retrieval) | Retrieve node |
| `default` | General knowledge base docs | Future: knowledge augmentation |

**Pattern**: Use namespaces to separate trace evidence from knowledge base content. This prevents cross-contamination in similarity search.

---

## 5. Embedding Service with Graceful Degradation

```python
class EmbeddingService:
    async def embed(self, text: str) -> list[float]:
        if not self.is_available:
            return [0.0] * 1536  # Return zero vector
        return await self._client.embeddings.create(
            input=text, model="text-embedding-3-small"
        )
```

**Pattern**: Return zero vectors when the embedding service is unavailable. This allows the ingestion pipeline to continue (data stored in Neo4j) even if Pinecone/OpenAI is down. Queries against zero vectors return no results, which is the correct degraded behavior.

**Used in**: `app/services/embedding_service.py`
