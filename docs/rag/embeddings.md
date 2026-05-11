# Embeddings

---

## Model

**OpenAI `text-embedding-3-small`**

| Property | Value |
|---|---|
| Dimensions | 1 536 |
| Max input tokens | 8 191 |
| Recommended use | Semantic similarity, retrieval |

---

## Embedding Service

`app/services/embedding_service.py` wraps the OpenAI embeddings API:

```python
# Single text
embedding = await embedding_service.embed_text("API rate limit failure...")

# Batch (recommended for ingestion)
embeddings = await embedding_service.embed_batch([text1, text2, ...])
```

Batching uses a single OpenAI API call for up to 2 048 texts — significantly more efficient than per-text calls during ingestion.

---

## What Gets Embedded

### LLM calls
```
"LLM call: {prompt[:500]} -> {response[:500]}"
```
Captures the prompt-response semantic pair. Truncated to 500 chars each to stay within token limits while preserving the most semantically rich prefix.

### Tool calls
```
"Tool call: {tool_name}({parameters}) -> {status} | error: {error[:150]}"
```
Captures tool identity + parameter shape + failure signature.

### Retrieval events
```
"Retrieval: {query[:500]} -> {chunks_returned} chunks avg_score={avg:.2f}"
```
Captures the retrieval query and quality signal.

### Failure patterns (session-level)
A rich summary combining all the above for a session-level "what kind of failure was this" embedding. Used for cross-session similarity in the `failure_patterns` namespace.

---

## Quality Signals Derived from Embeddings

The confidence scorer uses retrieval scores (cosine similarity of the agent's retrieved docs to the query) as evidence signals:

| Score range | Signal | Weight |
|---|---|---|
| < 0.30 | `very_low_retrieval_scores` | 0.30 (memory), 0.30 (blind_spot) |
| 0.30–0.50 | `low_retrieval_scores` | 0.20 (memory) |
| ≥ 0.50 | `relevant_docs_retrieved` | 0.15 (hallucination bonus) |

These scores come from the **agent being diagnosed** — not from Aethen's own retrieval. Aethen reads the `relevance_scores` field in the session's `RetrievalEvent` objects.

---

## Embedding Dimension Choice

1 536 dimensions (OpenAI `text-embedding-3-small`) is a deliberate choice:
- High enough for accurate semantic differentiation of trace event types
- Small enough to store efficiently in pgvector (6 KB per vector)
- Matches the pgvector HNSW index configuration

Upgrading to `text-embedding-3-large` (3 072 dimensions) would require schema migration (`ALTER TABLE session_vectors ALTER COLUMN embedding TYPE vector(3072)`) and reindexing.
