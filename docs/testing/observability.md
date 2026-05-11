# Observability

---

## Logging

**Backend:** `structlog` with contextual logging throughout. JSON renderer in production, dev renderer locally.

```python
logger = structlog.get_logger()
logger.info("fast_analyze_complete",
    session_id=session.session_id,
    failure_type=str(report.failure_type),
    findings=len(report.findings),
    confidence=report.confidence,
)
```

Key log events:
- `aethen_backend_started` — startup with version
- `fast_analyze_llm_used` — which model was used for analysis
- `confidence_computed` — full signal breakdown (at DEBUG level)
- `jwt_authenticated` — per-request auth (at DEBUG level)
- `neo4j_connection_failed` — graceful degradation events
- `eval_run_complete` — accuracy + regression gate results

Log level: `LOG_LEVEL` env var (default `INFO`).

---

## Error Tracking (Sentry)

`sentry_sdk` initialized in `main.py` when `SENTRY_DSN` is set:

```python
sentry_sdk.init(
    dsn=settings.sentry_dsn,
    environment=settings.sentry_environment,
    integrations=[StarletteIntegration(), FastApiIntegration()],
    traces_sample_rate=0.1,   # 10% of requests
    send_default_pii=False,   # no PII to Sentry
)
```

Frontend Sentry: `@sentry/nextjs` in `sentry.client.config.ts` and `frontend/src/instrumentation.ts`.

---

## Langfuse Tracing

Aethen's own LangGraph pipeline is traced to Langfuse via `LangChainTracer` callbacks. Auto-tracing is disabled at startup:

```python
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"
```

This prevents every internal LangChain call from being auto-traced. Only explicitly instrumented calls are sent to Langfuse.

Langfuse traces allow inspection of:
- LLM prompt + response for each analysis
- Token counts per node
- Pipeline latency breakdown
- Classification output
- Confidence scores

---

## Eval Score Dashboard

After each eval run, scores are pushed to Langfuse via `push_session_scores()` and `push_aggregate_scores()`. View in:

1. Langfuse → Project → Scores
2. Filter by score name: `aethen_classification`, `aethen_context_recall`, `aethen_keyword_match`, `accuracy`, `judge_score`
3. Group by `run_id` tag to compare runs over time

---

## Health Check

`GET /api/health` returns service connectivity status:

```json
{
  "data": {
    "status": "ok",
    "services": {
      "postgres": "connected",
      "neo4j": "connected",
      "embedding": "ready"
    }
  }
}
```

Used by:
- Render health check probe (configured in `render.yaml`)
- Smoke test workflow (`smoke.yml`)
- Dashboard status indicator (frontend)
