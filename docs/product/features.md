# Features

---

## Core Diagnostic Modules

### Memory Debug

Detects retrieval failures — cases where the vector database returned the wrong documents for a query.

**Signals analysed:**
- `expected_doc_ids` vs `actual_doc_ids` mismatch in `RetrievalEvent` (definitive signal)
- Relevance scores below 0.5 threshold (secondary signal)
- Failure summary keywords (stale, mismatch, wrong, outdated)

**Output:** Specific document IDs that should have been retrieved, the mismatch percentage, and recommendations for re-indexing or updating embeddings.

### Tool Misfire

Detects tool call failures — cases where a tool invocation failed structurally.

**Signals analysed:**
- `status = failed` or `status = timeout`
- Error message content (PermissionError, ConnectionError, ValueError, etc.)
- Latency > 5 000 ms (timeout candidate even if status=success)
- Cascading failures (multiple tools failed after the first)

**Output:** Specific failed tool names, error messages, whether failures cascaded, and recommendations for fixing tool configuration or error handling.

### Hallucination RCA

Detects cases where the LLM added specific facts, numbers, or claims that are not present in retrieved documents.

**Signals analysed:**
- `hallucination_flag = True` on `LLMCall` objects
- LLM response contains specific claims absent from `doc_content`
- Hedge-then-assert pattern ("I'm not sure, but typically X...")
- Relevant documents retrieved but LLM went beyond them

**Output:** Specific claims identified as unsupported by retrieved context, the relevant source documents that should have grounded the answer, and recommendations for prompt grounding or retrieval improvement.

### Blind Spot Detector

Detects cases where the knowledge base has no content for the query topic — the agent lacks the information entirely.

**Signals analysed:**
- `chunks_returned = 0` (zero retrieval results)
- Retrieved documents from categorically different functional domain
- LLM response saying "I couldn't find..." without adding specific claims
- Cross-session graph patterns via Neo4j (recurring blind spots)

**Output:** The knowledge gap topic, similar sessions with the same blind spot, and recommendations for KB expansion.

---

## AI Orchestration

### Parallel LangGraph Pipeline

All three initial pipeline steps run simultaneously from a single `parallel_start` node:
- Intent classification (GPT-4o-mini)
- Vector evidence retrieval (pgvector)
- Graph traversal (Neo4j)

Saves ~2 s vs sequential execution.

### Fast Analysis Mode

`fast_analyze` merges the separate per-module analysis + synthesis steps into a single Claude Haiku 4.5 call. One LLM call handles all four failure types, reducing latency from ~25 s (legacy) to ~9–12 s.

### Deterministic Confidence Scoring

`compute_confidence()` calculates a 0.05–0.95 confidence score from observable trace evidence:
- Strongest evidence (doc ID full miss = 0.58, explicit tool failure = 0.45)
- Secondary signals (error messages, cascade failures, low retrieval scores)
- LLM adjustment (±0.075 only)

Never reports false certainty. Never reports LLM self-assessed confidence as the primary score.

---

## Observability Integration

### Langfuse Integration

- Pull live traces from any Langfuse project via API
- Push per-session and aggregate eval scores back to Langfuse
- Automatic daily pull via Vercel cron (00:00 UTC)

### LangSmith Integration

- Import traces from LangSmith projects
- Automatic daily pull via Vercel cron (00:00 UTC)

---

## Dashboard

- **Overview** — failure type distribution, recent sessions, key metrics
- **Trace Explorer** — searchable session list with one-click analysis
- **Chat Debug** — conversational interface for deep-diving a specific session
- **Module views** — Memory Debug, Tool Misfire, Hallucination RCA, Blind Spots
- **Timeline** — chronological session view
- **Data Quality** — QC report for ingested sessions

---

## Security and Multi-Tenancy

- **Org-scoped data** — each organisation sees only their own sessions and vectors
- **Per-org LLM keys** — use your own API keys (stored encrypted with Fernet)
- **PII redaction** — scrubadub automatically redacts PII at ingest
- **Admin panel** — cross-org visibility for designated admin users

---

## Developer Tools

- **Demo Agent** — generate real failure traces from the browser without scripts
- **Python SDK** — `AethenClient` for submitting traces programmatically
- **MCP server** — expose Aethen diagnostics as tools to MCP-compatible AI agents
- **REST API** — 23 endpoints documented at `/docs`
- **Eval pipeline** — regression-tested with golden dataset; gates on accuracy and judge score
