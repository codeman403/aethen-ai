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
    vector_results: list   # Set by retrieve node
    report: dict           # Set by synthesize node
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

## 3. Parallel Node Execution (Retrieve + Graph)

```python
# Fan-out: run vector search and graph traversal in parallel
workflow.add_edge("classify_intent", "vector_retrieve")
workflow.add_edge("classify_intent", "graph_traverse")

# Fan-in: both feed into rerank
workflow.add_edge("vector_retrieve", "rerank")
workflow.add_edge("graph_traverse", "rerank")
```

**Pattern**: LangGraph supports parallel edges natively. Use for independent data fetching.

**Used in**: `app/agents/graph.py`

---

## 4. Ensure Session Helper (Dict ↔ Pydantic)

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

## 5. Graceful Synthesis Fallback

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

## 6. LLM Factory with Proxy Support

```python
def get_openai_llm(model: str = "gpt-4o-mini", **kwargs) -> ChatOpenAI:
    return ChatOpenAI(
        model=model,
        base_url=settings.openai_base_url or None,
        api_key=settings.openai_api_key,
        default_headers={"x-session-id": os.getenv("SESSION_ID", "")},
        **kwargs,
    )
```

**Pattern**: Centralize LLM instantiation. Never create ChatOpenAI/ChatAnthropic directly in nodes — always use the factory. This keeps proxy config, headers, and model names consistent.

**Used in**: `app/agents/llm.py`
