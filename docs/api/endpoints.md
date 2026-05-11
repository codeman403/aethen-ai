# API Endpoints

Base URL: `https://aethen-ai-backend.onrender.com`

All protected endpoints require: `Authorization: Bearer <supabase-jwt>`

All responses follow the envelope: `{ "data": ..., "error": ..., "metadata": ... }`

---

## Health

### `GET /api/health`
**Auth:** None

Returns service status.

```json
{
  "data": {
    "status": "ok",
    "services": { "postgres": "connected", "neo4j": "connected", "embedding": "ready" }
  }
}
```

---

## Trace Ingestion

### `POST /api/ingest`
**Auth:** JWT

Ingest one or more AI agent execution traces.

**Request:**
```json
{
  "sessions": [
    {
      "session_id": "sess-001",
      "agent_id": "my-agent",
      "outcome": "failure",
      "failure_type": "memory",
      "failure_summary": "Wrong documents retrieved for API rate limit query",
      "llm_calls": [...],
      "tool_calls": [...],
      "retrieval_events": [...]
    }
  ]
}
```

**Response:**
```json
{
  "data": {
    "sessions_ingested": 1,
    "events_processed": 12,
    "errors": []
  }
}
```

**Processing:** PII redaction → schema validation → Postgres upsert → pgvector embedding → Neo4j graph seeding.

---

## Analysis

### `POST /api/chat`
**Auth:** JWT

Run the full analysis pipeline on a session. Returns a structured `AnalysisReport`.

**Request:**
```json
{
  "session_id": "sess-001",
  "query": "Why did the retrieval fail?"
}
```

**Response:**
```json
{
  "data": {
    "session_id": "sess-001",
    "failure_type": "memory",
    "summary": "Retrieval system fetched billing docs instead of API docs...",
    "root_cause": "Embedding similarity peaked at 0.38 causing retrieval to surface billing docs...",
    "confidence": 0.72,
    "findings": [
      {
        "title": "Doc ID mismatch detected",
        "severity": "high",
        "description": "Expected docs [api-rate-limits-v2] but retrieved [billing-policy-v1]",
        "evidence": ["expected_doc_ids: ['api-rate-limits-v2']", "actual_doc_ids: ['billing-policy-v1']"],
        "recommendation": "Re-index the API rate limit documentation with updated embeddings"
      }
    ]
  }
}
```

### `POST /api/analyze-raw`
**Auth:** JWT

Analyze a raw session JSON without first ingesting it.

---

## Sessions

### `GET /api/sessions`
**Auth:** JWT  
**Query params:** `?failure_type=memory&limit=20&offset=0`

Returns paginated list of ingested sessions.

### `GET /api/sessions/{session_id}`
**Auth:** JWT

Returns a single session with full trace data.

---

## Stats

### `GET /api/stats`
**Auth:** JWT

Returns aggregated dashboard metrics: session counts by failure type, recent sessions, failure trends.

---

## Observability Sources

### `POST /api/langfuse/pull`
**Auth:** JWT

Pull live traces from Langfuse. Requires Langfuse credentials stored in Settings → Integrations, or passed directly:

```json
{ "source": "my-agent" }
```

### `GET /api/langfuse/health`
**Auth:** JWT

Test Langfuse connection health.

### `POST /api/langsmith/pull`
**Auth:** JWT

Pull traces from LangSmith.

---

## Demo

### `POST /api/demo/run`
**Auth:** None (public)

Run a demo scenario. Generates a synthetic trace, calls LLM, logs to Langfuse.

```json
{ "scenario": "memory" }
```

Scenario values: `"memory"`, `"tool_misfire"`, `"hallucination"`, `"blind_spot"`

### `GET /api/demo/scenarios`
**Auth:** None (public)

Returns list of available demo scenarios with descriptions.

### `POST /api/demo/analyze-direct`
**Auth:** None (public)

Analyze a session directly using `fast_analysis_graph` (skips Neo4j).

---

## Evaluation

### `POST /api/eval`
**Auth:** JWT

Trigger the evaluation pipeline.

```json
{ "mode": "fast", "limit": null, "push_to_langfuse": true }
```

Returns `EvalReport` with classification accuracy, retrieval metrics, synthesis metrics, and regression gate results.

---

## Data Quality

### `POST /api/qc`
**Auth:** JWT

Run quality checks on a list of session IDs.

```json
{ "session_ids": ["sess-001", "sess-002"] }
```

---

## Configuration

### `GET /POST /api/settings/models`
**Auth:** JWT

Get or update the active LLM models for analysis, synthesis, and demo roles.

### `GET /POST /api/llm-keys`
**Auth:** JWT

Manage per-org LLM API keys (encrypted at rest with Fernet).

### `GET /POST /api/sources`
**Auth:** JWT

Manage observability source credentials (Langfuse/LangSmith connections).

---

## User Management

### `GET /POST /api/profile`
**Auth:** JWT

Get or update user profile.

### `GET /POST /api/api-key`
**Auth:** JWT

Manage external API keys for SDK access.

### `GET /api/usage`
**Auth:** JWT

Token + request usage statistics.

---

## Admin

### `GET /api/admin`
**Auth:** JWT + Admin only

Cross-org administrative operations (requires email in `ADMIN_EMAILS`).

---

## Webhooks and Notifications

### `GET /POST /api/webhooks`
**Auth:** JWT

Configure outbound webhook endpoints for analysis completion events.

### `GET /api/digest`
**Auth:** JWT

Retrieve the weekly failure digest (also sent via email via Resend).

---

## Error Responses

All errors follow the envelope:

```json
{
  "error": "Invalid or expired token",
  "data": null,
  "metadata": null
}
```

| HTTP Status | Meaning |
|---|---|
| 400 | Validation error (Pydantic) |
| 401 | Missing or invalid JWT |
| 403 | Insufficient permissions |
| 404 | Session or resource not found |
| 422 | Unprocessable entity |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
