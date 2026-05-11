# Roadmap

Current production status: **v0.1.0** — all four diagnostic modules operational, live on Vercel + Render.

---

## v0.2 — Developer Experience

- [ ] **Streaming analysis results (SSE)** — stream findings token-by-token instead of waiting for the full 9–12 s pipeline
- [ ] **Webhook-triggered auto-analysis** — automatically run analysis when a new Langfuse trace is ingested (Langfuse webhook → POST /api/ingest → immediate analysis)
- [ ] **OpenTelemetry collector** — OTEL as a third trace source alongside Langfuse/LangSmith
- [ ] **CLI** — `aethen analyze <trace-id>` shell command using the SDK

## v0.3 — Multi-Agent Intelligence

- [ ] **Multi-agent session correlation** — link failure traces across orchestrators (LangGraph parent + child agents in the same run)
- [ ] **Failure trend dashboards** — time-series charts for failure rate, most common module, avg confidence per agent
- [ ] **Pattern clustering** — cluster similar failures across sessions to surface systemic issues automatically

## v0.4 — Integrations

- [ ] **Slack integration** — post digest + critical failure alerts to a Slack channel
- [ ] **PagerDuty integration** — page on-call when `confidence > 0.8` and `severity = critical`
- [ ] **GitHub Issues auto-creation** — create an issue for recurring blind spots
- [ ] **JIRA webhook** — push findings to JIRA tickets

## v0.5 — Performance + Scale

- [ ] **Fine-tuned classifier** — replace GPT-4o-mini classifier with a fine-tuned model on the golden dataset to reduce latency and cost
- [ ] **Redis-backed rate limiting and token cache** — remove in-memory bottleneck for multi-instance deployments
- [ ] **Async ingestion queue** — move heavy embedding + Neo4j seeding to a background worker (Celery / ARQ)
- [ ] **HNSW index re-enable** — re-enable pgvector HNSW approximate search once `session_vectors` exceeds ~100K rows

## Future Scope (Unscheduled)

- **Remediation playbooks** — auto-generated fix instructions with code diff suggestions based on the failure type and root cause
- **A/B analysis** — compare two versions of an agent side-by-side using the same session set
- **Custom failure taxonomy** — allow organisations to define their own failure categories beyond the four built-in modules
- **On-premise deployment** — Docker Compose stack with self-hosted Postgres + Neo4j + LLM (Ollama)

---

## Not Planned

The following are explicitly out of scope for Aethen's current architecture:

- **Accessing the monitored agent's knowledge base** — Aethen is a trace-only analyser; it never reads the KB of the agent it diagnoses
- **Real-time monitoring / live agent interception** — Aethen analyses completed sessions, not in-flight ones
- **LLM factual correctness judgment** — Aethen can detect that an LLM response adds claims not in retrieved docs, but cannot determine if those claims are factually true
