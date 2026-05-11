# Load Tests

---

## Current Status

Load/stress tests are not yet implemented. This is a v0.5+ item in the roadmap.

---

## Target Scenarios (When Implemented)

### Concurrent Analysis Requests

**Scenario:** 20 concurrent `POST /api/chat` requests  
**Target:** All complete in < 30 s; no 500 errors; rate limiter allows all (< 100/min threshold)

**Bottleneck expected:** LLM API rate limits (GPT-4o-mini 500 RPM, Anthropic 1 000 RPM)

### Bulk Ingest

**Scenario:** `POST /api/ingest` with 50 sessions in one request  
**Target:** All 50 sessions ingested + embedded + graph-seeded in < 60 s

**Bottleneck expected:** Embedding API (batched, but 50 sessions = ~200 events ≈ 1 OpenAI batch)

### pgvector Query Throughput

**Scenario:** 100 concurrent `query_similar()` calls  
**Target:** All complete in < 100 ms (exact search, current scale)

---

## Tools

Suggested tools for load testing when implemented:
- **Locust** (Python-native, integrates well with asyncpg)
- **k6** (modern, JavaScript, good Grafana integration)
- **wrk** (simple HTTP benchmarking for quick checks)

---

## Current Performance Baseline

From manual testing (not automated):

| Endpoint | p50 | p99 | Notes |
|---|---|---|---|
| `GET /api/health` | < 5 ms | < 20 ms | No DB calls |
| `POST /api/ingest` (1 session) | ~500 ms | ~2 s | Embed + Postgres + Neo4j |
| `POST /api/chat` | ~9 s | ~15 s | Full LangGraph pipeline |
| `GET /api/sessions` | ~20 ms | ~100 ms | Postgres query with org filter |
