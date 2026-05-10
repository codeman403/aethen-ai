# Aethen-AI — Implementation Timeline & Decision Log

> **Purpose**: A living record of every significant decision, technical path taken or abandoned,
> architectural pivot, and lesson learned during the implementation of this capstone project.
> This document exists to explain *why* the system is built the way it is — not just *what* was built.
>
> **Audience**: Future AI agents, collaborators, evaluators, and the project author reviewing their own work.
>
> **Maintenance rule**: Update this file whenever (a) a significant architectural decision is made,
> (b) a technical path fails and is replaced, or (c) a new major component is added.
> Each entry must include: what was decided, why, and what was rejected and why.

---

## MCP Server — HTTP Adapter over Direct Python — 2026-05-05 (Session 26)

### The Problem
External AI agent developers needed a way to connect their agents to Aethen for failure diagnosis without writing custom schema converters, storing raw credentials in their code, or setting up complex integrations.

### Decision: HTTP adapter (not direct Python imports)
**Chosen:** MCP server calls existing FastAPI endpoints via `httpx`. Decoupled — works against the deployed Render backend without needing all services locally.

**Rejected:** Direct Python imports (`from app.agents.graph import analysis_graph`). Would require all DB credentials in the MCP server's environment, tight coupling to internals, and break if code structure changes.

### Decision: No credential storage in MCP calls — two models
**Chosen:** Two paths:
1. **Stored source** — team registers credentials once in Aethen UI (Fernet-encrypted), MCP/SDK calls reference only the source name
2. **Per-call** — agent passes credentials at call time, Aethen uses them once and discards

**Rejected:** Embedding Langfuse credentials directly in every MCP call (security risk — appear in logs).
**Rejected:** OAuth (Langfuse/LangSmith don't support OAuth authorization servers for third-party apps — their SSO/OIDC is for user authentication into their own platform, not external app authorization).

### Decision: scrubadub + custom regex over Presidio
**Chosen:** scrubadub (open-source, no ML dependency) + custom regex for medical PHI.

**Rejected:** Presidio (Microsoft) — depends on spaCy/thinc which fails to build on Python 3.13. Same pattern-based coverage achievable with scrubadub + regex at a fraction of the dependency complexity.

**Why:** scrubadub handles email, phone, SSN, credit card, dates. Custom regex layer adds ICD-10 codes, MRN numbers, NPI, DEA numbers for HIPAA PHI coverage. Two-layer approach covers ~85-95% of well-formatted PII/PHI without requiring ML model downloads.

### Decision: Single-tenant now, production-shaped interface
**Chosen:** `AETHEN_API_KEY` accepted and logged but not validated. All data in shared tables.

**Why production-shaped matters:** MCP tool signatures, SDK methods, and Claude Desktop config require zero changes when multi-tenancy is added. Only backend middleware and query scoping change. This was a deliberate interface decision.

**When multi-tenancy is needed:** `tenants` + `api_keys` tables, `tenant_id` column on `sessions`/`app_settings`, middleware validates and injects tenant context.

---

## Eval Pipeline — Self-Contained over RAGAS/DeepEval — 2026-05-05 (Session 25)

### The Problem
Aethen diagnoses AI agent failures but had no systematic measurement of its own diagnostic accuracy. The `/api/qc` endpoint checked data quality (vector coverage, schema validation) but never asked: is the pipeline's classification correct? Is the synthesis faithful?

### Decision: Custom metrics over RAGAS or DeepEval
**Chosen:** Self-contained eval framework using existing data schema — no new heavyweight dependencies.

**Rejected:**
- **RAGAS** — calls an LLM internally to compute metrics, expensive per run, and designed for question-answering pipelines not failure-pattern retrieval. The metric semantics (does context answer a question?) don't map to Aethen's use case (does context reveal similar failure patterns?).
- **DeepEval** — heavyweight test framework that wants to own the test runner, creating friction with pytest.

**Why custom works here:** The `Session` schema already has `expected_doc_ids`, `actual_doc_ids`, and `hallucination_flag` — explicit ground-truth labels. Context recall = `|expected ∩ actual| / |expected|`, which is just set math on existing fields. No LLM needed to compute retrieval metrics.

### Decision: `expected_doc_ids ≠ actual_doc_ids` as priority rule in classify_intent
**Chosen:** When `expected_doc_ids` is non-empty and differs from `actual_doc_ids`, classify as `memory` immediately — do not consult `doc_content`.

**Why:** `expected_doc_ids` being non-empty proves the KB has the right documents. The mismatch proves retrieval fetched the wrong ones. Before this rule, the classifier read generic `doc_content` descriptions ("unrelated document content") and routed to `blind_spot`. Memory F1: 57% → 100%.

### Decision: Synthesis precision rule + session evidence context
**Chosen:** `synthesize.py` now (a) requires root_cause to name component + measurable evidence + downstream effect, and (b) receives a compact `_session_evidence()` snippet with retrieval scores, doc IDs, and error messages.

**Why:** Before this, root causes were vague ("retrieval returned wrong documents") because synthesize only received the module's text output with no concrete numbers. The precision rule + evidence context pushed LLM Judge Score from 65% to 83%.

### Regression gates (current thresholds)
| Gate | Threshold | Rationale |
|------|-----------|-----------|
| `classification_accuracy` | ≥ 90% | Baseline reached 100%; 90% gives buffer while catching real regressions |
| `keyword_match_rate` | ≥ 70% | Synthesis keyword alignment; higher would be too sensitive to keyword wording |
| `judge_score` (full mode) | ≥ 75% | LLM quality bar; 83% baseline gives 8pp buffer |

### Langfuse v4 eval API change
`langfuse.score()` was renamed to `langfuse.create_score()` in v4.1+. Updated in `langfuse_eval.py`.

---

## Langfuse v4 CallbackHandler — user_id/session_id API — 2026-04-28 (Session 15)

### The Problem
`make_langfuse_handler(user_id="Demo Agent", session_id=session_id)` was passing these as
`CallbackHandler(user_id=..., session_id=...)` constructor kwargs. This caused a `TypeError`
caught silently by the outer `except Exception`, returning `(None, None)` → every demo chat
message had `langfuse_traced=False` and traces never reached Langfuse.

### Root Cause
In Langfuse v4.5, `CallbackHandler.__init__` only accepts `public_key` and `trace_context`.
`user_id` and `session_id` are NOT constructor parameters. They are set via the LangChain
invoke config `metadata` dict at call time.

### Decision: Pass via metadata, not constructor
**Chosen:** `CallbackHandler()` with no kwargs. Pass identity via invoke config:
```python
config = {
    "callbacks": [handler],
    "metadata": {
        "langfuse_user_id": "Demo Agent",
        "langfuse_session_id": session_id,
    }
}
```
**Rejected:** Constructor kwargs — not valid in Langfuse v4.5.

**Why this matters:** Any future agent that tries to set `user_id` or `session_id` on the
`CallbackHandler` constructor will silently break Langfuse tracing. Always use metadata.

---

## Demo Agent Session Persistence — Separate Tables — 2026-04-28 (Session 15)

### The Problem
Demo Agent free-form chat had no persistence: each turn generated a new random `session_id`,
creating disconnected Langfuse traces and losing conversation history on page refresh.

### Decision: Separate Postgres tables (demo_chat_sessions + demo_chat_messages)
**Chosen:** Two new tables, separate from Chat Debug's `chat_sessions`/`chat_messages`.
Backend creates the session on first turn, returns `session_id` to frontend, which reuses it
for all subsequent turns.

**Rejected:** Using the same `chat_sessions`/`chat_messages` tables.

**Why separate:** The architectural boundary is load-bearing for the product story.
- `chat_sessions`/`chat_messages` = Aethen's diagnostic conversations (engineer using the tool)
- `demo_chat_sessions`/`demo_chat_messages` = the agent under test's conversation traces

Mixing them would blur the distinction between the monitoring tool and the monitored agent —
which is the core differentiator Aethen demonstrates.

**No "Analyze" button on Demo Agent:** Also rejected for the same reason. In production,
the monitored agent has no awareness of Aethen. The correct flow is:
Demo Agent → Langfuse → Pull → Module pages → analysis.

---

## Project Genesis — 2026-04-18

**Proposal written and submitted.**

The core insight driving the proposal: existing AI observability tools (LangSmith, Arize, Helicone)
help engineers inspect *individual* traces. None of them reason *across hundreds of traces* to find
systemic failure patterns, knowledge gaps, and causal chains. Aethen was proposed to fill that gap.

**Four analytical modules defined:**
1. Memory Debugger — retrieval quality analysis
2. Tool Misfire Analyzer — tool call failure detection
3. Hallucination RCA — grounding failure forensics
4. Blind Spot Discovery — knowledge gap identification

**Key architectural bets made at proposal time:**
- LangGraph over raw LangChain (stateful multi-step workflows)
- Graph RAG via Neo4j (cross-session pattern traversal)
- Pinecone for semantic search over trace embeddings
- Cohere Rerank v3 for post-retrieval precision
- Claude Sonnet 4.6 for final synthesis

---

## Phase 1: Foundation — 2026-04-24 (Sessions 1–2)

### What was built
- Next.js 14 frontend scaffold (App Router, Tailwind, shadcn/ui)
- FastAPI backend with Pydantic v2, structlog, Poetry
- LangGraph state machine: `classify_intent → graph_traverse → vector_retrieve → rerank → [module] → synthesize`
- All 4 analysis module nodes implemented
- Data models: `Session`, `LLMCall`, `ToolCall`, `RetrievalEvent`
- Basic Pinecone and Neo4j service integrations
- 12 tests passing

### Decision: LangGraph over a simple LangChain chain

**Chosen:** LangGraph StateGraph with conditional routing  
**Rejected:** A flat sequential LangChain chain

**Why:** The debugging domain requires capabilities that flat chains cannot provide:
conditional routing to 1–4 modules simultaneously, persistent state across reasoning steps,
and cyclical reasoning (re-retrieve if evidence is insufficient). A chain would have required
brittle manual orchestration to achieve the same. LangGraph made each module independently testable.

**Risk acknowledged:** Highest technical complexity risk in the project. Mitigated by incremental
implementation — linear retrieval first, then layering in conditional routing.

---

## Phase 1 Critical Failure: LLM Proxy Incompatibility — 2026-04-24 (Session 3)

### What broke
The synthesis node used `langchain_anthropic.ChatAnthropic` pointing to Claude Sonnet 4.6.
The DataExpert.io proxy (`/api/v1/anthropic`) returned responses in a non-Anthropic-SDK format,
causing deserialization errors in the LangGraph pipeline. All synthesis calls crashed.

**Error:** `langchain_anthropic` expected Anthropic SDK response format; proxy returned OpenAI-compatible JSON.

### Decision: GPT-4o-mini via OpenAI proxy for synthesis

**Chosen:** `langchain_openai.ChatOpenAI` with model `gpt-4o-mini` via DataExpert OpenAI proxy  
**Rejected:** Direct Claude integration (blocked by proxy policy — Anthropic endpoint non-functional)

**Why:** The OpenAI proxy (`/api/v1/openai`) worked correctly and GPT-4o-mini produces acceptable
synthesis quality for the debugging use case. Claude was kept in the config for when a direct API
key is available.

**Impact:** All synthesis uses GPT-4o-mini through the proxy. The model name `claude-sonnet-4-6`
in config is preserved for future direct-key deployments.

**Lesson:** Always verify LLM proxy compatibility with SDK format expectations before building
dependent pipeline stages. Test the proxy response format explicitly.

---

## Phase 2: Live Data Integration — 2026-04-24 (Sessions 4–5)

### What was built
- Langfuse live trace ingestion (`POST /api/langfuse/pull`)
- `LangfuseTraceAdapter` — transforms Langfuse format → Aethen `Session` schema
- Heuristic failure type inference from tags, failed tools, empty retrievals
- 7 integration tests + 7 Langfuse adapter unit tests (26 total)
- Dashboard wired to live stats
- Deployment configs: `backend/render.yaml`, `vercel.json`

### Decision: Provider abstraction layer

**Chosen:** `TraceProvider` abstract base class with `SyntheticProvider` and `LangfuseProvider` implementations  
**Rejected:** Hardcoding Langfuse as the only ingestion path

**Why:** The platform needed both synthetic traces (for reproducible testing) and live Langfuse traces
(for real-world demo). The abstraction made it trivial to add providers without changing downstream logic.
This also protected against Langfuse API changes — only the adapter needs updating if Langfuse changes format.

---

## Phase 2 Failure: Langfuse v4 SDK Breaking Changes — 2026-04-24 (Session 6)

### What broke
Langfuse released v4, which introduced breaking changes:
- Import path changed: `langfuse.callback` → `langfuse.langchain`
- `Langfuse.fetch_traces()` removed entirely — no replacement in Python SDK
- Tags could no longer be attached via `handler.tags`; must use LangChain `config={"tags": ...}`

### Decision: REST API client for trace fetching

**Chosen:** `LangfuseAPI` REST client (`client.trace.list()`, `client.observations.get_many()`)  
**Rejected:** Waiting for Langfuse to restore the Python SDK method

**Why:** The REST API is the canonical interface; SDK wrappers are convenience. Using the REST API
directly is more stable and gave us access to the full trace/observation payload structure.

**Additional fix:** Extended `_infer_failure_type` with content-based keyword inference as a fallback
when Langfuse tags are missing or malformed. Tags via LangChain config proved unreliable in v4.

**Lesson:** Pin SDK versions explicitly in `pyproject.toml`. Never assume a major version upgrade is
backward-compatible. Add adapter tests that validate the schema contract between Langfuse and Aethen.

---

## Phase 3: UI Completeness + Demo — 2026-04-24 (Session 7)

### What was built
- Demo Agent UI (`/demo-agent`) — 4 scenario buttons + free-form chat, Langfuse badge per turn
- Pinecone seeding: 1,100 vectors in `traces` namespace (rubric ≥1,000 met)
- Data Quality page (`/data-quality`) — automated quality report across 4 sources
- SessionsList component — real Langfuse sessions in all 4 module pages
- Full session payload persistence in the in-memory store

### Decision: Real Langfuse sessions on module pages (not demo sessions)

**Chosen:** SessionsList component showing real pulled Langfuse traces; clicking triggers full LangGraph analysis  
**Rejected:** Keeping the session ID input box + manual "Analyze" button

**Why:** The proposal explicitly required live trace analysis as a stand-out feature. Showing real
sessions from Langfuse makes the demo compelling — evaluators can generate traces via the Demo Agent,
pull them, and immediately analyze them on any module page. The closed loop (generate → trace → pull → analyze)
is a unique differentiator.

### Critical bug discovered: classify_intent node re-classifying pulled sessions

**Symptom:** Memory sessions pulled from Langfuse appeared on the Tool Misfire page.

**Root cause:** The LangGraph `classify_intent` node re-ran GPT-4o-mini classification from scratch,
overriding the `failure_type` already set by `LangfuseTraceAdapter`.

**Fix:** `classify_intent` now short-circuits and returns the pre-set `failure_type` if one is already
present on the session. LLM classification only runs for unclassified sessions. This pattern (trust
pre-classified data, classify only when needed) became a standing convention.

---

## Phase 4: Production Architecture Decision — 2026-04-25 (Session 8)

### The Problem
The dashboard showed **1,000 traces** while module pages showed **0 sessions**.

**Root cause:** Two completely separate data sources serving different parts of the app:
- Dashboard stats: Neo4j (persistent, 500 seeded sessions)
- Module page session lists: in-memory Python dict (volatile, wiped on every restart)

After any backend restart, the in-memory store was empty → module pages showed nothing,
despite the dashboard correctly showing trace counts from Neo4j.

### Architectural Decision: 3-Store Separation

This was the most significant architectural decision of the implementation phase.

**Chosen architecture:**

| Store | Role | Library |
|-------|------|---------|
| **PostgreSQL (Supabase)** | All session CRUD, stats, chat history | asyncpg |
| **Neo4j** | Graph structure only — nodes, relationships, traversal | neo4j driver |
| **Pinecone** | Vector embeddings — semantic search | pinecone |

**Rejected alternatives:**

1. **Fix the in-memory store** — Add persistence (e.g., pickle to disk). Rejected: still a single-process
   solution, not scalable, not production-appropriate. Papering over a structural problem.

2. **Store full session JSON in Neo4j** — Add `session_data` property to Session nodes.
   Rejected: Neo4j is a graph database optimized for relationship traversal, not document storage.
   Large JSON blobs in node properties is an anti-pattern. The correct tool for document storage is
   a document/relational database.

3. **Use only Pinecone + Neo4j, drop in-memory** — Rejected: Pinecone stores vectors, not full JSON.
   Fetching raw session data from Pinecone requires vector lookup + filtering, which is wrong for CRUD.

4. **Keep Neo4j for everything including session data** — Rejected: same reasoning as #2.
   Graph databases are optimized for traversal, not arbitrary JSON retrieval.

**Why PostgreSQL/Supabase specifically:**
- Supabase provides a free-tier hosted PostgreSQL with a management UI
- asyncpg is fully async — matches FastAPI's async-first architecture
- JSONB column (`session_data`) allows storing the full Session payload while keeping metadata columns
  indexed for filtering
- `statement_cache_size=0` parameter handles Supabase's pgBouncer pooler mode

**Why keep Neo4j:**
- The proposal explicitly requires 7 node types and 10+ relationship types for Graph RAG
- Cross-session pattern traversal (RELATED_TO edges) is something graph databases do natively that
  SQL cannot replicate elegantly
- Blind Spot detection benefits from graph traversal across shared BlindSpot nodes
- Removing it would violate the proposal's core technical differentiator

**Implementation:** `sync_neo4j_from_postgres.py` script ensures Neo4j is always rebuildable from
Postgres, making PostgreSQL the authoritative source of truth.

---

## Phase 4 Bug: Double-Seeding Causes Stats Inconsistency — 2026-04-25 (Session 9)

### What happened
`seed_neo4j.py` was run twice (once before Supabase was set up, once after).
`generate_traces()` uses random UUIDs for session IDs, so both runs created different sessions.
Result: Neo4j had 1,000 sessions, Postgres had 500. Dashboard (reading Neo4j) showed 1,000.
Module pages (reading Postgres) showed 500. Inconsistency visible to users.

### Decision: Flip stats to Postgres as primary

**Chosen:** `GET /api/stats` reads from Postgres exclusively. Neo4j no longer queried for counts.  
**Rejected:** Keeping Neo4j as stats source and syncing data back into it from Postgres.

**Why:** Postgres is now the authoritative session store. Stats should always reflect what Postgres knows.
Neo4j's counts can drift (e.g., if a session is upserted to Postgres but Neo4j graph creation fails).
Using Postgres for stats ensures consistency by definition.

**Operational fix:** `sync_neo4j_from_postgres.py` wipes Neo4j and rebuilds from Postgres,
aligning both stores to exactly 500 sessions.

---

## Phase 4: Chat Debug — Architectural Evolution

The Chat Debug page went through three distinct design iterations before reaching its final form.

### Iteration 1: Generic LLM chat (wrong)

**Initial approach:** Freeform text → `POST /api/demo/chat` → generic GPT-4o-mini response  
**Problem:** The LLM had no access to trace data, Postgres, Pinecone, or Neo4j. Asking
"give me top 10 tool failures" returned a generic answer about "software bugs and hardware malfunctions".
The chat was useless for actual debugging.

### Iteration 2: 3-way intent routing (insufficient)

**Approach:** Classify query as `stats | list | diagnostic` → route to appropriate handler  
**Problems discovered in production:**
- "who am i" → classified as `diagnostic` → default `tool_misfire` → irrelevant analysis
- "what did I ask you earlier" → classified as `diagnostic` → same problem
- "show me how many hallucination failures" → correct (stats), but follow-up "out of these, which ones are critical" failed because "critical" hit the `diagnostic` path without context

### Iteration 3: 5-way intent routing with conversational memory (final)

**Final routing order:**

```
meta → conversational → (follow-up check) → stats → list → (unclear guard) → diagnostic
```

| Intent | Detection | Handler | LLM used? |
|--------|-----------|---------|-----------|
| **meta** | identity/help patterns | canned response | No |
| **conversational** | "what did I ask", "recap" | LLM + full history | Yes (GPT-4o-mini) |
| **follow-up** | "these", "them", "earlier" | inherits failure_type → diagnostic | Yes (LangGraph) |
| **stats** | "how many", "count" | Postgres aggregate | No |
| **list** | "top N", "recent" | Postgres sessions | No |
| **unclear** | no failure keywords + diagnostic intent | guidance response | No |
| **diagnostic** | failure keywords present | LangGraph + real Postgres session | Yes (full pipeline) |

**Key design principle learned:** The routing order matters critically. Meta and conversational checks
must come *before* stats/list/diagnostic because otherwise they fall through to the failure analysis
pipeline which produces irrelevant results. Short-circuit early.

**Lesson:** Build intent classification as a layered guard rather than a flat switch. Each layer
eliminates a class of misrouting before the next layer runs.

---

## Phase 4: Chat Session Persistence — 2026-04-25 (Session 9)

### The Problem
Chat conversation history lived only in React state (in-memory in the browser).
Refreshing the page lost all conversations. There was no way to return to a previous debugging session.

### Decision: Postgres chat_sessions + chat_messages tables

**Chosen:** Two new Postgres tables managed by `postgres_service.py`. Sessions auto-named from first message.  
**Rejected:** Browser localStorage for persistence.

**Why not localStorage:**
- localStorage is per-browser, per-device — not shareable
- 5MB limit becomes a constraint as conversations grow
- No server-side query capability (e.g., "find all sessions where I discussed tool failures")
- Inconsistent with the production-quality architecture already established with Postgres

**Why Postgres:**
- Consistent with the existing 3-store architecture
- `chat_messages.report JSONB` column stores the full AnalysisReport per message —
  means loading a past session restores not just text but full structured analysis cards
- `latency_ms FLOAT` column added simultaneously — tracks end-to-end response time per query,
  giving a performance signal visible both in the UI and queryable in Supabase

---

## Phase 4: Langfuse Tracing Gap — 2026-04-25 (Session 9)

### The Problem
The LangGraph analysis pipeline (`POST /api/chat`, `POST /api/chat/freeform` diagnostic path)
made real LLM calls but none appeared in Langfuse. Only the Demo Agent endpoints were traced.

### Root Cause
`_make_langfuse_handler()` was defined in `demo.py` as a private function. The `chat.py` endpoints
called `analysis_graph.ainvoke()` without any `config={"callbacks": [...]}` — so LangChain's
callback propagation mechanism never fired.

### Decision: Extract shared utility + wire into all ainvoke calls

**Chosen:** `backend/app/utils/langfuse_utils.py` with `make_langfuse_handler()` imported by both `demo.py` and `chat.py`.
Pass handler in `config` dict to every `ainvoke()` call. Flush after each call.

**Why a shared utility (not import from demo.py):** Importing from `demo.py` would create a circular
dependency risk and wrong semantics — Langfuse initialization is a utility, not a demo concept.

**Stats/list paths:** These make no LLM calls. They are correctly NOT traced in Langfuse.
structlog captures any failures with `request_id` for correlation. This is the right tool boundary:
Langfuse = LLM observability, structlog = general application observability.

---

## Testing Strategy — Evolved Over Sessions

### Initial state
6 basic tests covering the ingest endpoint.

### Session 4 growth
26 tests: 7 integration tests (one per proposal requirement) + 7 Langfuse adapter unit tests.
Pattern established: each new major component gets isolated unit tests + at least one integration test.

### Session 9 addition: Intent classification tests
`tests/test_freeform_intents.py` — 35 unit tests covering all 7 classification functions.
**Why these were critical:** The "who am i" → irrelevant tool_misfire response bug would have been
caught immediately by a test like `assert not _has_failure_keywords("who am i")`. The absence of
tests let the bug reach production. The test file was written immediately after the fix to prevent regression.

**Testing principle established:** Any routing or classification logic that touches user input
MUST have unit tests.

### Session 10: Test coverage trade-off — pattern functions replaced by LLM

When `_handle_stats`, `_handle_list`, and all keyword-matching functions (`_is_followup`,
`_has_failure_keywords`, `_query_intent`, `_classify_query`, `_context_from_history`) were
replaced by `_llm_route` (text-to-SQL), their unit tests were removed. Test count: 49 → 32.

**Why accepted:** The deleted functions encoded brittle patterns that were themselves the source
of bugs (wrong ordering, wrong defaults). Testing brittle patterns gives false confidence.
`_llm_route` correctness is validated through integration testing (manual chat sessions).

**Known gap:** There are no automated tests for `_llm_route` SQL generation. An LLM response
change could silently break routing. Mitigated by: the SQL safety check (`SELECT` only),
the second LLM format call, and the conversation history mechanism that surfaces actual values.

---

## Abuse Protection — 2026-04-25 (Session 9)

### Decision: Custom middleware over slowapi

**Chosen:** `RateLimitMiddleware` — a custom Starlette middleware using in-memory sliding windows  
**Rejected:** `slowapi` (the standard FastAPI rate-limiting library)

**Why not slowapi:** slowapi requires adding `request: Request` as the first parameter to every
rate-limited endpoint function. This would have required modifying every endpoint signature and was
invasive. The custom middleware applies globally without touching individual route functions.

**Trade-off acknowledged:** In-memory sliding window resets on restart. For a production system with
multiple processes or replicas, a Redis-backed rate limiter would be necessary. For a single-process
Render deployment this is appropriate.

**Sanitization approach:** `sanitize_input()` in `app/utils/sanitize.py` runs at the API boundary
(chat endpoint, demo endpoint) before any LLM call. Uses regex pattern matching for injection
attempts + HTML escape for XSS prevention. Output disclaimer ("AI-generated analysis. Verify before
acting on any diagnosis.") present in the Chat Debug UI as required by proposal Section 14.

---

## DataExpert.io Anthropic Proxy — SSE Incompatibility — 2026-04-26 (Session 13)

### The Problem
`synthesize.py` was crashing with `AttributeError: 'str' object has no attribute 'model_dump'`
inside `langchain_anthropic._format_output`. The synthesis node ran (Claude was reached) but the
response could not be parsed.

### Root Cause
The DataExpert.io proxy at `/api/v1/anthropic` **always returns `text/event-stream` (SSE)** regardless
of whether the request asks for streaming or not. `langchain_anthropic` (non-streaming path) calls
`self._async_client.messages.create()` and expects an `anthropic.types.Message` Pydantic object back.
Instead it got a raw SSE string. When it then called `data.model_dump()` on the string, Python raised
`AttributeError`.

### Investigation Path (all dead ends before the fix)

| Approach | Result |
|---|---|
| `ChatOpenAI` with `model="claude-sonnet-4-6"` on `/openai` endpoint | `"Only GPT-4 models allowed through this proxy"` |
| `ChatAnthropic` without `base_url` (direct Anthropic API) | Still hit proxy — `langchain_anthropic` reads `ANTHROPIC_BASE_URL` env var automatically even without explicit kwarg |
| Raw HTTP probe to `/messages` | 404 — SDK appends `/v1/messages` |
| Raw HTTP probe to `/v1/messages` | 200 `text/event-stream` — confirmed always-streaming proxy |

### Decision: `streaming=True` on `ChatAnthropic`
**Chosen:** Add `streaming=True` to the `ChatAnthropic` constructor. This switches `langchain_anthropic`
to its SSE parser code path (`_astream`), which correctly handles the proxy's streaming response.
`ainvoke()` still returns a single `AIMessage` — streaming is a wire-level detail only.

**Why not switch to GPT-4o-mini permanently:** Claude Sonnet 4.6 produces noticeably better synthesis
quality (longer findings, more precise root cause, higher confidence calibration). The proxy IS compatible
once the streaming flag is set — no reason to downgrade permanently.

**Fallback retained:** `_invoke_llm()` in `synthesize.py` still tries Claude first, falls back to
GPT-4o-mini if Claude fails for any reason. The two-LLM chain adds ~0 latency when Claude succeeds.

---

## Retrieve Node Singleton Bug — 2026-04-26 (Session 13)

### The Problem
Every call to `vector_retrieve` and `graph_traverse` logged warnings:
- `vector_retrieve_failed: 'EmbeddingService' object has no attribute 'embed'`
- `graph_traverse_failed: 'Neo4jService' object has no attribute 'execute_read'`

The pipeline continued (both nodes catch exceptions and return empty results), but retrieval evidence
was always empty — reranking had nothing to work with.

### Root Cause
`retrieve.py` was importing the *class* and instantiating **new objects per call**:
```python
embedding_svc = EmbeddingService()   # driver=None, never initialized
neo4j_svc = Neo4jService()           # driver=None, never initialized
```
The module-level singletons (`embedding_service`, `neo4j_service`, `pinecone_service`) are initialized
once in the FastAPI lifespan hook. Per-call instantiation bypasses initialization entirely.

Additionally, two method names were wrong: `embed()` (doesn't exist) and `execute_read()` (doesn't exist).
`PineconeService.query()` also didn't exist — the correct method is `query_similar()`, which also handles
embedding internally (making the separate embed step redundant).

### Decision: Use singletons, add `execute_read`, simplify Pinecone call
- `retrieve.py` now imports and uses `embedding_service`, `neo4j_service`, `pinecone_service` singletons
- `execute_read(query, params)` added to `Neo4jService` — runs a read-only Cypher query via the driver session
- `vector_retrieve` now calls `pinecone_service.query_similar(query_text, ...)` directly — one call instead of embed + query
- `HAS_TOOL_CALL` / `HAS_LLM_CALL` removed from graph traverse Cypher — these relationship types were never created during seeding; Neo4j emitted DBMS warnings on every query

---

## Chat Conversation Quality — 2026-04-26 (Session 13)

### Problem 1: Diagnostic redirect guard fired on data-result session IDs
After a SQL data query returned a session list (e.g., `**Session ID:** 217fa0a...`), asking any
follow-up question would trigger the "I can see session X was mentioned earlier, please diagnose it"
redirect — even for unrelated questions like "give me sample queries".

**Root cause:** `_SESSION_ID_RE = re.compile(r"\b[0-9a-f]{32}\b")` matched any 32-char hex string,
including session IDs in data result listings. Data results bold the label (`**Session ID:**`) but
not the hex value. Aethen's conversational session references bold the ID itself (`**217fa0a...**`).

**Fix:** Regex changed to `\*\*([0-9a-f]{32})\*\*` — only matches bold-wrapped IDs.

### Problem 2: Redirect guard blocked legitimate follow-up explanations
"Explain this failure to a 10-year-old" (after a diagnostic already ran) incorrectly triggered
the redirect because `_looks_like_analysis()` matched "this failure" in the LLM's explanation.

**Fix:** Added `_history_has_diagnostic(session_id, history)` — if any prior assistant message
contains the session ID AND diagnostic signals ("root cause", "confidence", "findings"), the guard
is skipped. The LLM's explanation IS grounded in prior analysis already in the conversation.

### Problem 3: Stats repeated in every response
The system prompt injects current session counts on every request. The LLM echoed them in
nearly every general response regardless of relevance — even when the user explicitly said
"you already told me about the number of sessions".

**Fix:** GENERAL intent rules updated with explicit no-repetition instruction, proportional
response length guidance, and concrete sample query examples for "what can I ask" queries.

### Problem 4: `content` empty in DB for all assistant messages
Frontend created analysis entries as `{ content: "", report: {...} }`. The UI rendered correctly
(reads `report.summary`) but the DB `content` column was always empty, making it unqueryable.
`buildHistory` also appended `" Root cause: "` (with empty value) to all general responses,
polluting the LLM's conversation context.

**Fix:** `content: report.summary ?? ""` on save. `buildHistory` only appends root cause when
`confidence > 0` and `root_cause` is non-empty.

---

## Architecture Summary: Current State

```
                    ┌─────────────────────────────────┐
                    │        Next.js 14 Frontend        │
                    │  /  /traces  /chat  /demo-agent  │
                    │  /memory-debug /tool-misfire etc  │
                    └──────────────┬──────────────────┘
                                   │ BFF (Next.js API routes)
                                   ▼
                    ┌─────────────────────────────────┐
                    │         FastAPI Backend           │
                    │  Rate limit → Sanitize → Route   │
                    └──┬──────────┬────────────┬──────┘
                       │          │            │
              ┌────────▼───┐ ┌────▼────┐ ┌────▼──────┐
              │  Postgres  │ │  Neo4j  │ │  Pinecone  │
              │  Supabase  │ │  Graph  │ │  Vectors   │
              │  sessions  │ │  only   │ │  traces    │
              │  chat_msgs │ │         │ │  namespace │
              └────────────┘ └─────────┘ └───────────┘
                       │
              ┌────────▼────────────────────────────┐
              │        LangGraph Pipeline            │
              │  classify → retrieve → rerank →     │
              │  [memory|tool|hallucination|blind] → │
              │  synthesize (Claude Sonnet 4.6,      │
              │  streaming=True; GPT-4o-mini fallback)│
              └──────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │    Langfuse     │
              │  LLM call trace │
              │  per analysis   │
              └─────────────────┘
```

---

## Two-Tier Freeform Routing Architecture — 2026-04-26 (Session 14)

### The Problem
`_llm_route` was doing two jobs in one LLM call: classify intent AND answer GENERAL queries.
A 300+ line system prompt with rules for every conversational edge case caused gpt-4o-mini to
frequently return plain English instead of JSON → Python fallback fired → same generic stats-dump
response regardless of context. Adding new conversation cases required adding new keyword rules
(whack-a-mole). The guard functions (`_looks_like_analysis`, `_history_has_diagnostic`) used
hardcoded keyword lists that kept generating false positives.

### Decision: Separate classification from answering

**Chosen:**
- `_llm_route` → **classification only** — returns `{intent: data|diagnostic|general}`. Prompt is ~40 lines. Reliable JSON output. Does not answer anything.
- `_handle_general()` → **focused conversational responder** — minimal prompt (7 lines) + full history. Purpose-aware persona enforces the domain boundary. No rules needed — LLM intelligence handles recall, frustration, social acks, off-topic redirects, pronoun resolution naturally.
- `_handle_general` returns `{"type":"answer","text":"..."}` or `{"type":"diagnose","session_id":"..."}` — the `DIAGNOSE:` signal enables implicit consent: when a user says "yes please" to a prior diagnostic offer, `_handle_general` recognises this from context and returns the signal; `freeform_query` routes to the full pipeline.

**Rejected:**
- Regex pre-classifier for "conversational" queries — the user explicitly asked for LLM intelligence, not pattern matching
- Listing specific affirmative words ("yes", "go ahead", "sure") for implicit consent — same reason
- Adding more rules to the existing `_llm_route` system prompt — the root cause was too many rules, not too few

**Why this matters:**
The purpose boundary is now enforced by the LLM's persona understanding ("your sole purpose is AI agent failure analysis"), not by maintaining a list of blocked topics. Any future edge case is handled by the LLM's natural intelligence rather than requiring a code change.

---

## SQL Security Layer + Schema Accuracy — 2026-04-26 (Session 14)

### Problems Found via Aethen Self-Analysis
Running Aethen's failure taxonomy against its own chat behaviour revealed:

| Failure type | What happened |
|---|---|
| **Memory Retrieval Failure** | `_llm_route` generated `COUNT(*)` for "average per day" — retrieved wrong SQL pattern from its knowledge; correct pattern is `AVG(daily_count)` |
| **Hallucination** | Format LLM received the total count (404) and labelled it "average per day is 404" — confident wrong claim not grounded in actual calculation |
| **Tool Misfire** | `GROUP BY day` alias fails in PostgreSQL — 0 results returned; `outcome = 'failed'` documented incorrectly (actual value is `'failure'`) |
| **Blind Spot** | Trend queries ("increasing/decreasing over time") routed to `_handle_general` which said "I don't have data on trends" — data existed, wrong path |

### Decisions

**`_validate_sql()`** — security validation in code, not prompt. Blocks `session_data`, system tables, DDL tokens, `SELECT *`. Enforced in code so even if the LLM ignores prompt instructions, the validation catches it.

**Multi-statement split** — if the LLM generates semicolon-separated statements despite instructions, split and validate each. Prevents the `"cannot insert multiple commands into a prepared statement"` asyncpg error.

**Schema correction** — `outcome TEXT ('failure'|'success')` corrected in the routing prompt. The mislabeled value (`'failed'`) caused every failure-filtered query to return 0 rows.

**Trend routing** — added "trend", "over time", "increasing/decreasing", "by day/week/month" to DATA intent triggers so these queries generate SQL instead of hitting the general handler.

---

---

## Phase 4: Langfuse Data Quality — Python Repr in Prompts — 2026-04-26 (Session 10)

### The Problem
When Langfuse traces were pulled, `prompt` and `response` fields in `LLMCall` objects contained
raw Python repr strings like `{'role': 'user', 'content': '...'}` instead of plain text.
Root cause: LangChain's `CallbackHandler` serialises messages in LangChain's own format
(e.g. `{"type": "HumanMessage", "data": {"content": "..."}}` or `{"kwargs": {"content": "..."}}`),
which the original `_extract_text` function didn't handle — it returned the raw string.

Additionally, Aethen's own LangGraph analysis traces (with `run_name="aethen-analysis-*"`) were
being processed as regular agent traces, resulting in the full LangGraph `AgentState` dict being
stored as the LLM call `prompt` — a multi-kilobyte Python repr blob.

### Decision: Multi-layer text extraction + dedicated Aethen trace adapter

**`_extract_text` improvements** — handles 7 formats in priority order:
1. Plain string → return as-is (after JSON string check)
2. JSON string starting with `[` or `{` → parse and recurse
3. Standard OpenAI message dict: `{"role": "user", "content": "..."}`
4. LangChain `data`-wrapped: `{"type": "HumanMessage", "data": {"content": "..."}}`
5. LangChain `kwargs`-wrapped: `{"id": [...], "kwargs": {"content": "..."}}`
6. Nested `messages` list: `{"messages": [...]}`
7. LangChain batch output: `{"generations": [[{"text": "..."}]]}`

**`_adapt_aethen_trace`** (new method) — when trace name starts with `"aethen-"`:
- Extracts original session being analyzed from trace `input` (`{"session": {...}}`)
- Extracts analysis report from trace `output` (`{"report": {"summary": "...", "root_cause": "..."}}`)
- Builds ONE clean `LLMCall`:
  - `prompt`: "Analyzing session X / Agent Y / Issue: ..." — plain English
  - `response`: analysis summary + root cause + confidence
- All Aethen traces display identically to regular agent traces in `SessionContext`

**Frontend `extractPlainText`** — client-side safety net for old Postgres data:
- JSON.parse → Python repr conversion (`'` → `"`, `True/False/None`) → regex content extraction
- If all parsing fails → returns `""` so UI shows "Not captured" instead of raw blob

---

## Phase 4: Text-to-SQL for Chat Debug — 2026-04-26 (Session 10)

### The Problem
The freeform chat used hardcoded handlers (`_handle_stats` with `COUNT(*)` and `_handle_list`
with `ORDER BY created_at DESC`) that could not handle nuanced queries:
- "show me the **oldest** tool misfire" → returned **newest** (hardcoded DESC)
- "how many good traces?" → wrong handler, defaulted to tool_misfire count
- "what is the timestamp for that session?" → no mechanism to surface timestamps
- LLM confabulated explanations when it couldn't access the actual data

This was discovered via the recursive self-analysis scenario — Aethen's own Chat Debug
exhibited Memory Retrieval (wrong data), Hallucination (fabricated explanation), and Blind
Spot (couldn't surface timestamps) failures simultaneously.

### Decision: Replace fixed handlers with LLM-generated SQL

**Chosen:** `_handle_text_to_sql()` — LLM writes the SQL query at runtime. `_llm_route`
returns `{"intent": "data", "sql": "SELECT ..."}`. The SQL is executed against Postgres and
a second LLM call formats the raw rows as plain English with actual values included.

**Rejected:**
1. **Extend pattern matching** — adding more keyword patterns for "oldest", "timestamps", etc.
   Rejected: fragile, requires predicting every user phrasing. Each edge case needs a new pattern.

2. **Parameterized query templates** — fixed SQL with dynamic parameters. Rejected: cannot
   handle arbitrary user intent (GROUP BY, date ranges, multi-condition filters, etc.).

**Why text-to-SQL works here:**
- The schema is simple and stable (one `sessions` table, ~8 columns)
- Read-only SELECT enforced by code — no write risk
- LLM correctly maps "oldest" → `ORDER BY ASC`, "latest" → `ORDER BY DESC` without any patterns
- The two-stage approach (SQL + format) ensures actual values (timestamps, IDs) appear in the
  response, making follow-up questions answerable from conversation history

**Safety constraint:** `if not sql.strip().upper().startswith("SELECT"): raise ValueError()`

---

## Phase 4: classify_intent Always Uses LLM — 2026-04-26 (Session 10)

### The Problem
`classify_intent` short-circuited when `session.failure_type` was already set:
```python
if session.failure_type and session.failure_type != FailureType.UNKNOWN:
    return {"failure_type": session.failure_type}  # skips LLM
```
This caused two bugs:
1. Seeded sessions were correctly typed but freeform queries that inherited a wrong default
   (`tool_misfire`) would never be re-classified
2. Langfuse-pulled sessions where `_infer_failure_type` guessed wrong would propagate the
   wrong type through the entire analysis pipeline

### Decision: LLM always classifies from evidence

**Chosen:** Remove the short-circuit entirely. The LLM reads actual session evidence —
retrieval scores, tool call statuses, LLM prompt/response content — and determines the type.
Pre-set labels are only used as a fallback when LLM parse fails.

**Added to evidence:** `lc.prompt[:300]` and `lc.response[:300]` for each LLM call.
This allows hallucination detection from content even when `hallucination_flag=False`
(e.g., LLM says "based on the documents" but sources=none).

**Trade-off:** One additional LLM call per analysis (~200ms). Accepted: accuracy of
classification is more important than saving one GPT-4o-mini call.

---

## Chat Follow-up Bug: Ungrounded Analysis + Session Context Loss — 2026-04-26 (Session 12)

### The Problem

Analysis of a real chat session (`cs-69016bf50565`) revealed that **none of the four
assistant responses ever ran the LangGraph pipeline**. Every stored report had
`failure_type: unknown`, `confidence: 0`, `findings: []` — the hollow defaults produced
by the `"general"` and `"data"` paths.

The failure sequence:
1. User asked *"what is the most recent failure trace"* → `"data"` path (text-to-SQL) →
   correctly returned session `217fa0a232da75a60d64a31c10166f57` as a `tool_misfire` ✅
2. User asked *"what do you understand from this failure"* → `"general"` path → LLM
   generated *"This could involve errors in the tool call, timeouts, permission errors..."*
   with no grounding in the actual session. **This is a hallucination** — Aethen described
   a session it never read. ❌
3. Session context was never bound: after step 1 surfaced a specific session_id, there was
   no mechanism to carry it into the next diagnostic question.

### Root Causes

1. **`_llm_route` prompt did not instruct the LLM to extract session_ids from history** —
   so "what do you understand from this failure" was classified as `"general"` instead of
   `"diagnostic"` with the referenced session_id.
2. **Diagnostic path used failure_type for session lookup, not session_id** — even if
   `"diagnostic"` had fired, it would have fetched a random recent `tool_misfire` session
   rather than `217fa0a232da75a60d64a31c10166f57`.
3. **`"general"` path had no guard** — it allowed the LLM to generate analysis-sounding text
   for specific sessions it never analyzed.

### Decision: Three-fix approach in `backend/app/api/chat.py`

**Fix 1 — `_extract_session_id_from_history()` helper** — scans assistant messages newest-first
for a 32-char hex session ID using regex. Returns the most recently mentioned one.

**Fix 2 — Updated `_llm_route` prompt** — adds an explicit instruction: when the history
references a specific session_id AND the query asks to understand/analyze it, return
`{"intent":"diagnostic","failure_type":"...","session_id":"<id from history>"}`.

**Fix 3 — Diagnostic path uses referenced session_id** — when `route_result` contains a
`session_id`, fetch that exact session from Postgres via `postgres_service.get_session()`
instead of the failure_type-based random fetch. Falls back to existing logic if not found.

**Fix 4 — General path guard** — if `_extract_session_id_from_history` finds a session_id
in context AND the LLM-generated answer contains analysis-sounding language, replace the
answer with a redirect: *"I found session X — ask me to diagnose it for a grounded analysis."*

**Why not just improve `_llm_route` alone:**
The LLM might still misclassify some follow-ups. The helper + guard provide defence in depth:
the helper catches session_ids deterministically (regex, not LLM), and the guard catches
cases where the LLM falls through to `"general"` with analysis-sounding text.

---

## Classification Architecture Audit — 2026-04-26 (Session 12)

### Finding: Three overlapping failure-type classification layers

A thorough audit of the failure type classification pipeline revealed three separate layers:

1. `_infer_failure_type()` in `backend/app/providers/langfuse_provider.py` — heuristic keyword matching at ingestion time (tags → trace name → content → structural signals)
2. `classify_intent()` in `backend/app/agents/nodes/classify.py` — LLM-based evidence classification, always runs first in the graph
3. `_llm_route()` in `backend/app/api/chat.py` — intent router for freeform chat; picks `failure_type` for Postgres session filtering

**Layer 1 (`_infer_failure_type`) — mostly dead in the analysis pipeline:**
- Result stored in Postgres `sessions.failure_type` column
- `classify_intent` always overwrites it (LLM runs unconditionally — Session 10 decision)
- One real dependency: `retrieve.py:76` uses `session.failure_type` for Neo4j pattern matching before classification state is written
- Narrow value: pre-labels sessions for UI display before a full analysis has run

**Layer 3 (`_llm_route`) — useful for filtering, redundant for classification:**
- The `failure_type` it returns is used for Postgres session filtering (correct use)
- That value is then passed into the graph where `classify_intent` re-classifies from evidence (redundant, accepted)

**Efficiency vs accuracy trade-off:**
- Heuristic (Layer 1): zero API cost, microseconds, moderate accuracy
- LLM (Layer 2): GPT-4o-mini cost per analysis run, ~200ms latency, high accuracy
- Current design pays LLM cost on every run, even for correctly pre-labeled sessions

### Decision: Keep current architecture; document roles clearly

Reverting to a short-circuit in `classify_intent` would re-introduce the wrong-classification bugs fixed in Session 10. The LLM always classifying from evidence is load-bearing.

Layer 1 (`_infer_failure_type`) is kept because:
- It gives sessions a display label before any analysis runs
- `retrieve.py:76` depends on it for Neo4j pattern matching at retrieval time
- Removing it would show `UNKNOWN` everywhere until analysis completes

**Potential future optimization:** Conditional LLM skip when heuristic confidence is provably HIGH (e.g., explicit failure-type tags, not just keyword guesses). Not implemented — premature at current scale.

---

## LangGraph Analysis Guard — No-Evidence Short-Circuit — 2026-04-30 (Session 18)

### The Problem
Sending a simple greeting ("hi") to the Demo Agent produced a full LangGraph analysis report
with high-severity findings about "critically low similarity scores" and "duplicate chunk retrieval."
The session had zero tool calls, zero retrieval events, and no failure signals — yet the pipeline
ran, pulled cross-session synthetic data from Pinecone, and synthesis fabricated findings from it
as if they belonged to the current session.

### Root Cause
The retrieve nodes (`vector_retrieve`, `graph_traverse`) run unconditionally and query Pinecone/Neo4j
regardless of whether the current session has any failure evidence. With no session-specific data,
synthesis has nothing to ground its findings in — it writes its report entirely from cross-session
retrieval results, presenting them as findings about a session they don't belong to.

### Decision: API-level guard in `POST /api/chat` before LangGraph is invoked

**Chosen:** `_has_analyzable_evidence(session)` check at the API boundary. Returns False only when
ALL of the following are true: `failure_type=None`, `outcome != 'failure'`, `tool_calls=[]`,
`retrieval_events=[]`. If False, return a clean "no failure signals" report immediately — LangGraph
is never invoked, zero LLM cost, zero latency.

**Rejected:**
- Short-circuiting inside LangGraph (adds complexity to the graph logic)
- Synthesis prompt constraint ("only use session-specific evidence") — LLMs are hard to constrain reliably
- UI-level filtering only — still allows the API to be called with bad data

**Guard truth table — verified against all session types:**

| Session type | tool_calls | retrieval_events | failure_type | outcome | Guard result |
|---|---|---|---|---|---|
| Greeting ("hi") | 0 | 0 | None | success | ⛔ skip — "no failure signals" |
| Tool misfire (PermissionError) | 1 (failed) | 0 | tool_misfire | success | ✅ analyze |
| Tool misfire (ConnectionError) | 1 (failed) | 0 | tool_misfire | success | ✅ analyze |
| Memory (billing, low scores) | 0 | 1 | memory | success | ✅ analyze |
| Hallucination (PKCE, high scores) | 0 | 1 | None | success | ✅ analyze |
| Blind spot (scenario button, scripted) | 0 | 0 | blind_spot | success | ✅ analyze (failure_type set) |
| Hallucination (scenario button, scripted) | 0 | 0 | hallucination | success | ✅ analyze (failure_type set) |
| Success baseline (ticket created) | 1 (success) | 0 | None | success | ✅ analyze (has tool_calls) |
| Seeded synthetic sessions | varies | varies | set | success | ✅ analyze |

**Why `failure_type` alone isn't sufficient:** Demo agent tool misfire sessions have `failure_type=tool_misfire`
set by the heuristic — but `tool_calls=[]` in Postgres because Phase 1 runs without Langfuse callbacks.
The guard correctly passes these via the `failure_type` branch. Future sessions from real agents that DO
have structured tool call observations are covered by the `tool_calls` branch.

**Implementation:** `backend/app/api/chat.py` — `_has_analyzable_evidence(session)` helper before
the Langfuse handler and LangGraph invocation. Returns a static `AnalysisReport` with
`failure_type=UNKNOWN, confidence=1.0, findings=[]` for clean sessions.

---

---

## Sessions 28+ — SaaS Transformation & Performance Optimisation

### SaaS Auth System (Session 28)
- **Supabase Auth**: email/password + Google + GitHub OAuth
- **Multi-tenant**: `organizations` + `profiles` tables; `org_id` FK on all data; RLS; trigger auto-creates org+profile on signup
- **JWT middleware**: Supabase auth API verification, 60s token cache, replaces global API key
- **Admin user**: `ADMIN_EMAILS` env var — bypasses org scoping, sees all data including `org_id=NULL` legacy rows
- **Public Demo Agent**: `/demo-agent` public route; 10-message limit; no Postgres writes for unauthenticated users
- **Session timeout modal**: 15-minute inactivity warning with countdown

### LLM API Keys Per Org (Session 28)
- `POST/GET/DELETE /api/settings/llm-keys` — Fernet-encrypted per-org OpenAI/Anthropic keys
- `contextvars.ContextVar` (`_org_llm_ctx`) threads org credentials through LangGraph without changing node signatures
- Model availability gated: `GET /api/settings/models` filters to providers with configured keys (env var fallback for admin only)

### LangGraph Pipeline Optimisation — CRITICAL DECISION (Session 28)

**Problem**: Analysis pipeline took 22-30s.

**Root cause**:

| Step | Time | Issue |
|------|------|-------|
| classify_intent | ~2s | Sequential — blocking retrieval start |
| vector_retrieve + graph_traverse | ~3s | Parallel with each other, not with classify |
| rerank (Cohere) | ~1s | — |
| analysis module LLM | ~8s | Full prompt per failure type |
| synthesize LLM | ~8s | Second full round-trip |
| **Total** | **~22s** | |

**Solution** — three independent changes, all validated by evals before promoting:

1. **Parallel classify + retrieve** — `parallel_start` entry node fans out to `classify_intent`, `vector_retrieve`, `graph_traverse` simultaneously → saves ~2s
2. **`skip_graph` flag** — `AgentState["skip_graph"] = True` short-circuits `graph_traverse` → saves ~3s when no cross-session Neo4j history
3. **`fast_analyze` node** (`app/agents/nodes/fast_analyze.py`) — merges analysis module + synthesize into one LLM call → saves ~8-12s

**Optimised timings**:

| Step | Time |
|------|------|
| parallel: classify + vector + graph | ~3s |
| fast_analyze | ~6-8s |
| **Total** | **~9-12s** |

**Two compiled graph singletons**:
- `analysis_graph` = `build_optimized_analysis_graph()` — default for all production paths
- `fast_analysis_graph` = `build_fast_analysis_graph()` — Demo Agent only (classify → vector → fast_analyze, no Cohere)
- `_legacy_analysis_graph` = `build_analysis_graph()` — original pipeline, kept for rollback

**Eval validation** (ran before promoting):
- Classification accuracy: **100%** (unchanged)
- LLM judge score: **85.56%** (up from 83% — combined prompt more precise)
- Decision: **PROMOTED** ✓

**Key lesson**: Splitting analyze→synthesize added latency without quality gains. A single combined prompt is faster AND scores higher — the judge rewards concise, evidence-grounded root causes.

### Rule-Based Confidence Scorer (Session 28) — CRITICAL DECISION

**Problem**: `AnalysisReport.confidence` was LLM self-reported. LLMs are poorly calibrated, non-deterministic, and produce uncalibrated noise. Same session could return 0.72 then 0.91 on re-run.

**Solution**: `app/agents/nodes/confidence.py` — `compute_confidence(session, failure_type, llm_confidence)`.

- **Deterministic base score** — measurable trace signals with explicit weights (see signal table in `aethen_internal_flow.md` Part 6)
- **LLM adjustment** — `(llm_score − 0.5) × 0.15` → max ±0.075 secondary only
- **Final** — `clamp(base + adj, 0.05, 0.95)`
- **4 bugs fixed**: actual_doc_ids=[] was silent; partial overlap treated same as full miss; hallucination count not proportional; SUCCESS-status timeout was ignored
- **Tests**: 40 unit tests — determinism, clamping, ordering guarantees
- **Eval**: 100% accuracy · 84.44% judge · PASSED

**Remaining gap**: Weights are heuristics, not learned. True production requires labeled outcomes → calibrated logistic regression → Platt scaling → feedback loop.

### Async Backfill Endpoint (Session 28)
- `POST /api/backfill` — background job for bulk historical import (handles 100K+ traces)
- Processes 200 traces/chunk, skips LangGraph analysis (store raw → diagnose on demand)
- `GET /api/backfill/{job_id}` polls progress; `DELETE` cancels; jobs expire after 2 hours

---

## Decisions Still Open / To Monitor

| Decision | Status | Notes |
|----------|--------|-------|
| Deployment (Render + Vercel) | **Not done — final step** | Config exists; needs ENV vars filled |
| Claude direct API key | Not set | GPT-4o-mini used via proxy |
| Pinecone namespaces (chunks, tool_calls) | Only `traces` seeded | 1,100 vectors meet rubric minimum |
| Multi-process rate limiting | In-memory only | Redis needed for horizontal scale |
| Neo4j free tier limits | Not hit | 500 sessions well within limits |

---

## Key Lessons for Future Agents Working on This Project

1. **Postgres is the source of truth.** Neo4j is graph-only. Do not query Neo4j for counts or session data.

2. **Use text-to-SQL for all data queries in Chat Debug.** Do NOT add keyword pattern matching back. The `_llm_route` returns `"data"` intent with SQL — handle it in `_handle_text_to_sql`.

3. **classify_intent always uses the LLM.** The short-circuit was removed. Do not add it back. The LLM reads evidence; pre-set labels are a fallback only.

4. **The Aethen self-analysis scenario** (`docs/scenarios/aethen_self_analysis.md`) is the strongest evaluator demo. Aethen's own Chat Debug failures (wrong ordering, confabulation, missing data) map exactly to Memory Retrieval, Hallucination, and Blind Spot.

5. **All LangGraph `ainvoke()` calls must pass Langfuse config.** Use `make_langfuse_handler()` from `app/utils/langfuse_utils.py`.

6. **Claude Sonnet 4.6 is wired for synthesis** via the Anthropic proxy (`get_anthropic_llm()` in `app/agents/llm.py`). Model name: `claude-sonnet-4-6`. The API key is a proxy key. Falls back to GPT-4o-mini if no Anthropic key is set. Never instantiate LLM clients directly — always use the factory.

7. **Update this document** whenever a significant decision is made.

8. **`_infer_failure_type` in `langfuse_provider.py` is intentionally kept** as a display pre-label and `retrieve.py` fallback. It is NOT authoritative — `classify_intent` always overwrites it during analysis. Do not remove it without also fixing `retrieve.py:76`.

9. **Aethen reads traces, not the agent's KB — this is the fundamental epistemic constraint.** Classification is structural inference, not domain verification:
   - Tool misfire: unambiguous (explicit status + error message)
   - Blind spot: near-certain (chunks_returned=0)
   - Memory: accurate when `expected_doc_ids` is populated; heuristic (score threshold) when not
   - Hallucination: surface comparison of LLM output vs retrieved `doc_content` — false positives expected when LLM uses correct training knowledge not in retrieved docs
   - Score threshold of 0.5 is universal — not calibrated per agent domain
   
   **`expected_doc_ids` is the highest-value instrumentation an agent team can provide.** It converts memory classification from score-based inference (confidence ~0.30) to doc ID mismatch confirmation (confidence ~0.58). Agent integration guides should make this explicit.

10. **"Signal amplifier" is the correct framing.** Aethen surfaces patterns that warrant investigation — it does not render authoritative verdicts on domain correctness. Findings with confidence < 0.5 mean "investigate this" not "this is definitively broken."
