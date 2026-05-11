# API Schemas

All models use Pydantic v2. Full definitions in `backend/app/models/`.

---

## Core Data Models

### `Session`

```python
class Session(BaseModel):
    session_id: str             # Unique session identifier
    agent_id: str               # Identifier of the agent that ran this session
    timestamp: datetime         # Session start time (UTC)
    outcome: str                # "success" | "failure"
    failure_type: FailureType | None    # Classified failure type (null for success)
    failure_summary: str | None         # Human-readable failure description
    llm_calls: list[LLMCall]            # All LLM invocations
    tool_calls: list[ToolCall]          # All tool invocations
    retrieval_events: list[RetrievalEvent]  # All vector DB retrievals
    metadata: dict              # Additional metadata (includes _ground_truth for eval)
    trace_source: str           # "langfuse" | "langsmith" | "demo" | "synthetic"
```

### `LLMCall`

```python
class LLMCall(BaseModel):
    call_id: str
    model: str                  # e.g., "gpt-4o-mini", "claude-haiku-4-5-20251001"
    prompt: str
    response: str
    tokens_in: int
    tokens_out: int
    latency_ms: float
    hallucination_flag: bool    # True if this response was flagged as hallucinated
    source_documents: list[str] # Doc IDs used for grounding
    timestamp: datetime
```

### `ToolCall`

```python
class ToolCall(BaseModel):
    call_id: str
    tool_name: str
    parameters: dict
    result: str | None
    error: str | None
    status: ToolCallStatus      # "success" | "failed" | "timeout"
    latency_ms: float
    timestamp: datetime
```

### `RetrievalEvent`

```python
class RetrievalEvent(BaseModel):
    event_id: str
    query: str
    namespace: str              # Vector DB namespace queried
    chunks_returned: int
    relevance_scores: list[float]
    metadata_filters: dict
    expected_doc_ids: list[str] # Doc IDs that should have been retrieved (ground truth)
    actual_doc_ids: list[str]   # Doc IDs actually retrieved
    doc_content: list[str]      # Text content of retrieved documents
    timestamp: datetime
```

### `FailureType` (StrEnum)

```python
class FailureType(StrEnum):
    MEMORY = "memory"
    TOOL_MISFIRE = "tool_misfire"
    HALLUCINATION = "hallucination"
    BLIND_SPOT = "blind_spot"
    UNKNOWN = "unknown"
```

---

## Analysis Output Models

### `AnalysisReport`

```python
class AnalysisReport(BaseModel):
    session_id: str
    failure_type: FailureType
    summary: str                # 2-3 sentence executive summary
    findings: list[Finding]     # 2-4 prioritised findings
    root_cause: str             # One sentence: component + evidence + effect
    confidence: float           # 0.05-0.95 (deterministic)
    raw_analysis: str           # Full LLM response text
```

### `Finding`

```python
class Finding(BaseModel):
    title: str                  # Short finding headline
    severity: str               # "low" | "medium" | "high" | "critical"
    description: str            # Detailed explanation with specific evidence
    evidence: list[str]         # Quoted evidence from the trace
    recommendation: str         # Specific actionable fix
```

---

## API Request/Response

### Ingest Request

```python
class IngestRequest(BaseModel):
    sessions: list[Session]     # min_length=1
```

### API Response Envelope

```python
{
    "data": Any | None,
    "error": str | None,
    "metadata": dict | None
}
```

401 responses:
```json
{"error": "Invalid or expired token", "data": null, "metadata": null}
```
