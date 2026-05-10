# pgvector Patterns — Aethen-AI

> Embedding and ingestion patterns for vector search across agent traces.
> Vector store: `session_vectors` table in Postgres (Supabase), using the `pgvector` extension.
> Embedding model: `text-embedding-3-small`, 1536 dimensions, cosine similarity.

---

## Table Schema

```sql
CREATE TABLE session_vectors (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    namespace   TEXT NOT NULL,   -- "traces" | "failure_patterns"
    org_id      TEXT,
    event_type  TEXT,            -- "llm_call" | "tool_call" | "retrieval" | "session"
    metadata    JSONB,
    embedding   vector(1536)
);
```

---

## 1. Session Upsert (Multi-Event Embedding)

```python
async def upsert_session(self, session: Session):
    """Embed all events in a session and upsert to session_vectors."""
    vectors = []
    for event in self._extract_events(session):
        embedding = await embedding_service.embed(event["text"])
        vectors.append({
            "id": event["id"],
            "session_id": session.session_id,
            "namespace": "traces",
            "org_id": session.org_id,
            "event_type": event["type"],  # llm_call | tool_call | retrieval
            "metadata": {
                "session_id": session.session_id,
                "failure_type": session.failure_type,
                "event_type": event["type"],
                "text": event["text"][:1000],
            },
            "embedding": embedding,
        })
    await self._bulk_upsert(vectors)
```

**Pattern**: Embed each event (LLM call, tool call, retrieval) separately rather than the entire session. This gives finer-grained similarity search.

**Gotcha**: Keep text fields in JSONB metadata compact (truncate to ~1000 chars). The metadata is stored as JSONB — no hard limit, but large blobs increase row size.

**Used in**: `app/services/pgvector_service.py`

---

## 2. Similarity Search for Evidence Retrieval

```python
async def query_similar(
    self,
    query_text: str,
    top_k: int = 10,
    namespace: str = "traces",
    filter_session_id: str | None = None,
    org_id: str | None = None,
) -> list[dict]:
    """Cosine similarity search via pgvector (exact search)."""
    embedding = await embedding_service.embed(query_text)

    # Exact search — SET LOCAL enable_indexscan = off forces sequential scan
    # Switch to HNSW index + remove this line when scale requires it
    sql = """
        SET LOCAL enable_indexscan = off;
        SELECT id, session_id, event_type, metadata,
               1 - (embedding <=> $1::vector) AS score
        FROM session_vectors
        WHERE namespace = $2
          AND ($3::text IS NULL OR session_id != $3)
          AND ($4::text IS NULL OR org_id = $4)
        ORDER BY embedding <=> $1::vector
        LIMIT $5
    """
    rows = await self._conn.fetch(sql, embedding, namespace, filter_session_id, org_id, top_k)
    return [dict(r) for r in rows]
```

**Pattern**: Filter by `namespace` and exclude the current session (`session_id != filter_session_id`). This prevents memory failures from returning tool misfire evidence and stops the current session's own events from dominating cross-session results.

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

**Used in**: `app/services/pgvector_service.py`

---

## 4. Namespace Strategy

| Namespace | Contents | Used By |
|-----------|----------|---------|
| `traces` | All trace events (LLM, tool, retrieval) | Retrieve node — event-level granularity |
| `failure_patterns` | Session-level failure summary embeddings | Retrieve node — session-level patterns |

**Pattern**: Use `namespace` column to separate trace evidence from session-level summaries. Searching both namespaces and merging results addresses the semantic gap between granular events and high-level failure patterns.

---

## 5. Failure Pattern Upsert (Session-Level)

```python
async def upsert_failure_pattern(self, session: Session):
    """Embed the full session failure summary for pattern matching."""
    text = _build_failure_pattern_text(session)
    embedding = await embedding_service.embed(text)
    await self._upsert_one({
        "id": f"fp:{session.session_id}",
        "session_id": session.session_id,
        "namespace": "failure_patterns",
        "org_id": session.org_id,
        "event_type": "session",
        "metadata": {
            "session_id": session.session_id,
            "agent_id": session.agent_id,
            "failure_type": session.failure_type,
            "failure_summary": (session.failure_summary or "")[:500],
            "llm_call_count": len(session.llm_calls),
            "tool_call_count": len(session.tool_calls),
            "retrieval_count": len(session.retrieval_events),
            "text": text[:1000],
        },
        "embedding": embedding,
    })
```

**Pattern**: One embedding per failed session combining failure_summary + queries + tool errors + hallucination flags. This enables failure-against-failure search in the `failure_patterns` namespace.

---

## 6. HNSW Index (Scale Migration)

When the `session_vectors` table grows beyond ~50k rows, add an HNSW index for sub-linear approximate search:

```sql
-- Run once when exact search becomes too slow
CREATE INDEX ON session_vectors
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Remove the SET LOCAL line from query_similar() after adding this index
```

**Current state**: Exact search is used (`SET LOCAL enable_indexscan = off`). 100% recall, O(n) cost. Acceptable at current data size (<10k rows).

**Trade-off**: HNSW gives ~1ms queries at millions of rows, but ~5% recall loss. Switch when p95 query latency exceeds 100ms.

---

## 7. Embedding Service with Graceful Degradation

```python
class EmbeddingService:
    async def embed(self, text: str) -> list[float]:
        if not self.is_available:
            return [0.0] * 1536  # Return zero vector
        response = await self._client.embeddings.create(
            input=text, model="text-embedding-3-small"
        )
        return response.data[0].embedding
```

**Pattern**: Return zero vectors when the embedding service is unavailable. This allows the ingestion pipeline to continue (data stored in Postgres, Neo4j) even if OpenAI is down. Queries against zero vectors return no meaningful results, which is the correct degraded behavior.

**Used in**: `app/services/embedding_service.py`
