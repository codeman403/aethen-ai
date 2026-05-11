# Indexing

---

## What Gets Indexed

At ingestion (`POST /api/ingest`), every trace event in a session is embedded and stored in `session_vectors`. Additionally, each failed session gets one session-level pattern embedding in the `failure_patterns` namespace.

### Event-Level Embeddings (namespace: `traces`)

| Event type | Vector ID pattern | Text embedded |
|---|---|---|
| LLM call | `{session_id}:llm:{call_id}` | `"LLM call: {prompt[:500]} -> {response[:500]}"` |
| Tool call | `{session_id}:tool:{call_id}` | `"Tool call: {tool_name}({parameters}) -> {status}"` |
| Retrieval event | `{session_id}:retrieval:{event_id}` | `"Retrieval: {query[:500]} -> {chunks_returned} chunks"` |

### Session-Level Pattern (namespace: `failure_patterns`)

One additional embedding per failed session:

```
Vector ID: {session_id}:pattern
Text: "{failure_summary} | Query: {retrieval_query} | Avg relevance: 0.28 | Tool error (search_kb): ConnectionError..."
```

This rich text combines the failure summary, retrieval queries, average relevance scores, and tool errors into a single embedding optimised for "find sessions similar to this failure."

### Metadata Schema

Each vector stores a JSONB metadata payload used for filtering and display:

```json
{
  "session_id": "sess-001",
  "agent_id": "my-agent",
  "event_type": "retrieval",
  "failure_type": "memory",
  "failure_summary": "Wrong documents retrieved...",
  "outcome": "failure",
  "chunks_returned": 3,
  "namespace": "traces"
}
```

---

## Embedding Pipeline

```
session.llm_calls, .tool_calls, .retrieval_events
    → build text representations (one per event)
    → embedding_service.embed_batch(texts)  # OpenAI text-embedding-3-small
    → asyncpg INSERT INTO session_vectors ... ON CONFLICT DO UPDATE
```

Batch embedding uses `embed_batch()` to process all events in a session in one OpenAI API call (up to 2048 texts per batch).

---

## Upsert Semantics

```sql
INSERT INTO session_vectors (id, session_id, namespace, org_id, event_type, metadata, embedding)
VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
ON CONFLICT (id) DO UPDATE
  SET embedding = EXCLUDED.embedding,
      metadata  = EXCLUDED.metadata
```

Re-ingesting the same session ID updates the embeddings in place — safe to run `POST /api/ingest` multiple times on the same session.

---

## Backfill

`POST /api/backfill` re-embeds all sessions in Postgres that have no entries in `session_vectors`. Use this after:
- Migrating from Pinecone to pgvector
- Updating the embedding model
- Recovering from partial ingest failures

---

## Index Configuration

The HNSW index on `session_vectors.embedding`:

```sql
CREATE INDEX ON session_vectors USING hnsw (embedding vector_cosine_ops);
```

**Current configuration:** Index exists but is bypassed (`SET LOCAL enable_indexscan = off`) for exact search at current dataset sizes. Exact search is faster than HNSW approximation when the full index fits in RAM (< ~100K vectors).

Re-enable when dataset exceeds ~100K rows by removing the `SET LOCAL enable_indexscan = off` line in `pgvector_service.query_similar()`.
