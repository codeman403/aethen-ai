# Integration Tests

---

## Overview

Integration tests in `backend/tests/` verify that multiple components work together correctly. Most use mocking to avoid real network calls in CI.

---

## Key Integration Test Files

### `test_integration.py`

End-to-end pipeline test: ingest a session → classify → retrieve → analyze.

Tests the full `analysis_graph.ainvoke()` flow with mocked LLM responses to verify:
- Session ingestion populates Postgres correctly
- Classification returns the correct failure type
- Evidence retrieval returns relevant results
- Analysis produces a valid `AnalysisReport`

### `test_ingest.py`

Integration test for the ingest pipeline:
- PII redaction applied before storage
- Injection stripping applied to `failure_summary`
- Schema validation rejects malformed sessions
- Successful ingest returns correct `sessions_ingested` count

### `test_chat.py`

Integration test for the chat analysis flow:
- `POST /api/chat` with a session ID
- Verifies the response contains `failure_type`, `findings`, `root_cause`, `confidence`
- Verifies confidence is in [0.05, 0.95]
- Verifies findings have required fields (title, severity, description)

### `test_eval_pipeline.py`

Integration test for the evaluation pipeline:
- `run_eval(mode="fast")` completes without error
- Returns `ClassificationMetrics` with accuracy in [0, 1]
- Regression gates are computed correctly

### `test_langfuse_adapter_extended.py`

Integration test for the Langfuse trace adapter:
- Langfuse trace format → `Session` model conversion
- Handles missing optional fields gracefully
- Correct `trace_source="langfuse"` on output

---

## Test Fixtures

`tests/conftest.py` provides shared fixtures:

```python
@pytest.fixture
def sample_memory_session():
    return Session(
        session_id="test-memory-001",
        agent_id="test-agent",
        outcome="failure",
        failure_type=FailureType.MEMORY,
        retrieval_events=[
            RetrievalEvent(
                event_id="ret-1",
                query="enterprise pricing",
                expected_doc_ids=["pricing-enterprise-v2"],
                actual_doc_ids=["pricing-standard-v1"],
                relevance_scores=[0.72, 0.65, 0.58],
                chunks_returned=3,
            )
        ],
    )
```

---

## Running Integration Tests

```bash
# All integration tests
poetry run pytest tests/test_integration.py tests/test_ingest.py tests/test_chat.py -v

# With real credentials (requires DATABASE_URL, etc.)
DATABASE_URL=... poetry run pytest tests/test_integration.py
```

Tests that require live services are conditionally skipped when `DATABASE_URL` points to the placeholder `postgresql://test:test@localhost:5432/test`.
