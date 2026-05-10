# LangGraph Patterns — Aethen-AI

> Recurring state machine and node patterns extracted from the analysis pipeline.

---

## 1. State Schema (TypedDict with `total=False`)

```python
from typing import Any
from typing_extensions import TypedDict

class AgentState(TypedDict, total=False):
    """total=False allows partial updates — nodes only write keys they own."""
    session: Session       # Input
    failure_type: str      # Set by classify node
    vector_results: list   # Set by vector_retrieve node
    graph_results: list    # Set by graph_traverse node
    reranked_evidence: list# Set by rerank node
    analysis: str          # Set by analysis module (legacy pipeline)
    report: dict           # Set by fast_analyze or synthesize node
    early_exit: bool       # True = no failure pattern → skip analysis
    skip_graph: bool       # True = skip graph_traverse (saves ~3s)
```

**Why `total=False`**: LangGraph nodes return partial dicts. With `total=True` (default), every node must return every key. This pattern keeps nodes focused on their single responsibility.

**Used in**: `app/agents/state.py`

---

## 2. Conditional Routing After Classification

```python
def route_to_module(state: AgentState) -> str:
    """Route to the correct analysis module based on failure type."""
    ft = state.get("failure_type", "unknown")
    return {
        "memory": "memory_debug",
        "tool_misfire": "tool_debug",
        "hallucination": "hallucination_rca",
        "blind_spot": "blind_spot",
    }.get(ft, "synthesize")  # fallback: skip to synthesis

workflow.add_conditional_edges("classify_intent", route_to_module)
```

**Pattern**: Dict-based routing is cleaner than if/elif chains. Always include a fallback.

**Used in**: `app/agents/graph.py`

---

## 3. Parallel Entry Node (Fan-out to Classify + Retrieve simultaneously)

```python
# Pass-through entry node fans all three out in parallel
graph.add_node("parallel_start", lambda s: {})
graph.set_entry_point("parallel_start")

graph.add_edge("parallel_start", "classify_intent")
graph.add_edge("parallel_start", "vector_retrieve")
graph.add_edge("parallel_start", "graph_traverse")

# All three converge at merge node
graph.add_edge("classify_intent", "merge_retrieval")
graph.add_edge("vector_retrieve",  "merge_retrieval")
graph.add_edge("graph_traverse",   "merge_retrieval")

# After merge: route based on classify result
graph.add_conditional_edges("merge_retrieval", _route_after_parallel, {...})
```

**Pattern**: `parallel_start` is a no-op pass-through. It lets classify and retrieval
start simultaneously — classify doesn't need retrieved evidence, so there's no
dependency. Saves ~2s vs sequential classify → then retrieve.

**Trade-off**: Early-exit (UNKNOWN sessions) now also runs retrieval before bailing.
For the demo fast path, keep classify-first so early exit avoids wasted retrieval.

**Used in**: `app/agents/graph.py` (`build_optimized_analysis_graph`)

---

## 4. Skippable Node via State Flag

```python
async def graph_traverse(state: AgentState) -> dict:
    if state.get("skip_graph"):
        return {"graph_results": []}   # return immediately, ~0ms
    # ... expensive Neo4j traversal
```

**Pattern**: Pass a boolean flag in the initial state to short-circuit expensive nodes.
Caller decides at invocation time:

```python
result = await analysis_graph.ainvoke({
    "session": session,
    "skip_graph": True,   # skip when org has no cross-session Neo4j data
})
```

**Used in**: `app/agents/nodes/retrieve.py`

---

## 5. Combined Analysis+Synthesis in One LLM Call

```python
async def fast_analyze(state: AgentState) -> dict:
    """Single LLM call replaces separate analysis module + synthesize.
    
    Saves ~8-12s vs two sequential round-trips. Eval confirmed: 85.56% judge
    score (up from 83% on legacy pipeline — tighter prompt = better output).
    """
    context = _build_context(state)  # session + vector evidence
    response = await llm.ainvoke([
        {"role": "system", "content": FAST_ANALYZE_PROMPT},
        {"role": "user",   "content": context},
    ])
    parsed = json.loads(_extract_content(response))
    return {"report": AnalysisReport(**parsed).model_dump(mode="json")}
```

**Pattern**: When two sequential LLM calls produce one output, merge them into one
call with a combined prompt. Key requirements:
1. Prompt must cover all failure types (memory, tool_misfire, hallucination, blind_spot)
2. Output must match the exact schema the downstream consumer expects
3. Validate evals before promoting — use the candidate graph, run evals, compare scores

**Used in**: `app/agents/nodes/fast_analyze.py`, `app/agents/graph.py`

---

## 6. Ensure Session Helper (Dict ↔ Pydantic)

```python
def ensure_session(session_or_dict) -> Session:
    """LangGraph serializes Pydantic models to dicts between nodes."""
    if isinstance(session_or_dict, dict):
        return Session(**session_or_dict)
    return session_or_dict
```

**Gotcha**: LangGraph's state passing converts Pydantic models to plain dicts. Every node that reads `state["session"]` must call `ensure_session()` first.

**Used in**: `app/agents/state.py`, called by all analysis nodes

---

## 7. Graceful Synthesis Fallback

```python
try:
    report = AnalysisReport(**json.loads(llm_response))
except Exception:
    report = AnalysisReport(
        session_id=session.session_id,
        failure_type=state.get("failure_type", "unknown"),
        summary="Analysis completed with partial results.",
        findings=[],
        confidence=0.0,
    )
```

**Pattern**: LLMs produce unpredictable JSON. Always wrap synthesis parsing in try/except with a valid fallback report.

**Used in**: `app/agents/nodes/synthesize.py`

---

## 8. LLM Factory with Per-Org Credential Override

```python
import contextvars

# Set once per request — propagates into all downstream coroutines including LangGraph nodes
_org_llm_ctx: contextvars.ContextVar[dict] = contextvars.ContextVar("org_llm", default={})

def set_org_llm_context(config: dict) -> None:
    _org_llm_ctx.set(config)

def _make_openai(model_id: str, temperature: float, max_tokens: int):
    ctx = _org_llm_ctx.get()
    org_cfg = ctx.get("openai", {})
    api_key  = org_cfg.get("api_key")  or settings.openai_api_key
    base_url = org_cfg.get("base_url") or settings.openai_base_url or None
    return ChatOpenAI(model=model_id, api_key=api_key, base_url=base_url, ...)
```

**Pattern**: Use `contextvars.ContextVar` to thread per-org credentials through LangGraph
without changing any node signatures. Coroutine-safe — each async task gets its own
copy. Route handler calls `set_org_llm_context(config)` before `ainvoke()`.

**Security**: Keys decrypted only in process memory, never logged, garbage-collected
when the coroutine ends. 60s cache in `llm_key_service.py` avoids repeated DB lookups.

**Used in**: `app/agents/llm.py`, `app/services/llm_key_service.py`
