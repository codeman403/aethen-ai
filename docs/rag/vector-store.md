# Vector Store

---

## Technology

**pgvector** — a Postgres extension that adds a `vector` column type and HNSW/IVFFlat approximate nearest neighbour indexes.

Aethen uses pgvector collocated with the session Postgres database (Supabase). No separate vector database service is needed.

---

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE session_vectors (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL,
    namespace    TEXT NOT NULL,
    org_id       UUID,
    event_type   TEXT,
    metadata     JSONB,
    embedding    vector(1536)
);

CREATE INDEX ON session_vectors USING hnsw (embedding vector_cosine_ops);
```

Dimension: 1 536 — matches OpenAI `text-embedding-3-small`.

---

## Namespaces

| Namespace | Content | Query use case |
|---|---|---|
| `traces` | Individual trace events (llm_call, tool_call, retrieval) | "Find sessions with similar tool errors" |
| `failure_patterns` | Session-level failure summary embeddings | "Find sessions with similar failure patterns" |

Both namespaces live in the same table, filtered by `namespace` column.

---

## Query API

`pgvector_service.query_similar()` in `app/services/pgvector_service.py`:

```python
results = await pgvector_service.query_similar(
    query_text="API rate limit retrieval failure",
    namespace="failure_patterns",
    top_k=10,
    filters={"session_id": {"$ne": current_session_id}},  # Pinecone-style filter syntax
    org_id=request_org_id,
)
```

Returns:
```python
[
    {
        "id": "sess-001:pattern",
        "score": 0.87,          # cosine similarity (1 = identical)
        "metadata": { ... }
    },
    ...
]
```

---

## Cosine Similarity vs Dot Product

Aethen uses cosine similarity (`<=>` operator in pgvector):

```
score = 1 - (embedding <=> query_embedding)
```

Cosine similarity is length-normalised — it measures angle between vectors, not magnitude. This is the correct metric for comparing text embeddings from OpenAI models.

---

## Tenant Isolation

Every query includes an `org_id` filter:

```sql
WHERE namespace = $2
  AND session_id <> $3
  AND (org_id = $4 OR org_id IS NULL)
```

`org_id IS NULL` allows shared/demo sessions to be visible to all orgs. Org-specific sessions are never visible outside their org.

---

## Performance

At current dataset sizes (< 100K vectors):
- Exact cosine search: < 5 ms
- HNSW approximate: > 5 ms (due to index overhead)

HNSW is disabled via `SET LOCAL enable_indexscan = off`. Re-enable when the dataset grows past ~100K rows.

---

## Vector Count Verification

```bash
cd backend
poetry run python scripts/verify_pgvector.py
```

Or via the API:
```bash
curl https://aethen-ai-backend.onrender.com/api/stats \
  -H "Authorization: Bearer <jwt>"
# Returns vector_count in the response
```
