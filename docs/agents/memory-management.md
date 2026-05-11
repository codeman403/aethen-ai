# Memory Management

---

## Types of Memory in Aethen

| Memory type | Storage | Lifetime | Used for |
|---|---|---|---|
| **Session traces** | PostgreSQL `sessions` table | Permanent | Source of truth for all session data |
| **Vector embeddings** | pgvector `session_vectors` table | Permanent | Similarity search for evidence retrieval |
| **Graph relationships** | Neo4j | Permanent | Cross-session blind spot detection |
| **Chat conversation** | PostgreSQL `chat_messages` table | Per-conversation | Chat Debug context continuity |
| **LLM credential context** | `contextvars.ContextVar` | Per-request coroutine | Org-scoped LLM credentials |
| **JWT token cache** | In-memory dict | 60 s TTL | Auth verification caching |
| **Model selection cache** | In-memory dict | Process lifetime | Active LLM model per role |

---

## Conversational Memory (Chat Debug)

`/api/chat` maintains a conversation history per user+session pair. Each turn appends to `chat_messages`:

```json
{
  "chat_session_id": "...",
  "role": "assistant",
  "content": "The root cause is a doc ID mismatch...",
  "created_at": "2026-05-10T12:00:00Z"
}
```

The history is retrieved at the start of each request and prepended to the LLM context. This gives the Chat Debug interface conversational continuity ("What about the retrieval scores for that specific query?").

---

## Evidence Memory (Cross-Session)

pgvector and Neo4j serve as the "long-term memory" of Aethen:
- Every ingested failure is embedded and stored — Aethen learns from every session
- When analysing a new failure, past similar failures are retrieved as evidence context
- This cross-session context helps the LLM identify patterns ("This is the 5th tool timeout on `search_kb` this week")

---

## Per-Request Context (`contextvars`)

`_org_llm_ctx` in `app/agents/llm.py` is a `ContextVar[dict]` that holds LLM credentials for the current async coroutine:

```python
# Route handler
set_org_llm_context({"openai": {"api_key": org_key, "base_url": org_url}})
# ... pipeline runs using org credentials ...
# ContextVar clears when coroutine exits — no manual cleanup
```

This is the approved pattern for per-org LLM credential injection. Never pass credentials through function arguments — `ContextVar` ensures coroutine-level isolation.

---

## Memory Limitations

- **No persistent agent working memory** — each analysis is stateless (no memory of previous analyses of the same session)
- **Chat history is per-session, not cross-session** — the chat interface knows about the current session but not about related sessions
- **pgvector doesn't update incrementally** — if a session's trace data changes, `POST /api/ingest` must be called again to refresh embeddings
