# Aethen-AI — Session Progress & Continuity Log

> **Purpose**: Track development progress across AI agent sessions. Update this file at the end of every session.
>
> **Last updated**: 2026-04-29 (Session 17)

---

## How to Use This File

When starting a new session with any AI agent (AdaL, Claude Code, Cursor, etc.):
1. Point the agent to this file: "Read `docs/adal/session_progress.md` and continue from where we left off."
2. The agent will pick up from the **Current State** section below.
3. At the end of each session, ask the agent to update this file.

---

## Current State

- **Phase**: Week 3 — Final polish + Deployment.
- **Branch**: `main`
- **Next action**:
  1. **🔴 Re-seed database** — All stores still wiped (Postgres, Neo4j, Pinecone). Run: `cd backend && poetry run python scripts/reset_and_reseed.py`. Must do before deploying or demoing.
  2. **🔴 Clear remaining Langfuse traces** — 48 traces were pending rate-limit reset (~2026-04-29 20:01 UTC). Rate limit has now likely reset. Run: `cd backend && poetry run python scripts/clear_langfuse.py`
  3. **Deploy** — Render (backend) + Vercel (frontend). Configs exist (`render.yaml`, `vercel.json`, `Dockerfile`). Add `CRON_SECRET` env var to Vercel.
  4. **Record demo GIF** for README/submission.
- **Tests**: 32 passing (backend), frontend source unchanged and clean.
- **Stores**: 🔴 ALL WIPED (2026-04-28) — Postgres empty, Neo4j empty, Pinecone empty. Re-seed before use.
- **Demo Agent chat**: One Langfuse trace per turn. Real tools (`update_user_record` → PermissionError, `query_database` → ConnectionError, `search_knowledge_base` → wrong docs, `create_support_ticket` → success). Agent loop runs without callbacks; one final `llm.invoke()` with callback creates the trace. Prompt and failure_type correctly captured.
- **Langfuse adapter**: `_extract_human_prompt` and `_extract_tool_call_response` added. Synthetic LLMCall created from trace-level data when SDK observations have no input/output.
- **Repo**: Cleaned — 20 dev scripts + `blind spot.png` moved to `delete-later/` (gitignored). `.gitignore` updated with `fix_*.py`, `update_*.py`, `refactor_*.py`, `sync_*.py`, `frontend/*.png`, `.claude/settings.local.json`.

### Architecture (as of Session 10)

Three clearly separated data stores — each owns a distinct responsibility:

| Store | Role | Library |
|-------|------|---------|
| **PostgreSQL / Supabase** | Agent session CRUD + chat session history — single source of truth | `asyncpg` |
| **Neo4j Aura** | Graph structure only — nodes + relationships for cross-session traversal | `neo4j` driver |
| **Pinecone** | Embedded trace vectors — semantic search | `pinecone` |

**Why not the old in-memory store?** It was volatile (wiped on every restart). PostgreSQL via Supabase is the production-grade replacement. Stats now come from Postgres (primary) not Neo4j.

---

## Completed Work

### Session 17 — 2026-04-29 (Claude Code)

**RAG improvements, Demo Agent overhaul, Langfuse trace fixes, repo cleanup**

**Committed Session 15+16 work:**
- [x] All uncommitted changes (19 files, 1,624 insertions) pushed — `8f8b8d9`

**Chat Debug — general handler scope fix:**
- [x] `_handle_general` system prompt: replaced example-based off-topic rule with blanket
  prohibition — math, arithmetic, geography, science, trivia never answered

**RAG improvements (all 5 action items R1–R5):**
- [x] R1: `vector_retrieve` — failure-type-aware query phrases replace naive pipe-join
  (memory/tool_misfire/hallucination/blind_spot each get targeted semantic string)
- [x] R2: `rerank._evidence_to_documents` — all 5 graph result types now produce
  content-bearing strings (was count-only strings Cohere could not score)
- [x] R3: rerank query is failure-type-aware (replaces generic session-ID-prefixed query)
- [x] R4: `rerank_complete` log — added `min_score`, `avg_score`, `above_threshold`
- [x] R5: cross-session evidence moved to TOP of all 4 analysis node prompts
  (primes LLM with cross-session patterns before current session trace)

**UI fix:**
- [x] U2: prominent backdrop-blur analyzing overlay on all 4 module pages
- [x] U3: confirmed already done — SessionsList has full search + date filter

**Documentation created:**
- [x] `docs/adal/llm_usage_map.md` — full LLM usage diagram + model table
- [x] `docs/adal/rag_analysis.md` — RAG rating (6.5/10), strengths, weaknesses, diagram
- [x] `docs/adal/token_usage_analysis.md` — token breakdown script + results for diagnostic path
- [x] `docs/scenarios/demo_agent_guide.md` — prompts for each failure scenario + full demo flow

**Demo Agent — real tool calls:**
- [x] 4 `@tool` functions in `demo.py`: `search_knowledge_base` (wrong docs), `update_user_record`
  (PermissionError), `create_support_ticket` (success), `query_database` (ConnectionError)
- [x] Agent loop (Phase 1) runs WITHOUT Langfuse callbacks — no multi-trace problem
- [x] ONE final `llm.invoke(final_messages, config=invoke_config)` (Phase 2) creates exactly
  ONE Langfuse trace per turn with correct user prompt and final response
- [x] `tool_misfire` failure_type correctly inferred from response text

**Langfuse adapter fixes (`backend/app/providers/langfuse_provider.py`):**
- [x] `_extract_human_prompt` — handles OpenAI wire format, LangChain constructor format,
  and `{"messages": [...], "tools": [...]}` dict format. Walks list in reverse to find
  `role:user` message, skipping tool schemas and tool results.
- [x] `_extract_tool_call_response` — detects `content=null + tool_calls=[...]` output
  and synthesizes `"Called tool: name(args)"` instead of raw dict dump
- [x] `trace_input` in `adapt_trace` now uses `_extract_human_prompt` (was `_extract_text`)
  so even the trace-level fallback correctly extracts the user question
- [x] Synthetic `LLMCall` created from trace-level `input`/`output` when SDK
  `observations.get_many()` returns observations with `input=None` (v4.5.1 SDK limitation)

**Root cause found for Langfuse prompt display bug:**
- Langfuse SDK v4.5.1 `ObservationV2.model_dump()` returns `input=None, output=None`
  for observations from `client.observations.get_many()`. The trace-level `input` (which
  DOES have data) was being processed by `_extract_text` which returned the last non-empty
  message content — the tool schema dict `{'type': 'function', ...}`.

**Repo cleanup:**
- [x] 20 root-level dev scripts + `frontend/blind spot.png` moved to `delete-later/` (gitignored)
- [x] `.gitignore` updated: `delete-later/`, `fix_*.py`, `update_*.py`, `refactor_*.py`,
  `sync_*.py`, `frontend/*.png`, `.claude/settings.local.json`
- [x] Commit: `427d1a8 clean up folders and files`

**Standing instructions added:**
- Demo chat: agent loop always in Phase 1 (no callbacks), Phase 2 single traced call
- `_extract_human_prompt` must handle `{"messages": [...], "tools": [...]}` dict input
- Do NOT use `create_trace_id()` + `trace_context` approach — executors don't propagate it
- Langfuse SDK v4.5.1 `observations.get_many()` never has input/output — always use trace-level fallback

### Session 16 — 2026-04-28 (Claude Code)

**UI Overhaul + Chat Quality + Langfuse Infrastructure**

**All diagnostic pages — layout redesign:**
- [x] All 4 module pages (memory-debug, tool-misfire, hallucination-rca, blind-spots) now use `grid xl:grid-cols-12` — SessionsList in sticky left column (`xl:col-span-4`), analysis in right column (`xl:col-span-8`)
- [x] "Select a session to begin" empty state on ALL pages — shows immediately on load with page-specific icon
- [x] Run Analysis button moved into the analysis card header — no longer below the session list
- [x] Clicking a session no longer auto-triggers analysis — button required (consistent UX)

**Trace Explorer — full rewrite to match module pages:**
- [x] Same left/right grid layout as module pages
- [x] Analysis card at top of right panel (metrics header + 2-col summary/findings) — matches hallucination-rca style
- [x] Session info integrated into analysis card header — no separate session card above analysis
- [x] Run Full Analysis button in analysis card header
- [x] Separate execution timeline removed (was duplicating SessionContext)
- [x] Sort fixed: `COALESCE(session_ts, created_at) DESC` in `_SELECT_SUMMARIES` + `_SELECT_BY_TYPE` — displayed timestamp matches sort order
- [x] Timestamps changed from relative ("3h ago") to actual ("Apr 28, 03:58") on all session cards
- [x] Date filter added to Trace Explorer and SessionsList component

**Blind Spots page cleanup:**
- [x] Removed hardcoded placeholder content (ClusterNode visualization, "Billing Policies", "14 FAILED QUERIES", "pro-rated refunds" fake data)
- [x] Replaced with same clean card structure as other pages (metrics header + 2-col summary/findings)
- [x] Removed unused ClusterNode, FindingDetails components and selectedFinding state

**Demo Agent improvements:**
- [x] Free-form chat: markdown rendering (`renderContent` — paragraphs, bullet lists, numbered lists, bold) on assistant messages
- [x] Free-form chat: auto-scroll to bottom on new messages (`messagesEndRef` + `useEffect`)
- [x] Shorter, cleaner placeholder text in chat input

**Langfuse infrastructure:**
- [x] `aethen-*` internal traces now skipped during Langfuse pull — they no longer appear in Trace Explorer alongside real agent sessions
- [x] `fetch_traces` now paginates through multiple pages (not just first batch) and accepts `since: datetime` for incremental pull
- [x] Incremental pull watermark: `app_settings` Postgres table stores `langfuse_last_pull_at`; pull endpoint reads/writes watermark so only NEW traces are fetched each time
- [x] Vercel Cron: `vercel.json` cron config + `/api/cron/pull-langfuse` Next.js route — auto-pulls every 5 min post-deploy. Set `CRON_SECRET` env var in Vercel for auth.

**failure_type write-back:**
- [x] After LangGraph analysis completes, `update_failure_type()` writes the classified type back to Postgres — sessions now appear on the correct module page after first analysis run

**Chat Debug quality:**
- [x] Chat box height reduced (`h-[calc(100vh-9rem)]` from `h-[calc(100vh-5rem)]`)
- [x] format LLM in `_handle_text_to_sql` now receives conversation history — prevents contradicting prior statements
- [x] `format_system` prompt instructs LLM to reconcile with prior conversation context rather than ignore it
- [x] **All freeform chat functions switched from GPT-4o-mini → Claude Sonnet 4.6** (`get_anthropic_llm` in `chat.py`) — better SQL generation, intent inference, and context-aware responses. GPT-4o-mini fallback still fires if Anthropic proxy unavailable.

**Data clearance (2026-04-28):**
- [x] All stores wiped: Postgres (sessions, chat, demo tables), Neo4j (all nodes/relationships), Pinecone (traces + failure_patterns namespaces)
- [x] Langfuse: 49 of 97 traces deleted before rate limit (50/day). 48 remaining — delete tomorrow when limit resets.
- [x] Database is empty — must re-seed before demo or deployment

**Standing instructions added:**
- Chat routing uses Claude Sonnet 4.6 (`get_anthropic_llm`) — do NOT revert to `get_openai_llm` in `chat.py`
- `app_settings` table holds `langfuse_last_pull_at` watermark — do not truncate this table when clearing data
- Vercel Cron requires `CRON_SECRET` env var set in Vercel dashboard

### Session 15 — 2026-04-28 (Claude Code)

**Adapter Enrichment + Demo Agent Persistence + Trace Explorer Sort**

**LangfuseTraceAdapter enrichment (`backend/app/providers/langfuse_provider.py`):**
- [x] `_is_langchain_document()` + `_extract_langchain_documents()` — handles LangChain `VectorStoreRetriever` output format `{"page_content": "...", "metadata": {"source": "...", "score": 0.87}, "type": "Document"}`. Integrated as first extraction path in `_to_retrieval_event` before generic dict parsing. Fixes `relevance_scores=[]` and `actual_doc_ids=[]` on real LangChain agent traces.
- [x] `_parse_dt()` helper — extracted from `_calc_latency`, shared timestamp parser.
- [x] `_link_retrieval_to_llm()` — temporal linking: for each `LLMCall` with empty `source_documents`, finds all `RetrievalEvent` objects whose `endTime ≤ llm_call.startTime` and backfills `source_documents` from their `actual_doc_ids`. Fixes hallucination heuristics firing as false positives (grounding-without-sources check now correctly distinguishes real hallucinations from cases where sources were retrieved but not logged in the generation span).
- [x] `adapt_trace` collects `obs_timestamps: dict[obs_id → (start_dt, end_dt)]` in the observation loop, then calls `_link_retrieval_to_llm` before failure type inference.

**Langfuse v4 CallbackHandler fix (`backend/app/utils/langfuse_utils.py`):**
- [x] Root cause found: `CallbackHandler.__init__` in Langfuse v4.5 only accepts `public_key` and `trace_context` — NOT `user_id` or `session_id`. Passing unknown kwargs threw `TypeError` caught by the outer `except Exception`, returning `(None, None)` → `langfuse_traced=False` on all messages.
- [x] Fix: `make_langfuse_handler()` reverted to `CallbackHandler()` with no kwargs.
- [x] `user_id` and `session_id` now passed correctly via LangChain invoke config `metadata["langfuse_user_id"]` and `metadata["langfuse_session_id"]` — the Langfuse v4 documented mechanism.
- [x] Applied to both `run_demo_scenario` and `demo_chat` endpoints in `demo.py`.

**Demo Agent naming fixes (`backend/app/api/demo.py`):**
- [x] `run_name` fixed: was `f"demo-chat-{session_id}"` → doubled "demo-chat-demo-chat-..." → now `"demo-agent-chat"` (static, descriptive).
- [x] `agent_id` now shows "Demo Agent" in Trace Explorer (set via `metadata["langfuse_user_id"]` → `trace.userId` → adapter reads `trace.get("userId")`).
- [x] `failure_summary` for unclassified demo traces → "Demo Agent — Free Form Chat" (was "Demo Chat Demo Chat 9Abfc3F3").

**Demo Agent session persistence (new feature):**
- [x] New Postgres tables: `demo_chat_sessions` + `demo_chat_messages` — separate from Chat Debug's `chat_sessions`/`chat_messages`. Demo Agent = agent under test traces; Chat Debug = Aethen's own diagnostic conversations. Tables auto-created in `_create_schema()`.
- [x] `postgres_service.py` — 5 new methods: `create_demo_session`, `list_demo_sessions`, `get_demo_messages`, `append_demo_message`, `update_demo_session_title`.
- [x] `demo.py` `POST /api/demo/chat` — accepts `session_id` from frontend (None on first turn → backend creates session → returns session_id). Saves user + assistant turns to Postgres. `langfuse_traced BOOLEAN` column records whether each message was produced by an active Langfuse handler.
- [x] New endpoints: `GET /api/demo/sessions`, `GET /api/demo/sessions/{id}/messages`.
- [x] `frontend/src/lib/api.ts` — added `DemoSession`, `DemoStoredMessage` types; `listDemoSessions()`, `getDemoMessages()`; `sendDemoChat` now accepts `sessionId`.
- [x] `frontend/src/app/(dashboard)/demo-agent/page.tsx` — left session list panel (past chats, relative timestamps, message counts), "New" button, stable `activeSessionId` state, message history restored from Postgres on session click.

**Trace Explorer sort fix:**
- [x] `_SELECT_SUMMARIES` sort changed from `ORDER BY created_at DESC` to `ORDER BY COALESCE(session_ts, created_at) DESC` — displayed timestamp (`session_ts`) now matches sort order (`created_at` was the ingestion time, creating a mismatch).
- [x] Relative timestamps added to each session card ("just now", "3m ago", "2h ago") using `session_ts`.

**Key lesson (standing instruction):**
- Langfuse v4 `CallbackHandler` constructor only accepts `public_key` and `trace_context`. Set `user_id`/`session_id`/`tags` via LangChain invoke config `metadata`: `{"langfuse_user_id": "...", "langfuse_session_id": "..."}`.

### Session 14 — 2026-04-26 (Claude Code)

**Chat Architecture Overhaul + SQL Security + Self-Analysis**

**Two-tier freeform routing architecture (`chat.py`):**
- [x] `_llm_route` rewritten as **classification-only** — no longer answers GENERAL queries inline. Returns `{intent: data|diagnostic|general}` only. System prompt stripped from ~300 lines to ~40 lines — much more reliable JSON output, fewer fallback fires
- [x] `_handle_general()` added — **focused conversational handler** with purpose-aware persona. Handles all GENERAL queries: recall, frustration, off-topic, social acks, pronoun resolution, capability questions. No keyword rules — LLM intelligence within a clear persona boundary
- [x] `_handle_general` returns `{"type":"answer","text":"..."}` OR `{"type":"diagnose","session_id":"..."}` — the `DIAGNOSE:` signal enables implicit consent routing: when the user accepts a prior diagnostic offer ("yes please", "go ahead"), `_handle_general` detects this from conversation context and triggers the full pipeline automatically
- [x] Removed all hardcoded keyword/signal guards (`_looks_like_analysis`, `_history_has_diagnostic`, `_ANALYSIS_SIGNALS`, `_DIAGNOSTIC_COMPLETE_SIGNALS`) — replaced by `_handle_general` persona instruction: "do not produce diagnostic analysis without the pipeline"
- [x] `_SESSION_ID_RE` changed to `\*\*([0-9a-f]{32})\*\*` — only matches bold session IDs (Aethen's conversational references), not session IDs in data result listings

**SQL security + reliability (`chat.py`, `_handle_text_to_sql`):**
- [x] `_validate_sql()` — blocks `session_data`, system tables (pg_catalog, information_schema), DDL tokens, `SELECT *`
- [x] Multi-statement SQL safety: splits on semicolons, executes each separately, each validated individually
- [x] LIMIT notification: detects `LIMIT N` on row-returning queries and passes a note to the format LLM so users know results may be truncated
- [x] Schema fix: `outcome TEXT ('failure'|'success')` — was documented as `'failed'`; LLM was generating `WHERE outcome = 'failed'` which returned 0 rows
- [x] DATA intent expanded: trend/time-series queries ("increasing/decreasing over time", "by day/week") now correctly route to SQL instead of GENERAL handler
- [x] PostgreSQL aggregation guidance added: correct `GROUP BY DATE(session_ts)` pattern, CTE usage for multi-part queries, UNION ALL instead of semicolons
- [x] `_ALLOWED_COLUMNS`, `_BLOCKED_TOKENS`, `_LIMIT_RE`, `_IS_AGGREGATE_RE` constants added

**Chat conversation quality (accumulated fixes):**
- [x] Routing prompt: DIAGNOSTIC rule updated — "diagnose the latest X" always routes DIAGNOSTIC not DATA; conversational recall ("what did we discuss about X") always routes GENERAL not DIAGNOSTIC
- [x] `_handle_general` system prompt: formatting instructions followed/acknowledged; purpose boundary enforced; no sycophantic openers; proportional response length
- [x] GENERAL fallback response improved — no longer dumps stats count; gives actionable one-liner
- [x] Adversarial inputs (`sanitize_input` HTTPException) now return proper `ApiResponse` message instead of empty response
- [x] Empty/whitespace-only input guard added before any LLM call

**Aethen self-analysis testing:**
- [x] Ran systematic self-test across all 4 failure types (memory, hallucination, blind spot, tool misfire)
- [x] Confirmed: `outcome = 'failed'` schema bug caused tool misfire (0 results); trend routing was a blind spot; GROUP BY alias was a tool misfire. All fixed
- [x] Created `docs/scenarios/chat_self_test_questions.md` — 20 concrete test questions (5 per failure type) with notes on what to watch for and known issues log
- [x] Replayed all 7 existing chat sessions (57/57 turns) against new architecture — 0 issues

### Session 13 — 2026-04-26 (Claude Code)

**Pipeline Bug Fixes + Claude Proxy Fix + Chat Quality**

**Pipeline bugs in `retrieve.py` (all nodes were silently failing):**
- [x] `vector_retrieve`: was instantiating `new EmbeddingService()` (uninitialized) and calling non-existent `embed()` → fixed to use `pinecone_service` singleton and `query_similar()` (which handles embedding internally — no separate embed step needed)
- [x] `graph_traverse`: was instantiating `new Neo4jService()` (driver=None) and calling non-existent `execute_read()` → fixed to use `neo4j_service` singleton; added `execute_read()` method to `Neo4jService`
- [x] Removed `HAS_TOOL_CALL` / `HAS_LLM_CALL` OPTIONAL MATCH clauses from graph traverse Cypher query — these relationship types were never seeded in the DB; Neo4j was emitting DBMS warnings on every query
- [x] Added traceback logging to `freeform_query_failed` error handler (previously only logged `str(exc)`, making root-cause analysis impossible)

**Claude synthesis fix (`synthesize.py` + `llm.py`):**
- [x] Root cause identified: DataExpert.io Anthropic proxy **always returns SSE (`text/event-stream`)** regardless of whether streaming was requested. `langchain_anthropic._format_output` calls `data.model_dump()` expecting an `anthropic.types.Message` Pydantic object, but received a raw SSE string → `'str' object has no attribute 'model_dump'`
- [x] Investigation path: Option A (ChatOpenAI + `/openai` endpoint with claude model) → rejected: proxy returns `"Only GPT-4 models allowed"`. Direct Anthropic API without base_url → rejected: still hits proxy via `ANTHROPIC_BASE_URL` env var. Solution: `streaming=True` on `ChatAnthropic` — langchain_anthropic's SSE parser correctly handles the proxy's always-streaming response
- [x] `synthesize.py` refactored: `_extract_content()` helper, `_invoke_llm()` with Claude → GPT-4o-mini fallback chain

**Chat conversation quality fixes (`chat.py` + frontend `page.tsx`):**
- [x] `_SESSION_ID_RE` changed from `\b[0-9a-f]{32}\b` to `\*\*([0-9a-f]{32})\*\*` — only match session IDs Aethen explicitly bolded. Data query results bold the label (`**Session ID:**`) but not the hex value; conversational references bold the ID itself. Prevents SQL result IDs from triggering the diagnostic redirect guard
- [x] Added `_history_has_diagnostic()` — skips the ungrounded-analysis guard when a prior completed diagnostic for that session already exists in the conversation history (enables follow-up questions like "explain to a 10-year-old" without being redirected to "diagnose it first")
- [x] Updated GENERAL intent system prompt: no repeating stats already in history; proportional response length; explicit guidance for "give me sample questions" queries
- [x] Frontend: `content: report.summary ?? ""` instead of `content: ""` when saving assistant messages — DB content column now populated; previously all assistant messages had empty content
- [x] Frontend `buildHistory`: only appends `Root cause:` for real analysis responses (confidence > 0 and root_cause non-empty) — eliminates `" Root cause: "` noise in LLM history context for conversational/general responses

### Session 12 — 2026-04-26 (Claude Code)

**Classification Architecture Audit + Development Continuation**

- [x] **Architectural audit**: Mapped all three failure-type classification layers — `_infer_failure_type` (heuristic ingestion), `classify_intent` (LLM, authoritative), `_llm_route` (chat routing)
- [x] **Finding**: `_infer_failure_type` is dead in the analysis pipeline (always overwritten by `classify_intent`) but has two valid uses: UI display pre-label + `retrieve.py:76` Neo4j pattern matching hint
- [x] **Finding**: `_llm_route` failure_type is correctly used for Postgres session filtering; the redundant re-classification by the graph is accepted (not worth optimizing)
- [x] **Efficiency insight**: Heuristic (Layer 1) is zero-cost + instant; LLM (Layer 2) costs per-run. Current design pays LLM unconditionally — correct tradeoff given Session 10's accuracy requirement
- [x] **A15 added to action_items.md**: Add inline comments clarifying `_infer_failure_type` narrow role and `retrieve.py:76` dependency
- [x] Updated `docs/implementation_timeline.md` — Classification Architecture Audit section added
- [x] Updated `docs/adal/session_progress.md` — instruction #11 expanded with three-layer context

- [x] **Chat session audit**: Analyzed session `cs-69016bf50565` — found all 4 responses used `"general"`/`"data"` paths, never LangGraph. "What do you understand from this failure" hallucinated analysis without running the pipeline. Root cause: `_llm_route` didn't extract session_ids from history; no follow-up→diagnostic handoff.
- [x] **A16**: Fixed `backend/app/api/chat.py` — added `_extract_session_id_from_history()`, updated `_llm_route` prompt, diagnostic path uses referenced session_id, general path guard against ungrounded analysis.
- [x] **A10**: Created `.github/workflows/ci.yml` (backend pytest + frontend type-check + build). Added `type-check` script to `frontend/package.json`. Committed rules/ implementation-status tables.
- [x] **A12**: Added `loading.tsx` skeleton screens for `(dashboard)/`, `(dashboard)/traces/`, `(dashboard)/chat/`.
- [x] **A13**: Dashboard auto-refreshes stats every 60s (silent — no spinner flash on interval).
- [x] **S3**: Created `docs/EVALUATOR_GUIDE.md` — 5-step walkthrough for evaluators.
- [x] All changes pushed to main.

### Session 11 — 2026-04-26 (AdaL)

**Mid-Development Review & Action Items Sprint**

- [x] Full review of all 19 markdown files + codebase structure + git status
- [x] Created `docs/adal/mid_dev_review.md` — comprehensive project assessment
- [x] Created `docs/adal/action_items.md` — 14 prioritized action items + 6 suggestions
- [x] **A1**: Committed 40+ uncommitted files into 8 logical conventional commits, pushed to GitHub
- [x] **Gitignore audit**: Added `.render_cache/`, `assets/`, `backend/.env`, `.env.local`
- [x] **A2**: Wired Claude Sonnet 4.6 (`claude-sonnet-4-6`) for synthesis via Anthropic proxy in `get_anthropic_llm()`, GPT-4o-mini fallback. Updated README, CLAUDE.md, implementation_timeline.
- [x] **A3**: Replaced `frontend/README.md` boilerplate with Aethen-specific content (tech stack, 9 pages, project structure, scripts, env vars)
- [x] **A4**: Added "Implementation Status" tables to all 4 rules files (`testing.md`, `frontend.md`, `git.md`, `backend.md`) — honest accounting of what's implemented vs. deferred
- [x] **UI Polish**: Upgraded Header (command palette button with ⌘K badge), Sidebar (gradient logo, ChevronsUpDown on user profile), Dashboard (skeleton loaders replacing `—` placeholders), removed default Next.js SVGs from `public/`
- [x] **A5**: Added `@model_validator` to `Settings` in `config.py` — fails fast on missing required env vars
- [x] **A7**: Created `frontend/src/app/(dashboard)/error.tsx` — global error boundary with retry
- [x] **A8**: Added `fetchWithRetry()` to `lib/api.ts` — 3 retries, exponential backoff (1s/2s/4s), retries on 5xx/429/network errors
- [x] **A9**: Installed Vitest + React Testing Library, created `page.test.tsx` and `api.test.ts` (3 tests passing), fixed `<div>` in `<p>` hydration warning, added `test` and `type-check` scripts
- [x] **A11**: Created `docs/scope_adjustments.md` — transparent delta between proposal and implementation (13 implemented, 3 simplified, 5 deferred, 5 architectural pivots)

**Not committed (resume here)**:
- [ ] `.github/workflows/ci.yml` — created locally, needs `git add && commit && push` (A10)
- [ ] `frontend/package.json` — `type-check` script added, needs committing with A10

### Session 10 — 2026-04-26

**Chat Debug — Text-to-SQL freeform queries**
- [x] Replaced `_handle_stats` + `_handle_list` with `_handle_text_to_sql` — LLM writes SQL at runtime
- [x] `_llm_route` now returns `"data"` intent with a SQL query, `"diagnostic"`, or `"general"`
- [x] Database schema exposed to LLM in prompt (sessions table, column semantics, ordering rules)
- [x] Two-stage response: LLM generates SQL → execute → second LLM call formats results as plain English with actual values (timestamps, session IDs) included — so follow-up questions are answerable from history
- [x] Safety: only `SELECT` permitted; `ValueError` raised on any non-SELECT query
- [x] Fixes: "oldest" / "newest" ordering, confabulation, timestamps not surfaced, wrong default categorisation

**classify_intent — LLM always determines failure type**
- [x] Removed short-circuit (`if session.failure_type → return early`) — LLM ALWAYS classifies from evidence
- [x] Evidence now includes LLM call `prompt` + `response` (truncated 300 chars) — hallucinations detectable from content even when `hallucination_flag=False`
- [x] `CLASSIFY_SYSTEM_PROMPT` improved with concrete observable signals per category (similarity scores, error types, response contradiction patterns)
- [x] Fallback to pre-set type only if LLM parse fails
- [x] `_llm_route` diagnostic prompt updated with clear descriptions of all 4 failure types + "unknown" option
- [x] Freeform diagnostic: when `failure_type=None` (LLM uncertain), session passed to LangGraph without pre-set type — classify_intent determines from content

**Langfuse adapter — clean data for all trace types**
- [x] `_adapt_aethen_trace()` — new method builds clean `LLMCall` for Aethen's own analysis traces:
  - `prompt`: "Analyzing session X / Agent Y / Issue: ..." — plain English
  - `response`: analysis summary + root cause + confidence — plain English
- [x] `_parse_dict()` helper — handles JSON strings, Python repr, plain dicts uniformly
- [x] `_extract_text()` — handles LangChain serialized messages (`type/data/kwargs` formats), JSON strings, Python repr, batch generation output
- [x] `adapt_trace()` — `failure_summary` now uses failure type label + trace name, NOT raw input (prevents prompt=summary duplication)
- [x] All trace types (Demo Agent, Aethen analysis, regular agent) display clean plain English in `SessionContext`

**SessionContext — display improvements**
- [x] `extractPlainText()` — client-side JSON/Python-repr extraction (JSON parse → Python repr conversion → regex content extraction → empty fallback)
- [x] `isInternalState()` — filters LangGraph AgentState blobs from LLM call display
- [x] All sessions (including Aethen analysis traces) use same display path — no special-case views
- [x] LLM calls always show "User Prompt" + "Agent Response" sections (with "Not captured" fallback)

**Operational scripts**
- [x] `scripts/reset_and_reseed.py` — one command to clear Postgres + Neo4j + Pinecone and reseed 500 fresh sessions with guaranteed clean plain-English data
- [x] `scripts/clear_langfuse.py` — delete all Langfuse traces via API (dry-run supported)

**Dead code removed**
- [x] `_handle_stats()` and `_handle_list()` removed from `chat.py` — replaced by `_handle_text_to_sql`; old functions left dangling after routing change, now cleaned up
- [x] `tests/test_freeform_intents.py` reduced from 35 tests to 2 test classes (32 total passing) — keyword-matching functions (`_is_followup`, `_has_failure_keywords`, `_query_intent`, `_classify_query`, `_context_from_history`) were removed when `_llm_route` replaced them. Known coverage gap — see `docs/implementation_timeline.md` Testing section.

**Bug fixes**
- [x] `demo.py` — restored `from app.config import settings` import (accidentally dropped when `_make_langfuse_handler` was extracted)

**Documentation**
- [x] `docs/scenarios/aethen_self_analysis.md` — documents the recursive scenario where Aethen's own Chat Debug failures (wrong ordering → memory, confabulation → hallucination, missing timestamps → blind spot) are correctly classified by Aethen's framework; includes demo script for evaluators

### Session 9 — 2026-04-25

**Chat Debug — Full Implementation**

*Architecture:* 5-way intent routing → meta | conversational | follow-up | stats/list | diagnostic | unclear

- [x] `POST /api/chat/freeform` — 5-way intent routing (see below)
- [x] **Meta intent** — off-topic/identity queries ("who am i", "hello") → canned help response; no LLM call
- [x] **Conversational intent** — queries about the chat history ("what did I ask earlier") → LLM + full history → grounded answer
- [x] **Follow-up intent** — references a previous answer ("out of these, which ones are critical") → inherits failure_type from history, forces diagnostic path
- [x] **Stats intent** — "how many X failures" → Postgres `compute_stats()` directly; no LLM, `confidence=1.0`
- [x] **List intent** — "top 10 tool failures" → real sessions from Postgres; no LLM
- [x] **Unclear guard** — query has no failure keywords and no matching intent → helpful guidance response instead of wrong tool_misfire analysis
- [x] **Diagnostic intent** — genuine failure queries → LangGraph pipeline grounded in real Postgres session
- [x] `HistoryMessage` model + `history: list[HistoryMessage]` in `FreeformRequest`
- [x] Frontend builds and sends history on every request; follow-ups automatically inherit context
- [x] Plain-text rendering: `confidence=0.0 + findings=[]` → renders as text bubble (not AnalysisCard)
- [x] Live elapsed timer during processing (100ms tick, shows `0ms → 2.4s`)
- [x] Text selection fixed: `style={{ userSelect: "text" }}` inline override on all bubbles
- [x] `CopyButton` component on hover for every message (user, assistant, analysis)
- [x] `tests/test_freeform_intents.py` — 35 unit tests covering all 7 classification functions; 61/61 total passing

**Chat Session Persistence**
- [x] `chat_sessions` + `chat_messages` Postgres tables (auto-created + idempotent migration for `latency_ms`)
- [x] `postgres_service.py` — 5 chat session methods: create, list, get messages, append message, rename
- [x] `backend/app/api/chat_sessions.py` — 5 REST endpoints (POST/GET/PATCH sessions, POST/GET messages)
- [x] Sessions panel in Chat Debug UI (left column): list past sessions, New Chat button, click to restore
- [x] Auto-save every message to Postgres (user + analysis + assistant)
- [x] Auto-name session from first 60 chars of first user message
- [x] `latency_ms FLOAT` column on `chat_messages` — tracks end-to-end response time per query
- [x] Latency badge on analysis messages: `2.3s` or `450ms`; persisted in DB; restored when loading session

**Langfuse wired into LangGraph pipeline**
- [x] `backend/app/utils/langfuse_utils.py` — shared `make_langfuse_handler()` extracted from demo.py
- [x] `demo.py` updated to import from shared util (removed duplicate)
- [x] `POST /api/chat` — Langfuse `CallbackHandler` passed into `ainvoke()` config; traces named `aethen-analysis-{session_id}`
- [x] `POST /api/chat/freeform` diagnostic branch — Langfuse traces named `aethen-freeform-{failure_type}`
- [x] Stats/list freeform paths: no LLM calls → no Langfuse trace (correct; structlog covers failures)

**Dashboard — all items clickable**
- [x] Total Traces card now links to `/traces` (was `href: null`)
- [x] Reliability gauge: Successful/Failures boxes → `/traces`; each failure bar → its module page
- [x] Failure Distribution chart: bars link to `/traces`; "View all →" link added to header
- [x] Recent Alerts: all 4 alerts are real `<Link>` elements (Tool Misfire → `/tool-misfire` etc.)
- [x] Dead `MoreHorizontal` button replaced with "Data Quality →" link

**Reliability Score gauge on dashboard**
- [x] `reliability_score: int` field added to `DashboardStats` (backend + frontend type)
- [x] Formula: `round(100 × (total − failed) / total)`, clamped 0–100
- [x] SVG semi-circle gauge with smooth CSS transition; color-coded green/amber/rose
- [x] Breakdown panel: Successful vs Failures count cards + per-type proportional bars

**Stats endpoint → Postgres primary**
- [x] `GET /api/stats` now reads from Postgres (not Neo4j) — fixes 1000 vs 500 discrepancy caused by double Neo4j seeding
- [x] Neo4j removed from stats entirely; its role is strictly graph traversal

**Neo4j sync utility**
- [x] `scripts/sync_neo4j_from_postgres.py` — wipes Neo4j and rebuilds from Postgres; `--dry-run` flag
- [x] Run after any Postgres re-seed to keep graph in sync; Neo4j is always rebuildable

**Production Architecture: PostgreSQL/Supabase + Neo4j (graph only) + Pinecone**
- [x] `backend/app/services/postgres_service.py` — connection pool, auto schema, CRUD, stats
- [x] `backend/app/store.py` — stripped to analysis report cache only (`_reports`)
- [x] `backend/app/api/sessions.py` — reads exclusively from postgres_service
- [x] `backend/app/api/ingest.py` — saves to Postgres on every ingest
- [x] `backend/app/api/langfuse.py` — saves to Postgres on every Langfuse pull
- [x] `backend/app/api/stats.py` — Postgres primary, Neo4j removed
- [x] `backend/app/main.py` — postgres_service init/close in lifespan
- [x] `neo4j_service.py` — session-query workaround methods removed; graph-only
- [x] `scripts/seed_neo4j.py` — now seeds both Neo4j and Postgres in one pass
- [x] `backend/.env.example` — created, documents DATABASE_URL with Supabase instructions

**Abuse Protection (proposal Section 14)** ✅
- [x] `backend/app/utils/sanitize.py` — `sanitize_input()`: 500-char limit, 10 blocked patterns (prompt injection, XSS, jailbreak), HTML-escape
- [x] `backend/app/utils/rate_limit.py` — `RateLimitMiddleware`: sliding-window 20 req/min + 100 req/hr per IP, X-Forwarded-For aware, /health excluded
- [x] Rate limiter wired into `main.py` before CORS
- [x] Sanitization applied in `chat.py` (failure_summary) and `demo.py` (message)
- [x] Output disclaimer added to Chat Debug page

**New pages: Trace Explorer + Chat Debug**
- [x] `frontend/src/app/(dashboard)/traces/page.tsx` — session browser, search, failure-type filter, execution timeline, run-analysis
- [x] `frontend/src/app/(dashboard)/chat/page.tsx` — chat interface, suggested queries (LangGraph), freeform (grounded), evidence panel, copy buttons
- [x] Sidebar updated with Trace Explorer (`Eye`) + Chat Debug (`MessageSquare`)
- [x] `api.ts` — `fetchAllSessions()`, `fetchSession()`, `sendFreeformQuery()`, `sendFreeformQuery(history)`

### Session 8 — 2026-04-25

**Production Architecture decision + docs**
- [x] Identified root cause of dashboard/module-page inconsistency
- [x] Decided on 3-store production architecture
- [x] Updated `CLAUDE.md` tech stack + data store responsibility matrix
- [x] `backend/.env.example` — DATABASE_URL documented

### Session 7 — 2026-04-24

**Demo Agent UI Planning & Foundation + Dashboard/Module Fixes**

**Dashboard fixes**
- [x] Added missing Hallucination card to dashboard (was missing despite data being present)
- [x] Made all 4 module cards clickable — each navigates to the relevant module page via `next/link`
- [x] Fixed grid layout to `xl:grid-cols-5` for 5 cards (Total Traces + 4 modules)

**Real Langfuse session wiring across module pages**
- [x] Updated `store.save_session()` to persist full session payload (not just failure_type + timestamp)
- [x] Added `store.get_by_failure_type()` and `store.get_all_session_summaries()` helpers
- [x] Created `backend/app/api/sessions.py` — `GET /api/sessions?failure_type=X` returns full session objects for re-analysis
- [x] Registered sessions router in `main.py`
- [x] Added `fetchSessionsByType()` to `frontend/src/lib/api.ts`
- [x] Created `frontend/src/components/features/SessionsList.tsx` — shared component showing real Langfuse sessions; clicking one triggers full LangGraph analysis
- [x] All 4 module pages (`/memory-debug`, `/tool-misfire`, `/hallucination-rca`, `/blind-spots`) now show a `SessionsList` panel and run analysis on real traces

**Disabled simulated demo traces from module pages**
- [x] Removed session ID input + Analyze button from all 4 module pages (demo `build*Session` functions kept in `api.ts` for future re-enable)
- [x] Removed unused imports (`Search`, `Button`, `buildXxxSession`) from module pages
- [x] Analysis is now exclusively triggered by clicking a real Langfuse session from the list

**Fixed memory sessions misclassified as tool_misfire**
- [x] Root cause: LangGraph `classify_intent` node was re-classifying sessions from scratch, overriding the failure type already inferred by `LangfuseTraceAdapter`
- [x] Fix: `classify_intent` now short-circuits and returns the pre-set `failure_type` if one is already present on the session (LLM classification only runs for unclassified sessions)

**Demo Agent UI** ✅
- [x] `POST /api/demo/run` — LLM scenario runner with Langfuse tracing
- [x] `POST /api/demo/chat` — free-form multi-turn chat with Langfuse tracing
- [x] `GET /api/demo/scenarios` — scenario list
- [x] `/demo-agent` page — 4 scenario buttons + free-form chat panel, "Traced to Langfuse ✓" badges
- [x] Sidebar updated with Demo Agent under "Live Demo" section

**Pinecone seeding** ✅
- [x] Created `scripts/seed_pinecone.py` — generates 500 sessions and upserts to Pinecone
- [x] Fixed `embedding_service.py` to pass `x-session-id` proxy header
- [x] **1,100 vectors upserted — 0 errors** — rubric ≥1,000 embeddings met
- [x] Namespace: `traces`, Index: `aethen-traces`

**Data Quality Checks** ✅
- [x] `GET /api/qc/report` — full automated quality report across all 4 sources
  - Source 1 (Agent Traces): schema validation + completeness check
  - Source 2 (Vector DB): coverage ≥1,000 vectors + namespace population
  - Source 3 (Tool Calls): per-tool error rate (>10% flag) + latency outliers (>3σ)
  - Source 4 (User Feedback): session coverage + label distribution bias
- [x] `/data-quality` frontend page — collapsible source cards, status badges, formatted report text
- [x] Sidebar updated with Data Quality under "System" section

### Session 6 — 2026-04-24

**Langfuse v4 Fixes & Local Testing**
- [x] Fixed hydration mismatch — added `suppressHydrationWarning` to `<html>` in `layout.tsx`
- [x] Fixed langfuse v4 incompatibilities in `demo_agent.py`:
  - Import path: `langfuse.callback` → `langfuse.langchain`
  - Initialization: use `Langfuse(...)` client + `langfuse_client.flush()` instead of `handler.flush()`
  - Tags: pass via LangChain `config={"tags": ..., "run_name": ..., "metadata": ...}` instead of `handler.tags`
- [x] Fixed `langfuse_provider.py` for SDK v4:
  - Replaced `Langfuse.fetch_traces()` (removed in v4) with `LangfuseAPI` REST client (`client.trace.list()`, `client.observations.get_many()`)
  - Added `_to_dict()` helper for Pydantic model serialization
- [x] Extended `_infer_failure_type` — added trace name scan + content-based keyword inference as fallback when tags are missing
- [x] Extended `app/store.py` — added `save_session()` and `compute_stats()` for in-memory session tracking
- [x] Wired `save_session()` into Langfuse pull endpoint so ingested sessions are counted in dashboard
- [x] Updated stats endpoint to read from in-memory store when Neo4j unavailable
- [x] Dashboard Pull Langfuse button now shows success/empty/error feedback
- [x] Installed `langchain` base package (required by `langfuse.langchain`)

**Known issue**: Langfuse v4 tags may not be attached to traces via LangChain config — content inference is the active fallback. Verify by re-running demo_agent + Pull Langfuse next session.

### Session 5 — 2026-04-24

**Polish & Deployment**
- [x] Dark mode toggle — installed `next-themes`, created `ThemeProvider` wrapper, added `Sun/Moon` toggle to Header (hydration-safe, defaults to dark)
- [x] QC persistence layer — created `app/store.py` (in-memory `dict[session_id → AnalysisReport]`); `/api/chat` saves every result; `/api/qc` aggregates real failure distribution, avg confidence, high-severity count, top root causes
- [x] Vercel deployment config — `vercel.json` at repo root (`rootDirectory: frontend`, pnpm build)
- [x] Render deployment config — `backend/render.yaml` (Blueprint, free tier, Docker, health check), Dockerfile updated to use `${PORT:-8000}` for Render compatibility; replaced Fly.io (required credit card)
- [x] README — full project README with architecture diagram, quick-start, env vars, API table, deployment instructions, tech stack

**Test Results**: 26 passed (unchanged), frontend builds clean

### Session 4 — 2026-04-24

**Langfuse Live Integration (Phase 1 — Core Feature)**
- [x] Added Langfuse config to `app/config.py` — `langfuse_public_key`, `langfuse_secret_key`, `langfuse_host`
- [x] Added Langfuse env vars to `.env.example`
- [x] Created `app/providers/` package with provider abstraction layer:
  - `base.py` — `TraceProvider` abstract base class with `fetch_traces()` and `health_check()`
  - `synthetic.py` — `SyntheticProvider` generates test traces across all 4 failure types
  - `langfuse_provider.py` — `LangfuseProvider` pulls live traces + `LangfuseTraceAdapter` transforms Langfuse format → Aethen `Session`
- [x] `LangfuseTraceAdapter` maps: GENERATION → LLMCall, SPAN → ToolCall, retrieval-keyword observations → RetrievalEvent
- [x] Heuristic failure type inference from tags, failed tools, empty retrievals, mismatched doc IDs
- [x] Created `app/api/langfuse.py` — `POST /api/langfuse/pull` (fetch + adapt + ingest) and `GET /api/langfuse/health`
- [x] Created `scripts/demo_agent.py` — LangChain agent instrumented with `langfuse.callback.CallbackHandler` (4 scenarios)
- [x] Installed `langfuse` package via Poetry

**Integration Tests (Phase 2 — 7 per proposal + bonus)**
- [x] `test_full_memory_pipeline` — end-to-end with mismatched retrieval docs
- [x] `test_full_tool_misfire_pipeline` — with failed tool call trace
- [x] `test_full_hallucination_pipeline` — with flagged LLM response
- [x] `test_full_blind_spot_pipeline` — with empty retrieval results
- [x] `test_classify_routes_correctly` — all 4 failure types route correctly
- [x] `test_synthesis_fallback` — graceful degradation with empty findings
- [x] `test_api_chat_returns_envelope` — validates `{data, error}` envelope shape
- [x] 7 bonus `TestLangfuseTraceAdapter` unit tests — GENERATION→LLMCall, SPAN→ToolCall, failed tools, retrieval mapping, tag inference, failure heuristics, clean trace

**Dashboard & UI (Phase 3)**
- [x] Created `app/api/stats.py` — `GET /api/stats` endpoint with Neo4j aggregation (graceful fallback to zeros)
- [x] Added `fetchDashboardStats()` and `pullLangfuseTraces()` to `frontend/src/lib/api.ts`
- [x] Rewired dashboard page (`page.tsx`) — live stats from `/api/stats`, "Pull Langfuse" button, refresh, error handling
- [x] Bar chart driven by real `daily_counts` data, alerts show actual failure counts

**Test Results**: 26 passed (12 existing + 7 integration + 7 adapter unit), 0 failures
**Frontend Build**: Clean (`pnpm build` ✅)

### Session 3 — 2026-04-24

**Pipeline Fix & Frontend Wiring**
- [x] Diagnosed synthesize node crash: `langchain_anthropic` incompatible with DataExpert.io Anthropic proxy format
- [x] Fixed `get_anthropic_llm()` in `app/agents/llm.py` — uses `gpt-4o-mini` via OpenAI proxy (Claude blocked by proxy policy)
- [x] Fixed `synthesize.py` content block extraction — handles TextBlock objects with `.text` attribute + strips markdown fences
- [x] Broadened exception handling in synthesize: `except Exception` ensures report always set
- [x] Tested all 4 failure types end-to-end: memory ✅, tool_misfire ✅, hallucination ✅, blind_spot ✅
- [x] Created `frontend/src/lib/api.ts` — typed API client with `analyzeSession()` + 4 demo session builders
- [x] Wired `/memory-debug` — `"use client"`, controlled input, live results in timeline + findings sidebar
- [x] Wired `/tool-misfire` — waterfall findings, real executive summary + recommendations
- [x] Wired `/hallucination-rca` — live confidence score, findings panel, root cause display
- [x] Wired `/blind-spots` — dynamic cluster details panel, findings from report
- [x] Frontend builds clean (`pnpm build` ✅), TypeScript passes, 12 backend tests passing

**Key Technical Notes**
- DataExpert.io proxy: OpenAI endpoint (`/api/v1/openai`) permits only GPT-4 models; Anthropic endpoint returns non-Anthropic-SDK format
- All synthesis uses `gpt-4o-mini` through the OpenAI proxy — Claude integration requires a different proxy or direct API key
- Demo sessions: each module page sends a pre-built realistic trace to the backend so analysis always produces meaningful output

### Session 2 — 2026-04-24

**LangGraph Analysis Pipeline**
- [x] Installed dependencies: `langgraph`, `langchain-core`, `langchain-openai`, `langchain-anthropic`, `anthropic`, `cohere` (v5.21)
- [x] Created `app/agents/state.py` — shared `AgentState` TypedDict + `AnalysisReport`/`Finding` output models + `ensure_session` helper
- [x] Created `app/agents/llm.py` — shared LLM factory with proxy base URL and session header support
- [x] Created `app/agents/nodes/classify.py` — GPT-4o-mini intent classifier (routes to failure type)
- [x] Created `app/agents/nodes/retrieve.py` — parallel Pinecone vector search + Neo4j graph traversal
- [x] Created `app/agents/nodes/rerank.py` — Cohere Rerank v3.5 with graceful fallback
- [x] Created `app/agents/nodes/memory_debug.py` — memory/retrieval failure analysis
- [x] Created `app/agents/nodes/tool_debug.py` — tool misfire analysis
- [x] Created `app/agents/nodes/hallucination_rca.py` — hallucination root cause analysis
- [x] Created `app/agents/nodes/blind_spot.py` — systemic knowledge gap detection
- [x] Created `app/agents/nodes/synthesize.py` — Claude Sonnet 4.6 final synthesis (GPT-4o-mini fallback)
- [x] Created `app/agents/graph.py` — full LangGraph StateGraph with parallel retrieval, conditional routing

**API Endpoints**
- [x] `POST /api/chat` — primary debug interface, runs full analysis pipeline
- [x] `POST /api/qc` — quality check reporting (placeholder, needs persistence layer)
- [x] Wired new routers into `app/main.py`

**Configuration & Proxy Support**
- [x] Fixed `.env` loading — `dotenv override=True` handles empty shell env vars
- [x] Added `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` support for DataExpert.io proxy
- [x] All nodes use shared `get_openai_llm()` / `get_anthropic_llm()` factory from `app/agents/llm.py`
- [x] Added `x-session-id` header required by DataExpert proxy
- [x] Claude model name: `claude-sonnet-4-6` (not the full dated version)
- [x] Added `ensure_session()` helper to handle LangGraph dict serialization

**Premium Enterprise UI**
- [x] Upgraded Sidebar — Lucide icons, active state highlighting, user panel
- [x] Upgraded Header — glassmorphic backdrop blur, search bar, notification/settings icons
- [x] Upgraded Dashboard — metric cards with trends, bar chart, alerts feed
- [x] Created `/memory-debug` — timeline view, findings cards, executive summary
- [x] Created `/tool-misfire` — waterfall call sequence, error cards
- [x] Created `/hallucination-rca` — grounding score metrics, side-by-side source verification
- [x] Created `/blind-spots` — cluster map visualization, details panel
- [x] Created `docs/adal/architecture.md` — pipeline diagrams + UI wireframes

**Tests**
- [x] 12 tests passing (6 existing + 6 new), 0 warnings

**Live Testing Progress**
- [x] Backend starts and serves `/api/health` ✅
- [x] OpenAI GPT-4o-mini classification works via proxy ✅
- [x] Memory debug analysis node completes ✅
- [x] Claude Sonnet 4.6 synthesis reached (model name fixed) ✅
- [x] Full end-to-end pipeline — serialization bug fixed in Session 3, all 4 types passing ✅

### Session 1 — 2026-04-24

**Setup & Documentation**
- [x] Created `CLAUDE.md` — project context file (agent-agnostic)
- [x] Created `rules/frontend.md` — Next.js/React/Tailwind conventions
- [x] Created `rules/backend.md` — Python/FastAPI/LangGraph conventions
- [x] Created `rules/testing.md` — testing standards
- [x] Created `rules/git.md` — git workflow & commit conventions
- [x] Created `.env.example` — environment variable template
- [x] Added deferred TODO in CLAUDE.md: create `skills/` after Week 1-2

**Frontend Scaffold**
- [x] Next.js 16 (App Router, TypeScript, Tailwind CSS) in `frontend/`
- [x] shadcn/ui initialized (Button component + `cn()` utility)
- [x] Dashboard layout: `Sidebar.tsx` + `Header.tsx` + `(dashboard)/layout.tsx`
- [x] Homepage with placeholder metric cards at `(dashboard)/page.tsx`
- [x] Frontend builds successfully (`pnpm build` ✅)

**Backend Scaffold**
- [x] Poetry project in `backend/` with FastAPI, Pydantic, structlog
- [x] Pydantic Settings config (`app/config.py`) loading from `.env`
- [x] Standard `ApiResponse` envelope model (`app/models/response.py`)
- [x] Health endpoint: `GET /api/health` (`app/api/health.py`)
- [x] Modern lifespan pattern (no deprecated `on_event`)
- [x] Ruff lint + format config in `pyproject.toml`

**Data Models & Ingestion**
- [x] Trace models: `Session`, `LLMCall`, `ToolCall`, `RetrievalEvent`, `IngestRequest`, `IngestResult`
- [x] Ingest endpoint: `POST /api/ingest`
- [x] `EmbeddingService`, `PineconeService`, `Neo4jService` with graceful degradation
- [x] Synthetic trace generator: `scripts/generate_traces.py`

**Dependencies Installed**
- Frontend: pnpm, Next.js 16, React 19, Tailwind 4, shadcn/ui, lucide-react
- Backend: Poetry, FastAPI, uvicorn, Pydantic v2, pydantic-settings, structlog, openai, pinecone, neo4j, ruff, pytest, pytest-asyncio, httpx, pytest-mock, langgraph, langchain-core, langchain-openai, langchain-anthropic, anthropic, cohere, langfuse

---

## Upcoming Work

### Next — Pre-deploy checklist

- [ ] **Re-seed** — `cd backend && poetry run python scripts/reset_and_reseed.py`
- [ ] **Clear Langfuse** — `cd backend && poetry run python scripts/clear_langfuse.py` (rate limit reset ~2026-04-29 20:01 UTC)
- [ ] **Deploy Render** — Connect repo → New Blueprint → fill env vars: `DATABASE_URL`, `NEO4J_*`, `PINECONE_*`, `OPENAI_*`, `ANTHROPIC_*`, `COHERE_*`, `LANGFUSE_*`
- [ ] **Deploy Vercel** — Set `NEXT_PUBLIC_API_URL` to Render backend URL, set `CRON_SECRET` env var
- [ ] **Smoke test post-deploy** — Run Demo Agent scenarios → Pull Langfuse → Run analysis on one session
- [ ] **Record demo GIF** for README/submission

### Deferred (nice-to-have)
- [ ] A15 — inline comments on `_infer_failure_type` narrow role
- [ ] U1/U4/U5 — UI layout/font audit (requires visual inspection)
- [ ] A10 — GitHub Actions CI pipeline
- [ ] S1 — Demo GIF in README

---

## Standing Instructions for AI Agents

1. **Always confirm before writing frontend pages or backend feature code** — present the plan first, get user approval.
2. **Update this file at the end of every session** — move completed items, update Current State, add session entry.
3. **Create `skills/` directory** when the first LangGraph module is functional (deferred from Session 1).
4. **Reference files**: `CLAUDE.md` (project context), `rules/` (conventions), `proj_plan.md` (roadmap), `capstone_proj_proposal_codeman403.md` (technical proposal).
5. **Do not modify** reference docs: `capstone_proj_proposal_codeman403.md`, `existing_product_comparison.md`, `proj_plan.md`.
6. **LLM proxy**: API keys use DataExpert.io proxy — always use `app/agents/llm.py` factory, never instantiate LLM clients directly.
7. **Claude model**: Use `claude-sonnet-4-6` (not the full dated version name).
   **Proxy quirk**: DataExpert.io `/anthropic` endpoint always returns SSE (`text/event-stream`). `ChatAnthropic` must be instantiated with `streaming=True` so `langchain_anthropic` uses its SSE parser. Without this flag, synthesis crashes with `'str' object has no attribute 'model_dump'` inside `langchain_anthropic._format_output`. The `/openai` endpoint rejects non-GPT-4 model names — Claude must go through `/anthropic`.
   **Service singletons**: Always import and use `embedding_service`, `neo4j_service`, `pinecone_service` module-level singletons (initialized in FastAPI lifespan). Never instantiate these classes directly inside node functions — the new instances have no initialized driver/connection.
8. **Data store responsibilities** — strictly enforced:
   - Agent session CRUD (save/fetch/list) → **`postgres_service`** (`sessions` table) only
   - Chat conversation history → **`postgres_service`** (`chat_sessions` + `chat_messages` tables) only
   - Dashboard stats (counts, breakdown, daily) → **`postgres_service`** only
   - Graph traversal + cross-session patterns → **`neo4j_service`** only
   - Semantic search → **`pinecone_service`** only
   - Do NOT add session storage back to the in-memory store or Neo4j
9. **`store.py`** holds only `_reports` (volatile analysis cache). Never add session storage back to it.
10. **Chat freeform routing** — `_llm_route()` in `POST /api/chat/freeform` returns one of three intents:
    - `"data"` → LLM-generated SQL query → `_handle_text_to_sql()` → execute → format as plain English. Handles counts, ordering (oldest/newest), timestamps, filtering — anything SQL can express.
    - `"diagnostic"` → LangGraph pipeline. `failure_type=None` when LLM is unsure → `classify_intent` determines from session evidence.
    - `"general"` → LLM catch-all with trace stats + conversation history.
    - DO NOT add pattern-matching back for stats/list — use text-to-SQL instead.
11. **classify_intent ALWAYS uses LLM** — the short-circuit (`if session.failure_type → return early`) has been removed. The LLM reads actual evidence (retrieval scores, tool errors, LLM prompt/response) to determine failure type. Pre-set labels are a fallback only.
    - **Three classification layers exist**: `_infer_failure_type` (heuristic, ingestion-time, `langfuse_provider.py`) → `classify_intent` (LLM, always authoritative, `nodes/classify.py`) → `_llm_route` (freeform chat routing only, `api/chat.py`). The heuristic layer pre-labels sessions for UI display and feeds `retrieve.py:76` for Neo4j pattern matching. Do NOT remove it. `classify_intent` always overwrites it. See `docs/implementation_timeline.md` — Classification Architecture Audit for the full analysis.
12. **Langfuse tracing** — all LangGraph `ainvoke()` calls must pass a `CallbackHandler` config. Use `make_langfuse_handler()` from `app/utils/langfuse_utils.py`. Flush after invoke.
13. **Implementation timeline** — `docs/implementation_timeline.md` is the canonical decision log. Update it whenever: a significant architectural decision is made, a technical path fails and is replaced, or a new component is added.
14. **Scenario documentation** — `docs/scenarios/` contains demo scenarios for evaluators. Add new scenarios here when discovered. The `aethen_self_analysis.md` scenario (Aethen diagnosing its own failures) is the strongest demo case.
