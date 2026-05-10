# Aethen-AI — Scope Adjustments

> **Purpose**: Transparent accounting of differences between the original proposal (`capstone_proj_proposal_codeman403.md`) and the final implementation. Every delta is intentional and explained.
>
> **Date**: 2026-04-26

---

## Context

The original proposal was written on 2026-04-18 as an ambitious, production-grade design for a 3-week capstone project. During implementation, some features were descoped or simplified based on time constraints, proxy limitations, and architectural pivots discovered through real-world testing. This document explains each adjustment.

---

## Implemented as Proposed ✅

| Proposal Feature | Implementation |
|---|---|
| 4 diagnostic modules (Memory, Tool, Hallucination, Blind Spot) | ✅ All 4 modules implemented as LangGraph nodes with conditional routing |
| LangGraph state machine orchestration | ✅ Full StateGraph with classify → parallel retrieve → rerank → module → synthesize |
| pgvector semantic search (≥1,000 embeddings) | ✅ 1,100 vectors in `traces` namespace (`session_vectors` table) |
| Neo4j Graph RAG | ✅ Session nodes + SHARES_FAILURE_PATTERN relationships for cross-session traversal |
| Cohere Rerank v3 | ✅ Post-retrieval re-ranking in the pipeline |
| Langfuse live trace ingestion | ✅ Dual-mode: synthetic + live via `LangfuseTraceAdapter` |
| Demo Agent (in-browser trace generation) | ✅ `/demo-agent` with 4 scenario buttons + free-form chat, Langfuse badges |
| Data quality checks (≥2 per source) | ✅ 8 checks across 4 sources, `/data-quality` page |
| Abuse protection (rate limiting, sanitization) | ✅ `RateLimitMiddleware` + `sanitize_input()` + output disclaimer |
| 7+ integration tests | ✅ 32 backend tests (7 integration + 7 adapter + intent tests) |
| Dashboard with Reliability Score | ✅ SVG gauge, metric cards, failure distribution chart, recent alerts |
| Chat Debug with freeform queries | ✅ Text-to-SQL routing, session persistence, conversation history |
| Deployment configs | ✅ `render.yaml`, `Dockerfile`, `vercel.json` created |

---

## Simplified from Proposal ⚠️

### 1. Neo4j Graph Schema — Simplified

| Proposed | Implemented | Reason |
|---|---|---|
| 7 node types (Query, Chunk, ToolCall, Response, FailureEvent, PromptVersion, BlindSpot) | Session nodes + SHARES_FAILURE_PATTERN edges | The full 7-node schema was designed for a mature system with thousands of traces. For 500 seeded sessions, the simpler schema provides the same cross-session pattern detection capability. The graph traversal in `blind_spot.py` still finds systemic failures across sessions — the core value proposition is preserved. |
| 12 relationship types | 1 primary relationship type | Same reasoning. Additional relationship types (CONTRADICTS, CAUSED_BY, REPLACED_BY) require a richer data model that would add complexity without demonstrable benefit at current scale. |

### 2. Synthesis LLM — Proxy Constraint

| Proposed | Implemented | Reason |
|---|---|---|
| Claude Sonnet 4.6 for all synthesis | Claude Sonnet 4.6 via Anthropic proxy (with GPT-4o-mini fallback) | The DataExpert.io Anthropic proxy initially returned non-standard response formats incompatible with `langchain_anthropic`. This was resolved by wiring Claude through the proxy with a graceful fallback. See `docs/implementation_timeline.md` for the full decision log. |

### 3. UI Visualizations — Simplified

| Proposed | Implemented | Reason |
|---|---|---|
| React Flow interactive graph for tool chain visualization | Static waterfall view with latency bars | React Flow adds ~150KB to the bundle and requires significant wiring for a single visualization. The static waterfall provides the same diagnostic information (tool sequence, latency, errors) with zero additional dependencies. |
| Bubble chart for Blind Spot Map | List-based cluster display with counts | A bubble chart requires D3.js or a charting library. The list view shows the same data (topic, query count, recommended action) in a more information-dense format that's actually more useful for debugging. |
| Per-claim verification UI in Hallucination RCA | LLM-generated analysis with cited findings | Per-claim decomposition UI (each claim mapped to a source with ✅/❌) requires a separate NLI (natural language inference) model or structured claim extraction step. The LLM-based analysis identifies the same root causes and provides evidence citations — the diagnostic value is equivalent. |

---

## Deferred to Post-Submission 📋

| Proposed Feature | Status | Reason |
|---|---|---|
| Vercel Cron job for scheduled re-ingestion | Not implemented | The manual "Pull Langfuse" button serves the same function for demo purposes. Cron scheduling is a deployment-time configuration, not a code feature. |
| Prompt Version Comparison (Test 6 in proposal) | Not implemented | Requires multiple prompt versions in the trace data and A/B comparison logic. Descoped to focus on the 4 core modules. The data model supports it — this is a feature addition, not an architectural change. |
| Full Reliability Report (Test 7 in proposal) | Partially implemented | The dashboard provides an aggregated reliability score and failure breakdown. A single-query "full report" that activates all 4 modules simultaneously is possible but wasn't prioritized over the per-module deep-dive workflow. |
| NetworkX fallback for Neo4j | Not needed | Neo4j Aura free tier was sufficient throughout development. The fallback was a risk mitigation that didn't need to be triggered. |
| `useSWR` / `react-query` for client data | Uses raw `fetch` + `useState` | The current implementation is functional and clean. Adding a data-fetching library would improve cache management and optimistic updates but wasn't necessary for the current page count. Tracked for future improvement. |

---

## Architectural Pivots (Improvements Over Proposal)

These changes were not in the original proposal but improved the system:

| Change | Why It's Better |
|---|---|
| **3-store architecture** (Postgres + pgvector + Neo4j) | Original plan used an in-memory store that wiped on restart. Postgres via Supabase provides persistent, queryable session storage, with pgvector extension providing vector search in the same database. This was the most significant architectural improvement. |
| **Text-to-SQL for Chat Debug** | Original plan used pattern-matching keyword handlers. LLM-generated SQL handles arbitrary queries (ordering, filtering, grouping) without fragile patterns. Discovered through the Aethen self-analysis scenario. |
| **classify_intent always uses LLM** | Original implementation short-circuited on pre-set labels. Removing the short-circuit improved classification accuracy — the LLM reads actual evidence (retrieval scores, tool errors, response content) instead of trusting a heuristic label. |
| **Chat session persistence** | Not in the original proposal. Added Postgres `chat_sessions` + `chat_messages` tables so debugging conversations survive page refreshes and are queryable. |
| **Langfuse tracing on analysis calls** | Not in the original proposal. Every LangGraph `ainvoke()` now traces to Langfuse, enabling Aethen to analyze its own analysis calls (the recursive demo scenario). |

---

## Summary

The core value proposition — **a 4-module diagnostic pipeline that reasons across execution traces using Graph RAG and produces structured root-cause analyses** — is fully implemented. The simplifications are primarily in UI visualization complexity and graph schema granularity, neither of which affects the diagnostic capability. The architectural pivots (3-store separation, text-to-SQL, LLM-always classification) represent genuine improvements over the original design, discovered through real-world testing.
