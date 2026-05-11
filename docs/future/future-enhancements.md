# Future Enhancements

---

## Near-Term (v0.2)

### Streaming Analysis Results

Replace the 9–12 s wait with token-by-token streaming via Server-Sent Events (SSE). The frontend would show findings as they're generated.

**Implementation:** FastAPI `EventSourceResponse` on `POST /api/chat`; LangGraph supports streaming with `astream_events()`.

### Webhook-Triggered Auto-Analysis

When Langfuse sends a webhook on new trace completion, automatically ingest and analyse without manual pull.

**Implementation:** Receive webhook at `POST /api/webhooks/langfuse-trace`, enqueue analysis job.

### OpenTelemetry Collector

Add an OTEL collector endpoint to ingest from any OTEL-compatible agent tracing system, not just Langfuse/LangSmith.

### CLI Tool

```bash
aethen analyze <trace-id> --source langfuse
aethen ingest session.json
aethen report --session-id sess-001
```

---

## Medium-Term (v0.3–v0.4)

### Multi-Agent Session Correlation

Link failure traces across parent/child agent boundaries. If a LangGraph orchestrator spawns subagents, correlate all their traces into a single diagnostic view.

### Failure Pattern Dashboard

Time-series charts:
- Failure rate by type over time (memory vs hallucination vs tool)
- Most common knowledge gaps (recurring blind spots)
- Average confidence trend by agent
- MTTR (mean time from failure to analysis)

### Slack / PagerDuty Integration

- Post weekly digest to a Slack channel
- Page on-call via PagerDuty when `confidence > 0.8` and `severity = critical`
- Configurable via dashboard → Settings → Notifications

### Remediation Playbooks

Auto-generate concrete fix instructions based on failure type and root cause:
- Memory failure: "Re-index doc `{expected_doc_id}` with updated embeddings"
- Tool failure: "Add retry logic for `{tool_name}` with exponential backoff"
- Hallucination: "Add explicit grounding instruction to the system prompt"
- Blind spot: "Add the following content to the KB: `{topic}`"

---

## Long-Term (v0.5+)

### Fine-Tuned Classifier

Replace GPT-4o-mini in `classify_intent` with a fine-tuned model trained on real production traces. Expected benefits:
- Lower latency (~200 ms vs ~800 ms)
- Lower cost (~10× cheaper per call)
- Higher accuracy on real-world edge cases

Training data: golden dataset + production traces with confirmed labels.

### A/B Analysis

Compare two versions of an agent (different prompts, different KB, different model) side-by-side using the same failure session set.

### On-Premise Deployment

Docker Compose stack with:
- Self-hosted PostgreSQL + pgvector
- Self-hosted Neo4j Community
- Ollama for local LLM inference
- No external SaaS dependencies

### Custom Failure Taxonomy

Allow organisations to define their own failure categories beyond the four built-in modules. For example: "context_length_exceeded", "rate_limit_backoff", "retrieval_timeout".
