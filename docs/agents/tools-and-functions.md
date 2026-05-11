# Tools and Functions

---

## LangGraph Nodes (Agent Tools)

In LangGraph, each node is equivalent to an "agent tool" — an async function that reads from `AgentState` and returns a partial state update.

| Node | Function | Input keys | Output keys |
|---|---|---|---|
| `parallel_start` | `lambda s: {}` | — | — |
| `classify_intent` | `classify_intent(state)` | `session` | `failure_type` |
| `vector_retrieve` | `vector_retrieve(state)` | `session` | `vector_results` |
| `graph_traverse` | `graph_traverse(state)` | `session`, `skip_graph` | `graph_results` |
| `merge_retrieval` | `_merge_retrieval(state)` | — | — |
| `rerank` | `rerank(state)` | `vector_results`, `graph_results`, `session` | `reranked_evidence` |
| `fast_analyze` | `fast_analyze(state)` | `session`, `failure_type`, `vector_results` | `report` |
| `early_exit` | `_early_exit_node(state)` | `session` | `report`, `early_exit=True` |

---

## MCP Tools (`app/mcp/server.py`)

The MCP server exposes Aethen's diagnostic capabilities to MCP-compatible AI agents:

- `analyze_session(session_id)` — runs the full analysis pipeline, returns AnalysisReport
- `ingest_session(session_json)` — ingest a trace session
- `get_session_report(session_id)` — fetch a previously computed report
- `list_sessions(failure_type, limit)` — list sessions by failure type

MCP server: `poetry run python scripts/run_mcp.py`

---

## SDK Methods (`sdk/aethen_sdk/client.py`)

`AethenClient` exposes both async and sync methods:

```python
# Async
report = await client.analyze_langfuse_trace(trace_id, source="my-agent")
report = await client.analyze_langfuse_trace_direct(trace_id, public_key=PK, secret_key=SK)
result = await client.ingest_session(session_dict)

# Sync equivalents
report = client.analyze_langfuse_trace_sync(trace_id, source="my-agent")
```

Retry logic: 3 retries on 500/502/503/504 HTTP responses with exponential backoff.

---

## Internal Service Functions

| Service | Key Functions |
|---|---|
| `pgvector_service` | `upsert_session()`, `query_similar()`, `count_vectors()` |
| `neo4j_service` | `upsert_session()`, `find_similar_sessions()`, `find_blind_spots()` |
| `embedding_service` | `embed_text()`, `embed_batch()` |
| `postgres_service` | `upsert_session()`, `get_session()`, `list_sessions()`, `get_setting()` |
| `llm_key_service` | `encrypt_key()`, `decrypt_key()`, `get_org_keys()` |
