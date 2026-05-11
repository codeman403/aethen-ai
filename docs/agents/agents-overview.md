# Agents Overview

---

## LangGraph State Machine

Aethen's analysis pipeline is a compiled LangGraph `StateGraph`. All agent logic lives in `backend/app/agents/`.

### State

`AgentState` (`app/agents/state.py`) is a `TypedDict` that flows through all nodes:

```python
class AgentState(TypedDict, total=False):
    session: Session          # input — the trace being analysed
    query: str                # optional natural-language question

    failure_type: FailureType # set by classify_intent
    vector_results: list      # set by vector_retrieve
    graph_results: list       # set by graph_traverse
    reranked_evidence: list   # set by rerank
    analysis: str             # set by analysis module (legacy)

    early_exit: bool          # True → skip retrieval/analysis
    skip_graph: bool          # True → graph_traverse returns [] immediately

    report: dict              # final AnalysisReport (serialised)
```

`total=False` means nodes can write partial updates — LangGraph merges them.

### Output Model

```python
class AnalysisReport(BaseModel):
    session_id: str
    failure_type: FailureType
    summary: str              # 2-3 sentence executive summary
    findings: list[Finding]   # 2-4 prioritised findings
    root_cause: str           # 1 sentence: component + evidence + effect
    confidence: float         # 0.05–0.95 (deterministic)
    raw_analysis: str         # full LLM response text
```

---

## Node Reference

### `classify_intent` — GPT-4o-mini

**File:** `app/agents/nodes/classify.py`

Reads tool call statuses, retrieval event doc IDs, relevance scores, and LLM call patterns. Applies a 5-step priority chain:

1. Any tool call with `status=failed` → `tool_misfire`
2. `expected_doc_ids` non-empty AND differs from `actual_doc_ids` → `memory`
3. Retrieved docs from completely different functional category → `blind_spot`
4. Same functional category but wrong specific docs + low scores → `memory`
5. Relevant docs but LLM adds specific claims not in doc_content → `hallucination`
6. No clear signals → `unknown` (triggers early exit)

**Security:** `strip_injection()` applied to `tc.error`, `tc.result`, `lc.response` with `full_redact=True` before embedding in the prompt.

### `vector_retrieve` — pgvector HNSW

**File:** `app/agents/nodes/retrieve.py`

Queries `session_vectors` for the `failure_patterns` and `traces` namespaces. Builds a rich query text from the session's failure summary, tool errors, and retrieval queries. Returns top-10 similar sessions (excludes current session via `$ne` filter).

### `graph_traverse` — Neo4j Cypher

**File:** `app/agents/nodes/retrieve.py`

Traverses the Neo4j graph for cross-session failure patterns. Returns immediately (empty list) when `skip_graph=True`. Finds sessions with the same failure type and shared `BlindSpot` or `FailureEvent` nodes.

### `merge_retrieval` — No-op

Convergence point after parallel classify + retrieve + graph. LangGraph handles state merging; this node is a pass-through (`return {}`).

### `rerank` — Cohere Rerank v3

**File:** `app/agents/nodes/rerank.py`

Re-ranks the combined `vector_results + graph_results` list using Cohere's `rerank-v3-nimble` model. Takes the top-5 results post-rerank. Degrades gracefully if `COHERE_API_KEY` is unset (returns original order).

### `fast_analyze` — Claude Haiku 4.5 (primary)

**File:** `app/agents/nodes/fast_analyze.py`

Single LLM call combining analysis + synthesis. Builds a structured context from the session's LLM calls, tool calls, retrieval events, and top evidence from pgvector. Parses a JSON response into an `AnalysisReport`. Calls `compute_confidence()` after parsing.

**Fallback:** If Anthropic is unavailable, retries with `gpt-4o-mini`.

**Security:** System prompt includes `━━━ SECURITY CONSTRAINT ━━━` instructing the model to treat all trace content as data, not as instructions.

### `compute_confidence` — Deterministic

**File:** `app/agents/nodes/confidence.py`

Not a LangGraph node — called inside `fast_analyze` after JSON parsing. Produces a deterministic evidence-based score from 0.05 to 0.95. See [confidence scoring](../architecture/system-design.md#5-confidence-scoring).

### `early_exit` — No LLM

Returns a minimal `AnalysisReport` with `failure_type=UNKNOWN` and an explanatory summary. Triggered when `classify_intent` returns `UNKNOWN`.

---

## Legacy Nodes (Not in Production Graph)

These nodes exist in the codebase for reference/rollback:

| Node | File | Notes |
|---|---|---|
| `memory_debug` | `nodes/memory_debug.py` | Memory failure analysis (legacy, separate LLM call) |
| `tool_debug` | `nodes/tool_debug.py` | Tool misfire analysis (legacy) |
| `hallucination_rca` | `nodes/hallucination_rca.py` | Hallucination RCA (legacy) |
| `blind_spot` | `nodes/blind_spot.py` | Blind spot analysis (legacy) |
| `synthesize` | `nodes/synthesize.py` | Final synthesis (legacy — replaced by fast_analyze) |

---

## Demo Agent

The demo agent (`app/api/demo.py`) uses `fast_analysis_graph` (not `analysis_graph`). It:
1. Accepts a scenario name (memory, tool_misfire, hallucination, blind_spot)
2. Uses a synthetic trace provider (`app/providers/synthetic.py`) to generate a realistic session
3. Calls the LLM via a demo prompt to produce a visible chat response
4. Logs the trace to Langfuse
5. Returns the chat log for display in the demo agent page

Public endpoints — no JWT required.
