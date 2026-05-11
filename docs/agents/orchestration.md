# Orchestration

---

## Graph Compilation

LangGraph compiles the `StateGraph` at module import time:

```python
# backend/app/agents/graph.py — loaded once at startup

analysis_graph = build_optimized_analysis_graph()      # primary
fast_analysis_graph = build_fast_analysis_graph()       # demo agent
_legacy_analysis_graph = build_analysis_graph()         # rollback
```

Each compiled graph is a singleton invoked with `.ainvoke()` or `.astream_events()`.

---

## Invocation Pattern

All route handlers follow this pattern:

```python
# backend/app/api/chat.py (simplified)
async def analyze_session(request, session_id):
    session = await postgres_service.get_session(session_id, org_id)
    set_org_llm_context(await llm_key_service.get_org_config(org_id))

    result = await analysis_graph.ainvoke(
        {"session": session, "query": request.query, "skip_graph": False}
    )

    report = result.get("report")
    return {"data": report}
```

---

## Error Handling

Each analysis node handles its own errors:
- LLM call failures fall back to the next LLM in the list (Anthropic → OpenAI)
- pgvector failures return empty `vector_results` (pipeline continues without evidence)
- Neo4j failures return empty `graph_results` (pipeline continues)
- Rerank failures return original vector order
- Parsing errors in `fast_analyze` return a fallback report with `raw_analysis` populated

The pipeline never crashes hard — it always returns an `AnalysisReport`, even if it's a minimal one.

---

## State Merging

LangGraph merges partial state updates from parallel nodes automatically. When `classify_intent`, `vector_retrieve`, and `graph_traverse` all complete (in any order), `merge_retrieval` fires because all three have written their respective keys.

The `total=False` on `AgentState(TypedDict, total=False)` is what enables partial updates — nodes only need to write the keys they own.

---

## Routing Logic

```python
def _route_after_parallel(state: AgentState) -> str:
    failure_type = state.get("failure_type", FailureType.UNKNOWN)
    if failure_type == FailureType.UNKNOWN:
        return "early_exit"
    return "fast_analyze"
```

This is the only conditional edge in `analysis_graph`. All other transitions are unconditional.

---

## Rollback

To roll back to the legacy pipeline (separate analysis modules + synthesize):

```python
# backend/app/agents/graph.py — change ONE line:
analysis_graph = _legacy_analysis_graph  # was: build_optimized_analysis_graph()
```

The legacy graph is always compiled (as `_legacy_analysis_graph`) so rollback requires zero changes to any other file.
