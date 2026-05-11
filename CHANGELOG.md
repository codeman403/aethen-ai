# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-05-10

### Added

**Core Pipeline**
- LangGraph `analysis_graph` with parallel classify + retrieve + graph_traverse from `parallel_start`
- `fast_analyze` node merging analysis module + synthesize into one LLM call (9–12 s)
- `fast_analysis_graph` for demo agent (4–6 s, skips Neo4j)
- `_legacy_analysis_graph` retained as rollback target
- Deterministic confidence scoring (`compute_confidence()`) — replaces LLM self-reporting
- Early exit on `UNKNOWN` failure type (skips all retrieval/analysis)

**Diagnostic Modules**
- Memory Debug — doc ID mismatch detection, low-score retrieval analysis
- Tool Misfire — failed/timeout status, cascade detection, latency-based timeout
- Hallucination RCA — LLM response vs retrieved `doc_content` comparison
- Blind Spot Detector — zero-chunk detection, cross-session Graph RAG via Neo4j

**Data Layer**
- PostgreSQL/pgvector `session_vectors` table (HNSW cosine, 1 536-dim)
- Neo4j Aura integration (8 node types, 10+ relationships)
- Migration from Pinecone to pgvector (`scripts/migrate_to_pgvector.py`)
- Per-org `org_id` scoping on all queries

**Observability Sources**
- Langfuse v4 trace pull + Langfuse evaluation score push
- LangSmith trace import
- Vercel cron jobs: daily pull (00:00 UTC) + daily digest (07:00 UTC)

**Authentication & Security**
- Supabase JWT middleware (Auth API verification, 60 s token cache)
- Admin bypass via `ADMIN_EMAILS` config
- `strip_injection()` prompt injection protection at ingest + all LLM-facing nodes
- PII redaction via scrubadub at ingest
- Rate limiting (100/min, 1 000/hr), body size limit (1 MB)
- Security headers middleware (X-Frame-Options, CSP, HSTS)
- Per-org LLM credentials (Fernet-encrypted, `contextvars` isolation)
- Anti-Aethen red team: 11 modules, 68 tests → 0 CRITICAL/HIGH/MEDIUM

**Evaluation**
- Golden dataset + two eval modes (fast: classify-only; full: LLM-as-judge)
- Regression gates: accuracy ≥ 90%, keyword match ≥ 70%, judge ≥ 75%
- Results: 100% classification accuracy · 85.56% LLM judge score
- Langfuse score push integration

**API**
- 23 FastAPI routers: chat, ingest, sessions, stats, langfuse, langsmith, demo, eval, qc, model-settings, llm-keys, api-key, sources, usage, admin, onboarding, webhooks, digest, backfill, analyze-raw, chat-sessions, profile, health

**Frontend**
- Next.js 16.2 App Router with Supabase Auth
- Dashboard: overview, memory-debug, tool-misfire, hallucination-rca, blind-spots, traces, chat, data-quality, settings
- Demo Agent page (public, no auth)
- Command palette, session timeline, settings (integrations, api-key, profile, webhooks, digest)
- Sentry integration (client + server)

**SDK & MCP**
- `sdk/aethen_sdk/AethenClient` — async HTTP client with retry
- `app/mcp/server.py` — MCP server exposing Aethen tools

**CI/CD**
- `ci.yml` — backend pytest + frontend type-check + build on push/PR to main/develop
- `smoke.yml` — live health check + Render auto-rollback on push to main
