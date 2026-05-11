# Requirement Traceability Matrix

This document maps every capstone rubric requirement to the actual implementation, documentation, tests, and evaluation evidence.

---

## Criteria 1 — Project Spec

| Requirement | Implementation | Documentation | Test / Proof |
|---|---|---|---|
| **System / AI Agent design diagram** | `backend/app/agents/graph.py` — 3 LangGraph singletons | [ARCHITECTURE.md](../../ARCHITECTURE.md) §2 (Mermaid diagrams) | CI: `pnpm build` validates component wiring |
| **Screenshots / UI** | Live: https://aethen-ai.vercel.app · `demo.gif` at repo root | [README.md](../../README.md) Demo section | Manual verification on live app |
| **What business problem are you solving?** | AI agents fail in production; no systematic trace-based RCA exists | [README.md](../../README.md) The Problem section · [docs/product/problem-statement.md](../product/problem-statement.md) | — |

---

## Criteria 2 — Write Up

| Requirement | Implementation | Documentation | Test / Proof |
|---|---|---|---|
| **Purpose and expected outputs** | 4-module diagnostic pipeline → structured `AnalysisReport` with findings, root cause, confidence | [README.md](../../README.md) Diagnostic Modules section | `tests/test_integration.py` |
| **Dataset and technology choices with justifications** | Langfuse + LangSmith (observability); pgvector (collocated vectors); Neo4j (graph traversal) | [README.md](../../README.md) Data Sources + Tech Stack · [ARCHITECTURE.md](../../ARCHITECTURE.md) Trade-offs | — |
| **Steps followed and challenges faced** | `docs/adal/session_progress.md` (session-by-session log) · `docs/implementation_timeline.md` (decision log) | [docs/adal/session_progress.md](../adal/session_progress.md) | — |
| **Future enhancements** | Streaming SSE, multi-agent correlation, Slack/PagerDuty, fine-tuned classifier | [ROADMAP.md](../../ROADMAP.md) · [docs/future/future-enhancements.md](../future/future-enhancements.md) | — |

---

## Criteria 3 — Vectorizing Unstructured Data (Data Quality Checks)

| Data Source | Quality Check 1 | Quality Check 2 | Implementation |
|---|---|---|---|
| **Langfuse traces** | Schema validation (Pydantic v2 strict mode) at ingest | PII detection and redaction (scrubadub) pre-storage | `app/api/ingest.py` + `app/middleware/pii_redactor.py` |
| **LangSmith traces** | Schema validation via `langsmith_provider.py` adapter | Prompt injection detection (`strip_injection()`) before embedding | `app/providers/langsmith_provider.py` + `app/utils/sanitize.py` |
| **pgvector embeddings** | Embedding dimension validation (1 536-dim, OpenAI `text-embedding-3-small`) | Score threshold logging (scores < 0.3 trigger `very_low_scores` signal in confidence scorer) | `app/services/embedding_service.py` + `app/agents/nodes/confidence.py` |
| **Neo4j graph nodes** | Node uniqueness constraints enforced at schema creation | Relationship integrity validated at ingest (session must exist before graph seeding) | `app/services/neo4j_service.py` `_ensure_constraints()` |
| **All sources** | Body size limit (1 MB max, rejects oversized payloads) | Rate limiting (100 req/min, 1 000 req/hr) prevents flooding | `app/utils/body_size_limit.py` + `app/utils/rate_limit.py` |

---

## Criteria 4 — RAG Code

| Requirement | Status | Implementation | Documentation |
|---|---|---|---|
| **RAG model** | ✅ Implemented | pgvector HNSW cosine search → Cohere Rerank v3 → LLM analysis | [docs/rag/retrieval.md](../rag/retrieval.md) |
| **Graph RAG (standout)** | ✅ Implemented | Neo4j Aura — cross-session session→query→chunk→tool→response graph | [docs/architecture/agentic-workflows.md](../architecture/agentic-workflows.md) |
| **Re-ranking (standout)** | ✅ Implemented | Cohere Rerank v3 in `app/agents/nodes/rerank.py` | [docs/rag/reranking.md](../rag/reranking.md) |
| **≥ 1 000 embeddings** | ✅ Satisfied | `session_vectors` table: LLM calls + tool calls + retrieval events + failure patterns per session; multiple namespaces | `backend/scripts/verify_pgvector.py` |
| **5+ integration tests with queries** | ✅ Satisfied | `tests/test_integration.py`, `tests/test_ingest.py`, `tests/test_chat.py`, `tests/test_qc_helpers.py`, `tests/test_eval_pipeline.py` | [TESTING.md](../../TESTING.md) |
| **Protect RAG from abuse** | ✅ Multiple layers | Rate limiting, body size limit, prompt injection blocking (`strip_injection`), PII redaction, schema validation | [SECURITY.md](../../SECURITY.md) · [docs/security/](../security/) |

---

## Criteria 4 — Live Deployment

| Requirement | Status | URL |
|---|---|---|
| **Live link to deployed app** | ✅ Deployed | https://aethen-ai.vercel.app |
| **Backend health** | ✅ Live | https://aethen-ai-backend.onrender.com/api/health |

---

## Criteria 5 — Project Scoping

| Requirement | Evidence |
|---|---|
| **Real, non-trivial use case** | AI agent failure diagnosis is a genuine unmet need in production AI systems; requires multi-signal reasoning across tool calls, retrieval events, and LLM outputs |
| **End-to-end implementation** | Trace ingestion → embedding → graph seeding → LangGraph classification → parallel retrieval → fast_analyze → structured AnalysisReport → dashboard display |
| **Technical complexity** | LangGraph parallel execution, Graph RAG (Neo4j), deterministic confidence scoring, per-org LLM credential isolation, Cohere reranking, red-team security testing |
| **Authentication (standout)** | Supabase JWT auth, org-scoped data, admin bypass, token caching |
| **Analytics layer (standout)** | Confidence scores, classification accuracy, failure type distribution, session timeline, trend analysis |
| **Good UI (standout)** | Next.js App Router, shadcn/ui, Framer Motion animations, command palette |

---

## Implementation Gaps and Known Limitations

| Gap | Severity | Details |
|---|---|---|
| **No access to agent's KB** | By design | Aethen is a trace-only analyser — it cannot verify factual correctness of LLM responses, only surface-level grounding against retrieved `doc_content` |
| **Score thresholds are universal heuristics** | Low | Confidence signal weights (0.5, 0.3 thresholds) are calibrated without KB access — may need domain-specific tuning for production deployments |
| **Render free tier cold starts** | Infrastructure | ~30 s cold start after 15 min idle; acceptable for capstone |
| **In-memory rate limiting** | Scalability | Not shared across instances; acceptable for single-instance deployments |
| **No streaming** | UX | Full 9–12 s wait before results; streaming SSE is on the roadmap |

---

## Evidence Summary

| Evidence Type | Location |
|---|---|
| Evaluation results (100% accuracy, 85.56% judge) | `backend/data/eval_dataset.json` + `EVALUATION.md` |
| Red team results (0 CRITICAL/HIGH/MEDIUM) | `docs/security_red_team_report.md` |
| CI passing | `.github/workflows/ci.yml` badge in README |
| Test suite (25 files) | `backend/tests/` |
| Architecture diagrams | `ARCHITECTURE.md` + `docs/architecture/` |
| Live deployment | https://aethen-ai.vercel.app |
