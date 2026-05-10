# Aethen-AI — Session Progress & Continuity Log

> **Purpose**: Track development progress across AI agent sessions. Update this file at the end of every session.
>
> **Last updated**: 2026-05-08 (Session 28)

---

## How to Use This File

When starting a new session with any AI agent (AdaL, Claude Code, Cursor, etc.):
1. Point the agent to this file: "Read `docs/adal/session_progress.md` and continue from where we left off."
2. The agent will pick up from the **Current State** section below.
3. At the end of each session, ask the agent to update this file.

---

## Current State

- **Phase**: Session 28 — SaaS transformation complete. Performance optimised. Docs updated.
- **Branch**: `develop`
- **Next actions**:
  1. **Set `CREDENTIAL_ENCRYPTION_KEY` on Render** — key in `backend/.env`, must also be in Render env vars
  2. **Set `ADMIN_EMAILS` on Render** — comma-separated admin email(s) for root user access
  3. **Set `SUPABASE_JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` on Render** — for JWT auth in production
  4. **Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel**
  5. **CI wiring** (deferred) — add eval script to GitHub Actions
  6. **Record demo GIF** for submission
- **Tests**: 128 pipeline tests passing (includes 40 new confidence scorer unit tests). 67 pre-existing 401 failures from auth upgrade (tests written pre-JWT).
- **Eval results**: 100% classification accuracy · 84.44% judge score (rule-based confidence scorer active; 85.56% on optimised graph alone)
- **Analysis latency**: ~9-12s (down from 22-30s) after LangGraph optimisation
- **Confidence scoring**: Rule-based, deterministic (`app/agents/nodes/confidence.py`). LLM suggestion used only as ±0.075 secondary adjustment.

### Session 28 — What Was Built

**SaaS Auth & Multi-tenancy**
- Supabase Auth: email/password + Google + GitHub OAuth
- `organizations` + `profiles` tables; org_id scoping on all data; RLS; signup trigger
- JWT middleware replaces global API key
- Admin user via `ADMIN_EMAILS` env var
- Public Demo Agent (no login, 10-message limit, memory-only)
- Session timeout modal (15-minute inactivity)
- Profile & Organization settings page
- API Key settings page (moved to dedicated sidebar link)

**LLM API Keys Per Org**
- `/api/settings/llm-keys` — Fernet-encrypted per-org OpenAI/Anthropic keys
- Proxy/custom endpoint support; connection type selector in UI
- `contextvars.ContextVar` threads org credentials through LangGraph
- Model availability gated per org (no keys = no models shown)

**LangGraph Pipeline Optimisation** ← most impactful
- `analysis_graph` → `build_optimized_analysis_graph()`:
  - Parallel `classify_intent + vector_retrieve + graph_traverse`
  - `skip_graph` flag short-circuits Neo4j when no cross-session data
  - `fast_analyze` merges analysis module + synthesize into one LLM call
- **Result**: ~9-12s (was 22-30s). Evals: 100% accuracy, 85.56% judge (up from 83%).
- `fast_analysis_graph` for Demo Agent (classify → vector → fast_analyze, no Cohere)
- `_legacy_analysis_graph` kept for rollback

**Async Backfill**
- `POST /api/backfill` — background job for bulk historical import (200 traces/chunk)
- Progress polling + cancel endpoint
- Overview page: Backfill button with live progress card

**Demo Agent Improvements**
- Terminal-style analysis animation (hacking aesthetic)
- Early exit: UNKNOWN sessions skip full pipeline (2s vs 10s)
- Scenario analysis always uses `analyzeDirectly` (no Langfuse dependency)
- `_NO_ORG_SENTINEL` guards non-admin users without org

**Rule-Based Confidence Scorer**
- `app/agents/nodes/confidence.py` — `compute_confidence(session, failure_type, llm_confidence)`
- Deterministic evidence-based weights per failure type; LLM raw score = ±0.075 secondary only
- 4 bugs found and fixed vs initial impl (doc_id empty actual, partial overlap, hallucination proportion, latency-only timeout)
- 40 unit tests: determinism, clamping, ordering guarantees, all failure types
- Eval: 100% accuracy · 84.44% judge · PASSED (fully production-safe for non-automated decisions)
- Remaining gap: weights are heuristics — true production needs calibration against labeled outcomes

**Data Quality / Dashboard**
- `NumberTicker` fix: shows 0 correctly when value=0
- All dashboard counts show 0 for new users with no data
- **Sidebar**: 5 groups (Overview / Analysis / Explore / Live Demo / System), 240px wide.
- **Dates**: UTC everywhere — `UTCDatePicker` component, `timeZone:"UTC"` in formatTimestamp, `Date.UTC()` in charts, backend `DATE_TRUNC` UTC — all consistent.
- **Analysis indicator**: Green dot (cached) / Red dot (not analysed) on Trace Explorer session cards.
- **Success badge**: Sessions with no failure_type show `✓ Success` badge (not `—`).
- **Clickable charts**: Failure Distribution + Failure Trends bars/dots navigate to Trace Explorer with date+type filters.
- **Infinite scroll**: Trace Explorer + Session Timeline — 200 sessions per page, auto-loads on scroll.
- **Demo script**: `scripts/record_demo.mjs` — fully automated 10-scene demo recording, outputs MP4 + GIF.
- **Kill commands**: `lsof -ti TCP:8000 TCP:3000 | xargs kill -9` or `pkill -f "uvicorn|next"`

### Render env vars required
```
OPENAI_API_KEY, ANTHROPIC_API_KEY, COHERE_API_KEY
OPENAI_BASE_URL=https://www.dataexpert.io/api/v1/openai
ANTHROPIC_BASE_URL=https://www.dataexpert.io/api/v1/anthropic
DATABASE_URL, PINECONE_API_KEY, PINECONE_INDEX
NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL
LANGSMITH_API_KEY, LANGSMITH_PROJECT (must match your LangSmith project name)
FRONTEND_URL=https://your-vercel-url.vercel.app
```

### Architecture (as of Session 10)

Three clearly separated data stores — each owns a distinct responsibility:

| Store | Role | Library |
|-------|------|---------|
| **PostgreSQL / Supabase** | Agent session CRUD + chat session history — single source of truth | `asyncpg` |
| **Neo4j Aura** | Graph structure only — nodes + relationships for cross-session traversal | `neo4j` driver |
| **Pinecone** | Embedded trace vectors — semantic search | `pinecone` |

---

## Completed Work

### Session 27 — 2026-05-06 (Claude Code)

**Landing page performance, UI polish, logo design, branding**

**Performance:**
- [x] Scroll jank fixed — rAF-throttled scroll handler, cached `offsetTop` positions (no DOM queries per scroll event)
- [x] `AnimatedPipeline` extracted to `components/features/AnimatedPipeline.tsx` → dynamic import (`ssr: false`)
- [x] `StackGrid` extracted to `components/features/StackGrid.tsx` → dynamic import (`ssr: false`)
- [x] `page.js` reduced: 587KB → 572KB; `Load event`: 1064ms → 936ms
- [x] Typewriter `setInterval`: 18ms → 30ms (−40% CPU during typing)
- [x] Ticker items: 24 → 12 DOM nodes (same visual, CSS animation adjusted)
- [x] `SectionReveal` blur removed: `filter:blur(8px)` initial state eliminated — removed GPU layer promotions (`will-change` nodes: 4 → 0)
- [x] Header flicker fixed: `backdrop-blur-xl` always on, inner overlay fades opacity only (no layer promotion/demotion)

**Logo:**
- [x] New `AethenLogo` SVG component — `src/components/ui/logo.tsx`
- [x] Design: two overlapping rotated squares (C-base), purple→emerald gradient on all strokes, corner nodes, dashed diagonal causal trace
- [x] Replaces "Ae" text boxes in header, footer, sidebar
- [x] `logo-preview/` page added to `.gitignore`

**Branding & naming:**
- [x] "Aethen-AI" → "Aethen AI" everywhere in UI (3 files: `page.tsx`, `layout.tsx`, `Sidebar.tsx`)
- [x] "Aethen AI" text uses purple→emerald gradient (`from-[#6D28D9] to-[#059669]`)
- [x] "Agent Reliability Studio" badge moved from hero to header (collapses to logo on scroll)
- [x] Footer "Cases" → "Reports"

**Header:**
- [x] Header flicker on fast scroll fixed (CSS transition vs framer-motion)
- [x] "Aethen AI" + badge smoothly collapse to logo on scroll (CSS `max-width` + `opacity` transition)
- [x] Logo click always scrolls to top when already on `/`
- [x] `v0.1.0` badge removed from dashboard header

**Landing page structure:**
- [x] Pipeline section moved above Reports section
- [x] Stats bar (Node Types / Rel. Types / MTTR / Reliability) moved from Pipeline to Reports section
- [x] Last CTA section: box removed, blended into page, `max-w-7xl` matching other sections
- [x] "Take Action · stop guessing, start knowing" section label added to CTA
- [x] "Causal Intelligence" badge with `BrainCircuit` icon in CTA
- [x] Status bar: "Aethen · Agent Reliability Studio" → pulsing dot + "Ingest · Diagnose · Recommend Fix"

**Perf audit tooling:**
- [x] `perf-audit.mjs`, `scroll-test.mjs`, `header-test.mjs` — added to `.gitignore`
- [x] All added to `tsconfig.json` exclude to prevent Vercel build failures

---

### Session 24 — 2026-05-03 (Claude Code)

**Deployment, UTC consistency, UI polish, demo prep**

**Deployment:**
- [x] `render.yaml` created — backend deployed to Render (free plan)
- [x] Vercel deployment — `frontend/vercel.json` with daily crons (Hobby plan limit)
- [x] develop → main branch workflow enforced — all changes go to develop first
- [x] Fixed Dockerfile: Poetry 2.x + `requirements.txt` approach (no Poetry at runtime)
- [x] `requirements.txt` committed and generated via `poetry export`
- [x] CI workflow: `--no-root`, `pnpm` via npm, `pnpm-workspace.yaml` packages field, removed broken test

**Bug fixes:**
- [x] `synthesize.py` early-exit: returns `model_dump(mode="json")` not raw `AnalysisReport` object — fixes "argument after ** must be a mapping" error
- [x] LangSmith pull 500: `fetch_traces` wrapped in try/except — proper error message instead of 500
- [x] Langfuse pull: same try/except guard
- [x] LangSmith project: was `"default"`, must match actual LangSmith project name (set in Render env)
- [x] `OPENAI_BASE_URL` + `ANTHROPIC_BASE_URL` added to Render — proxy keys only work via DataExpert.io endpoint
- [x] Demo Agent: removed "Both" trace destination option — caused duplicate ingestion
- [x] Demo Agent trace badge: fixed to use session's stored `trace_destination` when loading old sessions

**UTC date consistency (all frontend):**
- [x] `UTCDatePicker` component (`components/ui/utc-date-picker.tsx`) — pure UTC calendar, Today(UTC) button
- [x] Trace Explorer filter: uses `toISOString()` UTC dates, replaced native `<input type="date">` with `UTCDatePicker`
- [x] Overview Failure Distribution chart: `Date.UTC()` generation, `timeZone:"UTC"` labels
- [x] Failure Trends `fmt()`: `T12:00:00Z` + `timeZone:"UTC"` — chart labels match backend UTC grouping
- [x] `formatTimestamp`: added `timeZone:"UTC"` — session card dates consistent with filter

**Trace Explorer improvements:**
- [x] Infinite scroll: 200 sessions/page, `IntersectionObserver` sentinel inside scroll container
- [x] `GET /api/sessions/count` endpoint — shows real total in footer ("200 of 1137 sessions")
- [x] Green dot = analysis cached / Red dot = not yet analysed on session cards
- [x] `✓ Success` badge replaces `—` for sessions with no failure type
- [x] `outcome=success/failure` URL param wired — Overview "Successful/Failures Detected" cards drill into filtered Trace Explorer
- [x] `dateFrom`/`dateTo` URL params wired — charts drill into Trace Explorer with pre-filled date filter

**Clickable charts (drill-down to Trace Explorer):**
- [x] Overview Failure Distribution: click bar → `/traces?type=X&dateFrom=D&dateTo=D`
- [x] Failure Trends: same click → single type if unambiguous, date-only if multiple types overlap
- [x] Uses `activeTooltipIndex` (recharts v3 — `activePayload` removed in v3)
- [x] `as never` cast on `onClick` prop for recharts v3 type compatibility

**Session Timeline improvements:**
- [x] Infinite scroll (same pattern as Trace Explorer)
- [x] Structured event detail panels (LLM: prompt/response; Tool: params/error; Retrieval: scores/chunks/doc preview)
- [x] Failure type filter chips, expand-all/collapse-all, dismissable ordering note
- [x] Timestamp on session cards

**Other UI fixes:**
- [x] `has_report` field in `_SELECT_SUMMARIES` — analysis indicator dots
- [x] Demo Agent `traceDestination` synced when loading existing sessions
- [x] `LANGSMITH_PROJECT` default was `"default"` — must match actual project
- [x] Overview alerts: data-driven (daily_by_type), not hardcoded
- [x] Reliability score ring: 7-day window (`reliability_score_7d`)
- [x] Failure Distribution chart: recharts `ComposedChart` with stacked bars + failure rate line
- [x] `renderText` dead code removed from Chat Debug
- [x] `fetchSessionsByType` moved to static import

**Seed script improvements:**
- [x] `trace_source: "synthetic"`, full UUIDs, current model names, 30-day timestamps, `doc_content`
- [x] `--no-reset` flag: append without wiping
- [x] `--analyze` flag: run LangGraph on all failure sessions after seeding
- [x] `requirements.txt` updated

**Demo recording script (`scripts/record_demo.mjs`):**
- [x] Manual mode: `Ctrl+C` to stop, auto-converts to MP4 + GIF
- [x] Automated mode: 10 scenes, input[placeholder] selectors (Demo Agent uses `<input>` not `<textarea>`)
- [x] `window.scrollBy` smooth scroll (no mouse.wheel flicker)
- [x] `activeTooltipIndex` wait for response instead of fixed sleeps
- [x] `deviceScaleFactor: 2` for retina-quality recording

**Standing instructions added:**
- develop → main only (never commit directly to main)
- `OPENAI_BASE_URL` + `ANTHROPIC_BASE_URL` required in Render for proxy keys
- `LANGSMITH_PROJECT` must match actual LangSmith project name
- UTC everywhere: `Date.UTC()`, `timeZone:"UTC"`, `UTCDatePicker` — do not revert to local dates

---

### Session 23 — 2026-05-03 (Claude Code)

**Final polish pass — bug fixes, dead code, sidebar redesign**

**Bug fixes & dead code:**
- [x] Removed dead `renderText` function from `chat/page.tsx` (replaced by `MarkdownContent`)
- [x] Moved `fetchSessionsByType` from dynamic import to static import in `chat/page.tsx`
- [x] Fixed Overview bar chart label: "Daily failure count" → "Daily session volume (all outcomes)"
- [x] Recommendations page: sorted deduped items by severity (critical → high → medium → low)
- [x] Demo Agent scenario results: removed `"both"` branch from trace badge rendering
- [x] Pattern Clusters agent breakdown: added `(N% of M sessions)` percentage display
- [x] Pattern Clusters: distinguishes "Neo4j unavailable" vs "graph empty — pull traces first"

**Reliability score:**
- [x] Backend: `_STATS_RECENT_FAILED` query counts failures in last 7 days
- [x] Backend: `reliability_score_7d` computed from last-7-day window, returned in stats
- [x] Frontend: Overview reliability ring uses `reliability_score_7d`; subtitle updated
- [x] Frontend: `DashboardStats` type includes `reliability_score_7d`

**Sidebar redesign:**
- [x] Reorganised into 5 groups: Overview / Analysis / Explore / Live Demo / System
- [x] Narrowed from 260px → 240px; tighter spacing (`py-1.5`, `gap-0.5`)
- [x] Font size reduced to `text-sm` for nav items; group labels at `text-[10px]`
- [x] Active state simplified (no hover shadow/translate animations)

**Agent Profiles:**
- [x] Replaced recharts `RadialBarChart` + `ResponsiveContainer` with pure SVG `<circle>` ring — no flash of empty ring, no recharts dependency for this component
- [x] SVG ring animates `stroke-dasharray` transition

**New insight pages (Session 22 — continued):**
- [x] Failure Trends (`/trends`): recharts AreaChart, 7/30/90d windows, per-type summary cards with trend badges
- [x] Pattern Clusters (`/patterns`): Neo4j failure clusters, blind spots, agent/model breakdowns
- [x] Agent Profiles (`/agents`): per-agent success rate ring, failure type breakdown bars
- [x] Session Timeline (`/timeline`): visual event chain (Retrieval → LLM → Tool) with expand/collapse
- [x] Recommendations (`/recommendations`): deduped, severity-sorted action items from cached reports
- [x] All 5 pages added to sidebar; `recharts` installed

**Chat Debug improvements (Session 22):**
- [x] `react-markdown` + `remark-gfm` — proper markdown rendering in chat responses
- [x] Edit/resend — hover any user message → Edit button → inline textarea → Resend
- [x] Structured Analysis uses real sessions from DB; falls back to synthetic
- [x] Session search in sessions panel
- [x] Clear chat button (trash icon in sessions header)
- [x] Model badge per response (`12.3s · claude-sonnet-4-6`)
- [x] Model dropdown: click-outside closes; grouped by provider (Anthropic/OpenAI)
- [x] Evidence panel: always visible with proper empty state
- [x] "Structured Analysis" heading replaces "Suggested Queries"

---

### Session 22 — 2026-05-03 (Claude Code)

**Trace Explorer overhaul, UI cleanup, new insight pages**

**Trace Explorer (`frontend/src/app/(dashboard)/traces/page.tsx`):**
- [x] Full right-panel rewrite — single tabbed card (Session Context, Diagnosis, Findings, LLM Calls, Tool Calls, Retrieval Events)
- [x] `derivedOutcome` bug fixed — string "success" was truthy so always showed "failure"; now `failure_type ? "failure" : "success"`
- [x] Diagnosis tab: Summary hidden when "unknown"/empty; Root Cause hidden when empty; success sessions show green "No failures detected" state
- [x] Session Context: clickable count boxes navigate to their respective tabs with hover scale effect
- [x] Left panel: modern collapsible filter bar — multi-select Failure Type chips + multi-select Source chips + Status chips + date range (From/To); Filters badge shows active count
- [x] Left panel card layout: session_id row, agent+source+failure badge row, event counts (Cpu/Wrench/ScanSearch icons) + timestamp
- [x] Source badge + FailureBadge in session cards
- [x] `filterTypes: string[]` replaces single `filterType` string; `sourcesFilter: string[]`; `dateFrom`/`dateTo` replaces `dateFilter`

**Backend fixes:**
- [x] `langfuse_provider.py`: `_extract_tool_calls_from_trace_messages` — mirrors retrieval backfill for non-retrieval tool calls from trace message history
- [x] `langfuse_provider.py`: `_normalize_agent_id` — "demo-*" → "Demo Agent" in both Langfuse + LangSmith providers
- [x] `langfuse_provider.py`: `failure_summary` only set when actual failure exists (removed misleading "Demo Agent — Free Form Chat" label for non-failure sessions)
- [x] `langsmith_provider.py`: tool call backfill fix — `elif not tool_calls` branch added so message history is checked even when retrieval_events exist from walk
- [x] `synthesize.py`: UNKNOWN/None failure type returns clean "No failure detected" report without LLM call
- [x] `postgres_service.py`: `_MIGRATE_DEMO_AGENT_IDS` + `_MIGRATE_CLEAR_NON_FAILURE_SUMMARIES` — idempotent startup migrations
- [x] `postgres_service.py`: `daily_by_type` + `today_sessions` added to `compute_stats()`; `COALESCE(session_ts, created_at)` used for accurate "today" counts
- [x] `stats.py`: `daily_by_type: FailureBreakdown` + `today_sessions: int` added to `DashboardStats` model

**Navigation restructure:**
- [x] 4 individual failure type pages (Memory Debug, Tool Misfire, Hallucination RCA, Blind Spots) archived to `docs/archive/frontend-pages/`
- [x] Each replaced with Next.js `redirect()` to `/traces?type=X`
- [x] Sidebar simplified: Overview → Trace Explorer → Chat Debug
- [x] Overview stat cards + failure rows all link to `/traces?type=X`

**Overview page (`frontend/src/app/(dashboard)/overview/page.tsx`):**
- [x] All 5 metric cards show `+N today` / `None today` using last-24h window
- [x] ChevronRight `>` symbol removed from metric cards
- [x] `recharts` installed for charting

---

### Session 21 — 2026-05-02 (Claude Code)

**LangSmith integration, model settings UI, RAG/classification improvements, cross-provider validation**

**LangSmith provider (`backend/app/providers/langsmith_provider.py`):**
- [x] `LangSmithTraceAdapter` — recursive run tree walker + `_extract_events_from_message_history` backfills Phase 1 evidence from message history (same pattern as Langfuse's `_extract_retrieval_from_trace_messages`)
- [x] `_extract_last_human` — handles LangChain constructor format `{'type':'constructor','kwargs':{'type':'human',...}}`
- [x] `_is_retrieval` — mirrors Langfuse's keyword-based retrieval detection
- [x] `_extract_tool_error_from_messages` — detects Phase 1 tool errors from ToolMessages
- [x] `_infer_failure_type` — structural signals (tool errors, zero-chunk retrievals, low scores) + `_extract_tool_error_from_messages`
- [x] Scores + `doc_content` correctly extracted from ToolMessage JSON content
- [x] `import json` added (was missing — caused all JSON parsing to silently fail)

**LangSmith API (`backend/app/api/langsmith.py`):**
- [x] `POST /api/langsmith/pull` with incremental watermark (`langsmith_last_pull_at`)
- [x] `GET /api/langsmith/health`
- [x] Background auto-analysis after pull (same as Langfuse)
- [x] `os.environ["LANGSMITH_TRACING"] = "false"` at startup — prevents SDK auto-tracing internal pipeline calls

**Model Settings feature:**
- [x] All 3 roles (analysis, synthesis, demo) now show combined OpenAI+Anthropic model list
- [x] Dropdown grouped by provider with coloured section headers
- [x] `createPortal` for dropdown — escapes all CSS stacking contexts and `overflow:hidden`
- [x] Demo role removed from Settings page — configured in Demo Agent page directly

**Demo Agent improvements:**
- [x] Trace destination selector (Langfuse/LangSmith/Both) in chat header
- [x] Model selector in chat header
- [x] All hardcoded "Langfuse" text replaced with dynamic destination label
- [x] Phase 1/Phase 2 architecture documented in `docs/scenarios/demo_agent_guide.md`

**Frontend — source badges and Pull Traces dropdown:**
- [x] `SessionsList.tsx` + `traces/page.tsx` — `SourceBadge` (LF=indigo, LS=orange, Demo=emerald)
- [x] Overview page — "Pull Traces" split button with Langfuse/LangSmith/Both dropdown
- [x] `/api/cron/pull-langsmith/route.ts` — Vercel cron for LangSmith
- [x] `vercel.json` — LangSmith cron added `*/5 * * * *`
- [x] Demo session cards — trace destination badge (LF/LS/Both)

**`classify_intent` prompt sharpened (`backend/app/agents/nodes/classify.py`):**
- [x] Step-by-step decision guide with explicit category boundaries
- [x] KEY RULE: functional category mismatch (billing query → API docs) = blind_spot; same domain wrong specific = memory
- [x] Hallucination: high scores + LLM adds specific facts not in doc_content
- [x] Score signal label added to `_session_to_evidence_text` ("HIGH/LOW — docs likely relevant/wrong")
- [x] LLM response extended from 300 → 600 chars (critical for hallucination detection)

**Demo Agent KB redesigned (`backend/app/api/demo.py`):**
- [x] 3-route `search_knowledge_base`: Memory (billing docs, scores 0.47/0.41), Hallucination (API progression docs, scores 0.81/0.76), Blind Spot (`json.dumps([])` = zero chunks)
- [x] Memory route: correct domain (billing) + wrong specific (Standard plan, not annual)
- [x] Blind Spot: zero chunks is unambiguous structural signal — eliminates memory/blind_spot non-determinism
- [x] Hallucination route: numeric progression + vague enterprise reference → LLM extrapolates

**Cross-provider validation results (4 failure types, both Langfuse + LangSmith):**
- [x] Memory: AGREE — `memory` (0.82) both providers ✓
- [x] Tool Misfire: AGREE — `tool_misfire` (0.91) both providers ✓
- [x] Hallucination: AGREE — both say `memory` (LLM hedges, doesn't fabricate; hallucination prompts updated in guide)
- [x] Blind Spot: AGREE — `blind_spot` (0.82/0.88) both providers ✓

**Tests: 169 → 202 passing**
- [x] `tests/test_langsmith_provider.py` — 21 tests (adapter, provider, session field)
- [x] `tests/test_api_langsmith.py` — 11 tests (endpoints, watermark, envelope)

**Standing instructions added:**
- `LANGSMITH_TRACING=false` forced at startup — never enable in `.env`; Aethen uses explicit callbacks only
- Demo Agent KB is a simulation — changes to it don't affect real production agents
- `classify_intent` step-by-step guide: tool_misfire first, then functional category test for memory vs blind_spot vs hallucination
- `_extract_events_from_message_history` is the LangSmith equivalent of Langfuse's `_extract_retrieval_from_trace_messages`

---

### Session 20 — 2026-05-02 (Claude Code)

**RAG pipeline fixes, Model Settings UI, Comprehensive test suite**

**Pinecone metadata fix (`backend/app/services/pinecone_service.py`):**
- [x] All 3 event types (LLM call, tool call, retrieval) now store `text` and `failure_summary` in metadata
- [x] `text` = the actual embedded content — what `rerank.py` reads via `meta.get('text', '')`
- [x] Previously rerank got `"[Vector match, score=0.870] | "` (empty) for all traces-namespace vectors — now gets real content
- [x] Retrieval event text includes `avg_score` when relevance scores are present

**Retrieve node fix (`backend/app/agents/nodes/retrieve.py`):**
- [x] Added `filters={"session_id": {"$ne": session.session_id}}` to traces namespace query
- [x] Previously: current session's own events dominated cross-session results (scored highest against itself)
- [x] Now matches `failure_patterns` namespace which already had this filter

**Model Settings feature:**
- [x] `backend/app/api/model_settings.py` — `GET/POST /api/settings/models` + `POST /api/settings/models/test`
- [x] In-memory model cache in `app/agents/llm.py` (`_model_cache`) — zero-latency reads, no DB round-trip per LLM call
- [x] `set_active_model(role, model_id)` — called by settings API after persisting to Postgres; seeded from Postgres on startup
- [x] Confirmed working models via live proxy test:
  - OpenAI proxy: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
  - Anthropic proxy: `claude-sonnet-4-6`, `claude-haiku-4-5` (Opus blocked)
- [x] `frontend/src/app/(dashboard)/settings/page.tsx` — SpotlightCard UI matching existing template; dropdown selector, Test Connection + Apply Model buttons, info card explaining pipeline roles
- [x] Added Model Settings to Sidebar under System section
- [x] API types added to `frontend/src/lib/api.ts`

**Test suite expansion (32 → 169 passing):**
- [x] `tests/conftest.py` — rate limit bypass fixture (prevents counter accumulation across 169 tests)
- [x] `tests/test_new_features.py` — Pinecone metadata, retrieve filter, QC flagged IDs, model settings API, LLM cache, no-evidence guard, rate limit config (27 tests)
- [x] `tests/test_api_sessions.py` — GET /api/sessions, GET /api/sessions/{id} (7 tests)
- [x] `tests/test_api_stats.py` — GET /api/stats, reliability score, fallback (7 tests)
- [x] `tests/test_utils.py` — sanitize_input (14 cases), RateLimitMiddleware (8 tests)
- [x] `tests/test_chat_sessions.py` — full chat session CRUD (9 tests)
- [x] `tests/test_rerank.py` — _evidence_to_documents (all 6 graph types + edge cases), rerank fallbacks + success (17 tests)
- [x] `tests/test_qc_helpers.py` — _check_agent_traces, _check_tool_call_logs, _check_user_feedback, model structs (18 tests)
- [x] `tests/test_langfuse_adapter_extended.py` — _extract_human_prompt, _extract_tool_call_response, _extract_retrieval_from_trace_messages, _link_retrieval_to_llm, _infer_failure_type (17 tests)

**Other fixes (Session 20):**
- [x] Data Quality "N flagged" links to `/traces?ids=...` (specific sessions, not all traces)
- [x] Coverage/Namespace vector DB checks show plain text count (not clickable) — no session IDs to link to
- [x] Traces page: amber banner "Showing N flagged sessions from Data Quality report" + Clear filter link
- [x] Module pages: reload effect fixed (removed `setReport(null)` on session click)
- [x] Module pages: Key Findings overflow fixed (`min-w-0`, `break-words`, `break-all`)
- [x] Session count "6 sessions" clipping fixed (`pt-3` on SessionsList header)
- [x] Trace Explorer sessions now animate with FadeInStagger/FadeInItem (same as module pages)
- [x] Chat Debug subtitle simplified to "Freeform diagnostic queries"
- [x] Rate limit: 60/500 → 100/1000 req per min/hr
- [x] Embedding model: confirmed already on `text-embedding-3-small` (no change needed)
- [x] Loading overlay: subtext "Fetching cached report" removed from normal session clicks (shown only on manual re-run)

**Standing instructions added:**
- Always write tests for new features when implementing them. Run only the corresponding test file, not the full suite.
- Test file naming: `tests/test_<area>.py`. Run: `poetry run pytest tests/test_<area>.py -v`
- Proxy confirmed models: OpenAI: gpt-4o-mini/gpt-4o/gpt-4.1/gpt-4.1-mini/gpt-4.1-nano; Anthropic: claude-sonnet-4-6/claude-haiku-4-5

---

### Session 19 — 2026-05-01 (Claude Code)

**Production hardening, UI overhaul, background analysis automation**

**No-evidence guard (`backend/app/api/chat.py`):**
- [x] `_has_analyzable_evidence(session)` — skips LangGraph when session has no tool calls, retrieval events, failure_type, or outcome=failure. Prevents fabricated findings from cross-session Pinecone data on clean/greeting sessions
- [x] Returns `failure_type=unknown, confidence=1.0, findings=[]` immediately — zero LLM cost
- [x] Documented in `docs/implementation_timeline.md` with full truth table

**Analysis report caching (`backend/app/services/postgres_service.py` + `chat.py`):**
- [x] `analysis_report JSONB` + `analysis_ts TIMESTAMPTZ` columns on `sessions` table (idempotent `ALTER TABLE`)
- [x] `get_analysis_report` + `save_analysis_report` methods on postgres_service
- [x] `ChatRequest.refresh: bool = False` — set True to bypass cache and re-run pipeline
- [x] Cache hit returns in ~86ms vs ~25s pipeline run — verified with 3-run consistency test across all 4 failure types

**Neo4j defunct connection fix (`backend/app/services/neo4j_service.py`):**
- [x] Driver config: `max_connection_lifetime=200`, `liveness_check_timeout=2`, `keep_alive=True` — prevents "Failed to read from defunct connection" on Aura free tier
- [x] `_reconnect()` + `_write_session_node` split — reconnects driver and retries once on connection errors

**Background auto-analysis on Langfuse pull (`backend/app/api/langfuse.py`):**
- [x] After ingesting sessions, fires `BackgroundTasks` → `_analyze_sessions_background(session_ids)`
- [x] Sequential per session: check cache → check evidence → run LangGraph → save result
- [x] No Langfuse callbacks during background runs (prevents meta-traces in Trace Explorer)
- [x] `IngestResult.analyses_queued` field added — response shows how many were queued
- [x] Works for both manual Dashboard pull and Vercel cron (`/api/cron/pull-langfuse`)

**Frontend — auto-load + refresh (`frontend/src/lib/api.ts`, all 5 pages):**
- [x] `analyzeSession(payload, refresh=false)` — spreads `refresh` into request body
- [x] All 4 module pages + Traces: `handleSelectSession` async, auto-loads analysis on click (cache → instant)
- [x] "Refresh Analysis" button label when report loaded; "Run Analysis" when not — always passes `refresh=true`
- [x] Loading overlay: "Fetching cached report" vs "Re-running pipeline — ~25s" (isRefreshing state)

**Frontend — full report display (all 5 pages):**
- [x] All report fields shown: summary, root cause, confidence, findings with evidence + recommendations
- [x] Raw Analysis removed from all pages — developer debug info, not useful to end users

**UI improvements (U1–U5) — verified with Playwright screenshots:**
- [x] U1: `analysisRef` scroll-into-view on session click; metrics bar (Confidence/Findings/High-Critical/Medium-Low) pinned at top of right panel on memory-debug and tool-misfire; `SessionContext` spans full grid width (`lg:col-span-3`)
- [x] U4: Root Cause changed from cramped `justify-between text-right max-w-[60%]` to stacked label-above-value layout; duplicate Confidence removed from Executive Summary sidebar; redundant "Tool Misfire • N Findings" badge removed; metric labels consistent (`High / Critical`, `Medium / Low`)
- [x] U5: Evidence items changed from 3-column grid to numbered list; tool-misfire finding description `text-xs/90` → `text-sm` full contrast; Traces filter chips `whitespace-nowrap` + `overflow-x-auto`
- [x] ExpandableText component created (`components/features/ExpandableText.tsx`) — Show more/less toggle, then removed when Raw Analysis was cut

**Standing instructions added:**
- This is a production system — every fix must be correct and complete, not just demo-quality
- `pkill -f "uvicorn|next"` or `lsof -ti TCP:8000 TCP:3000 | xargs kill -9` to kill servers
- Playwright installed in frontend devDeps for UI verification

---

### Session 18 — 2026-04-30 (Claude Code)

**Demo Agent failure classification fixes — Memory, Hallucination, Retrieval adapter**

**Root cause investigation:**
- [x] Traced why billing prompt classified as Blind Spot instead of Memory — three layered bugs found
- [x] Bug 1: `search_knowledge_base` returned same high scores (0.81/0.76) regardless of query → memory heuristic never fired
- [x] Bug 2: `_to_retrieval_event` didn't parse JSON strings — tool output (a JSON string) fell through both isinstance checks → `chunks=0, scores=[]` → blind spot heuristic fired unconditionally
- [x] Bug 3: Demo agent Phase 1 runs without callbacks → `search_knowledge_base` never creates a Langfuse SPAN observation → `observations.get_many()` returns only the final GENERATION — retrieval data only exists in `trace.input` ToolMessages

**Fixes (`backend/app/api/demo.py`):**
- [x] `search_knowledge_base` — query-aware scoring: on-topic queries (api key, oauth, token, authentication) get scores 0.81/0.76; off-topic queries (billing, passwords, subscriptions) get 0.31/0.28
- [x] Richer doc content with concrete tier data (Standard: 3/1k rpm, Pro: 10/5k rpm; OAuth: 1hr expiry) — triggers pattern-completion hallucination instead of vague hedging

**Fixes (`backend/app/providers/langfuse_provider.py`):**
- [x] Added `import json` (was missing — caused NameError in JSON string parse)
- [x] `_to_retrieval_event` — JSON string parsing before isinstance checks (handles tool outputs that arrive as strings)
- [x] `RETRIEVAL_KEYWORDS` expanded: added `"search_knowledge"`, `"knowledge_base"` — correctly classifies `search_knowledge_base` SPAN observations as retrieval events when they exist
- [x] `_extract_retrieval_from_trace_messages` — new method: scans trace-level message history for ToolMessages, matches to tool name via AIMessage `tool_calls`, parses JSON output into RetrievalEvents with correct scores, doc_ids, doc_content, and actual query arg
- [x] Backfill call in `adapt_trace`: when retrieval events are empty or all have `chunks=0`, falls back to trace message extraction
- [x] Populates `doc_content` and extracts actual `query_arg` from tool call `args`

**Fixes (`backend/app/models/trace.py`):**
- [x] `doc_content: list[str]` added to `RetrievalEvent` — stores retrieved document text

**Fixes (`backend/app/agents/nodes/classify.py`):**
- [x] `_session_to_evidence_text` — includes `doc_content` snippet in retrieval evidence so classifier can compare LLM response against actual doc text
- [x] `CLASSIFY_SYSTEM_PROMPT` — added "hedge-then-hallucinate" pattern: LLM says "I couldn't find X" then explains X from general knowledge = hallucination, not blind spot

**Verified end-to-end:**
- [x] Memory/billing: pre-label=memory ✅, analysis=memory (0.82) ✅
- [x] Hallucination/PKCE: analysis=hallucination (0.88) ✅
- [x] 32/32 backend tests passing ✅

**Docs:**
- [x] `docs/scenarios/demo_agent_guide.md` — added 3 memory prompts, full Hallucination section with best prompts and pre-labeling caveat

**Standing instructions added:**
- `search_knowledge_base` scores are query-aware — do NOT revert to flat scores
- Demo agent Phase 1 has no Langfuse callbacks by design — retrieval data lives in `trace.input` ToolMessages only; `_extract_retrieval_from_trace_messages` is the only path to get it
- `doc_content` in RetrievalEvent is required for hallucination classification — without it, classify_intent cannot distinguish hallucination from blind_spot when LLM hedges then adds domain knowledge

---

### Session 26 — 2026-05-05 (Claude Code)

**MCP server, aethen-sdk, PII/PHI redaction, credential storage, Integrations UI — 301 tests passing**

#### PII/PHI Redaction (new — `backend/app/middleware/pii_redactor.py`)
- Two-layer: **scrubadub** (email, phone, SSN, credit card, dates) + **custom regex** (medical record numbers, ICD-10 codes, NPI, DEA, health plan IDs)
- Runs in `POST /api/ingest` and `POST /api/analyze/raw` before any storage (Postgres, Pinecone, Neo4j)
- Controlled by `PII_REDACTION_ENABLED` env var (default: true)

#### Credential Storage (new — `backend/app/api/sources.py`)
- `POST/GET/DELETE /api/settings/sources` + `/test` endpoint
- Fernet-encrypted at rest (`CREDENTIAL_ENCRYPTION_KEY` env var — key generated, in `.env`, **must be set on Render**)
- Secret keys never returned in API responses
- Source index tracked in `app_settings` under key `sources_index`

#### Multi-source cron pull (modified — `backend/app/api/langfuse.py`)
- New `POST /api/langfuse/pull/all` — pulls Aethen's own account + all registered external sources
- Each source has independent watermark (`langfuse_last_pull_at_{name}`)
- New `POST /api/langfuse/trace` — fetch + analyze single trace by ID (used by MCP)
- Vercel cron updated to call `/pull/all` instead of `/pull`

#### MCP Server (new — `backend/app/mcp/`)
- 5 tools: `analyze_langfuse_trace` (stored creds), `analyze_langfuse_trace_direct` (per-call), `analyze_session`, `get_report`, `search_traces`
- 4 resources: `aethen://stats`, `aethen://patterns`, `aethen://alerts`, `aethen://agents/{id}`
- HTTP adapter (calls Aethen FastAPI, not direct Python) — works against deployed Render backend
- Auth stub: `Authorization: Bearer` logged, not enforced (ready for multi-tenancy)
- CLI: `poetry run python scripts/run_mcp.py`

#### aethen-sdk (new — `sdk/`)
- `pip install aethen-sdk` (local: `pip install ./sdk`)
- `AethenClient` — sync + async methods for all integration paths
- Two models: stored source (credentials in Aethen UI) + per-call (credentials never stored)

#### analyze_raw endpoint (new — `backend/app/api/analyze_raw.py`)
- `POST /api/analyze/raw` — accepts per-call Langfuse/LangSmith credentials, uses once, discards
- Supports `format: langfuse | langsmith | session`

#### Frontend Integrations UI (new — `frontend/src/app/(dashboard)/settings/integrations/`)
- Settings page now has Models | Integrations tab navigation via `settings/layout.tsx`
- Integrations page: add source form (test + save), registered sources table, connected agents, SDK quickstart snippets
- `lib/api.ts`: `fetchSources`, `addSource`, `removeSource`, `testSource`

#### Auth middleware stub (modified — `backend/app/main.py`)
- `ApiKeyMiddleware` — logs Bearer token, does not enforce (single-tenant for now)
- Interface is production-shaped: multi-tenancy requires only backend changes

#### New env vars (add to Render)
- `CREDENTIAL_ENCRYPTION_KEY` — Fernet key for encrypting stored credentials. Generate your own: `poetry run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` — set in Render env vars only, never commit.
- `PII_REDACTION_ENABLED` — `true` (default) / `false` for local dev

#### New tests (50 added, 301 total)
- `test_pii_redactor.py` — 16 tests
- `test_sources_api.py` — 14 tests
- `test_mcp_tools.py` — 20 tests

#### Standing instructions added
- `CREDENTIAL_ENCRYPTION_KEY` must NEVER be committed to git
- Secret keys are stored as Fernet ciphertext in `app_settings`, key = `source:{name}`
- Multi-tenancy boundary: all sessions share one table, no `tenant_id` yet; MCP/SDK interface is designed to not need changes when tenant isolation is added

---

### Session 25 — 2026-05-05 (Claude Code)

**Eval pipeline, prompt tuning across all modules — 251 backend tests passing**

#### Eval pipeline (new — `backend/app/eval/`, `backend/data/`, `backend/scripts/`)
- [x] `generate_eval_dataset.py` + `data/eval_dataset.json` — 100 golden sessions, 25 per failure type, 3 difficulty tiers (obvious/borderline/adversarial)
- [x] `app/eval/metrics.py` — pure metric functions: classification (accuracy, F1, confusion matrix, calibration r), retrieval (context recall, precision, hit rate), synthesis (keyword match + LLM judge). CI-safe, no LLM/DB
- [x] `app/eval/langfuse_eval.py` — per-session + aggregate score push via `create_score()` (Langfuse v4 API)
- [x] `app/eval/runner.py` — two modes: `fast` (classify-only, 1 LLM call/session) and `full` (complete pipeline + LLM-as-judge)
- [x] `scripts/run_eval.py` — CLI, formatted table output, exit code 1 on gate failure
- [x] `app/api/eval.py` — `POST /api/eval/run`, `GET /api/eval/results`; registered in `main.py`
- [x] `tests/test_eval_pipeline.py` — 34 CI-safe unit tests
- [x] `tests/test_eval_api.py` — 15 API tests (mocked runner + postgres)

#### Regression gates
| Gate | Threshold |
|------|-----------|
| `classification_accuracy` | ≥ 90% |
| `keyword_match_rate` | ≥ 70% |
| `judge_score` (full mode only) | ≥ 75% |

#### Prompt tuning — measured by eval
- [x] `classify.py` — `expected_doc_ids ≠ actual_doc_ids` elevated to Step 2 priority rule. Memory F1: **57% → 100%**
- [x] `synthesize.py` — precision rule on `root_cause` + `_session_evidence()` context helper. Judge Score: **65% → 83%**
- [x] `memory_debug.py` — added `doc_content` + `doc_mismatch` to retrieval event context
- [x] `tool_debug.py` + `hallucination_rca.py` — precision rule on `root_cause` field
- [x] blind_spot keywords regenerated (shorter substrings)

#### Final baseline (end of session)
| Metric | Before | After |
|--------|--------|-------|
| Classification accuracy | 85% | **100%** |
| Memory F1 | 57% | **100%** |
| LLM Judge Score | 65.67% | **83%** |
| Root Cause Match | 74% | **83%** |

#### Bugs fixed
- Langfuse v4: `score()` → `create_score()`
- `eval.py`: `ResponseMetadata` missing required `request_id`
- Eval test patch target: `app.eval.runner.run_eval` (not `app.api.eval.run_eval`)

#### Deferred
- A10 — GitHub Actions CI wiring: `poetry run python scripts/run_eval.py` (trivial, deferred by user)

---

### Session 17 — 2026-04-29 (Claude Code)

**RAG improvements, Demo Agent overhaul, Langfuse trace fixes, repo cleanup**

- [x] R1–R5: failure-type-aware vector queries, rerank query, cross-session evidence at top of prompts
- [x] Demo Agent: 4 real tools, Phase 1 (no callbacks) + Phase 2 (single traced call)
- [x] Langfuse adapter: `_extract_human_prompt`, `_extract_tool_call_response`, synthetic LLMCall from trace-level input/output
- [x] Repo cleanup: 20 dev scripts moved to `delete-later/` (gitignored)

---

## Upcoming Work

### Next — Pre-deploy checklist

- [ ] **Re-seed** — `cd backend && poetry run python scripts/reset_and_reseed.py`
- [ ] **Clear Langfuse** — `cd backend && poetry run python scripts/clear_langfuse.py`
- [ ] **Deploy Render** — Connect repo → New Blueprint → fill env vars: `DATABASE_URL`, `NEO4J_*`, `PINECONE_*`, `OPENAI_*`, `ANTHROPIC_*`, `COHERE_*`, `LANGFUSE_*`
- [ ] **Deploy Vercel** — Set `NEXT_PUBLIC_API_URL` to Render backend URL, set `CRON_SECRET` env var
- [ ] **Smoke test post-deploy** — Run Demo Agent scenarios → Pull Langfuse → Run analysis on one session
- [ ] **Record demo GIF** for README/submission

### Deferred (nice-to-have)
- [ ] A15 — inline comments on `_infer_failure_type` narrow role
- [ ] A10 — GitHub Actions CI pipeline
- [ ] S1 — Demo GIF in README

### Missing test coverage (resume here)
The following areas have NO tests yet — add when touching these files:
- `POST /api/chat/freeform` — freeform endpoint routing, `_llm_route`, `_handle_text_to_sql`, `_handle_general`
- `_validate_sql()` in `chat.py` — SQL injection defense (critical)
- `POST /api/langfuse/pull` + `GET /api/langfuse/health`
- `POST /api/qc` (metrics for specific session IDs)
- `GET /api/qc/report` (full endpoint with Pinecone mock)
- Demo agent: `POST /api/demo/run`, `POST /api/demo/chat`, `GET /api/demo/sessions`
- Individual analysis nodes: `classify_intent`, `memory_debug`, `tool_debug`, `hallucination_rca`, `blind_spot`, `synthesize`
- Postgres service CRUD: `save_session`, `compute_stats`, `save_analysis_report`, `get_analysis_report`, `update_failure_type`

#### Covered in Session 25 (no longer missing)
- ✅ `POST /api/eval/run` — 11 tests in `test_eval_api.py`
- ✅ `GET /api/eval/results` — 4 tests in `test_eval_api.py`
- ✅ All eval metrics functions — 34 tests in `test_eval_pipeline.py`

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
    - `"data"` → LLM-generated SQL query → `_handle_text_to_sql()` → execute → format as plain English.
    - `"diagnostic"` → LangGraph pipeline. `failure_type=None` when LLM is unsure → `classify_intent` determines from session evidence.
    - `"general"` → LLM catch-all with trace stats + conversation history.
    - DO NOT add pattern-matching back for stats/list — use text-to-SQL instead.
11. **classify_intent ALWAYS uses LLM** — the short-circuit (`if session.failure_type → return early`) has been removed. The LLM reads actual evidence (retrieval scores, tool errors, LLM prompt/response) to determine failure type. Pre-set labels are a fallback only.
    - **Three classification layers exist**: `_infer_failure_type` (heuristic, ingestion-time, `langfuse_provider.py`) → `classify_intent` (LLM, always authoritative, `nodes/classify.py`) → `_llm_route` (freeform chat routing only, `api/chat.py`). The heuristic layer pre-labels sessions for UI display and feeds `retrieve.py:76` for Neo4j pattern matching. Do NOT remove it. `classify_intent` always overwrites it.
12. **Langfuse tracing** — all LangGraph `ainvoke()` calls must pass a `CallbackHandler` config. Use `make_langfuse_handler()` from `app/utils/langfuse_utils.py`. Flush after invoke.
13. **Implementation timeline** — `docs/implementation_timeline.md` is the canonical decision log. Update it whenever: a significant architectural decision is made, a technical path fails and is replaced, or a new component is added.
14. **Scenario documentation** — `docs/scenarios/` contains demo scenarios for evaluators. Add new scenarios here when discovered. The `aethen_self_analysis.md` scenario (Aethen diagnosing its own failures) is the strongest demo case.
15. **Testing rules**:
    - Write tests for every new feature when implementing it — do not defer.
    - Run only the corresponding test file, not the full suite: `poetry run pytest tests/test_<area>.py -v`
    - Run full suite only for final verification: `poetry run pytest tests/ -q`
    - Missing test coverage list tracked in "Upcoming Work → Missing test coverage" section above.
16. **Model settings**: OpenAI and Anthropic model selections persisted in `app_settings` Postgres table and cached in `app/agents/llm._model_cache`. Update via `POST /api/settings/models`. Confirmed working models:
    - OpenAI proxy: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
    - Anthropic proxy: `claude-sonnet-4-6`, `claude-haiku-4-5` (Opus blocked by proxy)
