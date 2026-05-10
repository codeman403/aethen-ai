# Aethen-AI — Project Context

> **AI Agent Reliability Studio** — An AI failure intelligence platform that diagnoses why AI agents fail by reasoning across execution traces, vector DB metadata, and tool logs using Graph RAG and a multi-module LangGraph state machine.

This file is the single source of truth for AI-assisted development. It is compatible with Claude Code, AdaL, Cursor, and other AI coding agents.

**Key reference documents:**
- `docs/adal/session_progress.md` — session-by-session work log and upcoming tasks
- `docs/implementation_timeline.md` — **decision log**: every major architectural choice, failure, pivot, and lesson since project inception. Read this before making architectural changes.
- `docs/scenarios/` — demo scenarios for evaluators. `aethen_self_analysis.md` is the strongest demo case.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| **Backend / Orchestration** | Python 3.11+, LangChain, LangGraph |
| **LLMs** | Claude Sonnet 4.6 (Synthesis, via Anthropic proxy — GPT-4o-mini fallback), GPT-4o-mini (Routing), Cohere Rerank v3 |
| **Session Store** | PostgreSQL via Supabase — full session JSON, CRUD, pagination (`asyncpg`) |
| **Vector DB** | pgvector (Postgres extension) — semantic search over embedded traces (`session_vectors` table) |
| **Graph DB** | Neo4j Aura — graph structure only: relationships, traversal, blind spot detection |
| **Deployment** | Vercel (frontend), Render (backend) |
| **Package Managers** | pnpm (frontend), poetry (backend) |

### Data Store Responsibilities

| Store | Owns | Does NOT own |
|-------|------|--------------|
| **PostgreSQL / Supabase** | Agent session JSON (`sessions` table), chat conversation history (`chat_sessions` + `chat_messages` tables), dashboard stats (primary), embedded trace vectors (`session_vectors` table via pgvector) | Graph relationships |
| **Neo4j Aura** | Graph nodes + relationships (Session→Query→Chunk→ToolCall→Response), cross-session patterns | Raw session data, stats counting, vectors |

## Project Structure (Target)

```
aethen-ai/
├── frontend/                # Next.js 14 App Router
│   ├── app/                 # App Router pages & layouts
│   │   ├── (dashboard)/     # Dashboard route group
│   │   ├── api/             # Next.js API routes (BFF)
│   │   └── layout.tsx       # Root layout
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui primitives
│   │   └── features/        # Feature-specific components
│   ├── lib/                 # Utilities, hooks, types
│   ├── public/              # Static assets
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── backend/                 # Python backend
│   ├── app/
│   │   ├── agents/          # LangGraph agent definitions
│   │   ├── chains/          # LangChain chains
│   │   ├── api/             # FastAPI routes
│   │   ├── models/          # Pydantic models & schemas
│   │   ├── services/        # Business logic (pgvector, Neo4j)
│   │   ├── utils/           # Helpers
│   │   └── config.py        # Settings & env management
│   ├── tests/
│   ├── pyproject.toml
│   └── poetry.lock
├── docs/                    # Architecture & design docs
├── rules/                   # AI agent coding rules (modular)
├── assets/                  # Design assets
├── CLAUDE.md                # This file — project context
├── .env.example             # Environment variable template
└── README.md
```

## Core Modules

Aethen-AI consists of four interconnected analysis modules orchestrated by LangGraph:

1. **Memory Debug Module** — Analyzes retrieval failures (wrong chunks, stale embeddings, metadata mismatches) via pgvector semantic search.
2. **Tool Misfire Module** — Detects tool call failures (wrong parameters, permission errors, timeout patterns) from execution traces.
3. **Hallucination RCA Module** — Performs root cause analysis on hallucinations by cross-referencing LLM outputs against source documents.
4. **Blind Spot Detector** — Uses Graph RAG (Neo4j) to find systemic knowledge gaps across multiple failure sessions.

## Commands

### Frontend
```bash
cd frontend
pnpm install          # Install dependencies
pnpm dev              # Dev server (localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm type-check       # TypeScript check (tsc --noEmit)
pnpm test             # Run tests
```

### Backend
```bash
cd backend
poetry install        # Install dependencies
poetry run dev        # Dev server (uvicorn, localhost:8000)
poetry run pytest     # Run tests
poetry run lint       # Ruff linter
poetry run format     # Ruff formatter
```

## Environment Variables

Required variables (set in `backend/.env`):

```
# LLM Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
COHERE_API_KEY=

# Session Store + Vector DB — Supabase/PostgreSQL (asyncpg + pgvector extension)
# Supabase: Settings → Database → Connection string → URI (Session mode, port 5432)
# pgvector: session_vectors table (id, session_id, namespace, org_id, event_type, metadata, embedding vector(1536))
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Graph DB — relationships + traversal only
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=

# Langfuse
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com

# App
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Coding Conventions

### General
- **No `any` types** in TypeScript — use proper types or `unknown` with type guards.
- **No bare `except`** in Python — always catch specific exceptions.
- **Prefer composition over inheritance** in both frontend and backend.
- **All functions must have docstrings/JSDoc** for public APIs.
- **Environment variables** are accessed only through config modules, never directly in business logic.

### Frontend (see `rules/frontend.md`)
- Use **Server Components by default**; add `"use client"` only when needed (state, effects, browser APIs).
- Components: PascalCase files, one component per file, co-locate types.
- Use **shadcn/ui** for all base UI — do not install competing component libraries.
- Tailwind only — no CSS modules, no styled-components.

### Backend (see `rules/backend.md`)
- **Pydantic v2** for all data models and validation.
- **Async-first** — all I/O operations must be async.
- LangGraph state machines must have typed `State` dataclasses with clear input/output schemas.
- API routes return consistent `{data, error, metadata}` response envelopes.

### Testing (see `rules/testing.md`)
- Frontend: Vitest + React Testing Library.
- Backend: pytest + pytest-asyncio.
- Minimum: all API endpoints tested, all LangGraph nodes tested in isolation.

### Git (see `rules/git.md`)
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- Branch naming: `feat/module-name`, `fix/issue-description`.
- PRs require description + test evidence.

## Architecture Decisions

- **LangGraph over raw LangChain**: State machine orchestration gives deterministic routing between modules and supports human-in-the-loop.
- **Graph RAG (Neo4j) for Blind Spot Detection**: Failure patterns span sessions — graph traversal finds systemic issues that vector search alone misses.
- **Separate frontend/backend**: Next.js handles rendering + BFF layer; Python handles all LLM/DB orchestration. Clean separation enables independent scaling.
- **BFF Pattern**: Next.js API routes proxy to the Python backend — frontend never calls external APIs directly.

## TODO — Deferred Setup

- [ ] **Create `skills/` directory** — After Week 1-2, once 1-2 modules are built, extract recurring patterns into auto-triggered skill files. Candidates: LangGraph state machine patterns, Neo4j Cypher query patterns, pgvector ingestion flows. Remind the user when the first LangGraph module is functional.

## Important Notes for AI Agents

- This is a **production-standard project** — follow all conventions strictly.
- When switching between AI agents (AdaL, Claude Code, Cursor, etc.), this file and the `rules/` directory provide full context. No agent-specific config is required for core development.
- Always check existing code patterns before introducing new ones.
- Do not modify documentation files (`capstone_proj_proposal_codeman403.md`, `existing_product_comparison.md`, `proj_plan.md`) — they are reference material.
- Keep this file updated as the project evolves.

## LangGraph Graph Architecture (Critical — Read Before Changing)

**Two compiled graph singletons** exist in `app/agents/graph.py`:

| Singleton | Builder | Used by |
|-----------|---------|---------|
| `analysis_graph` | `build_optimized_analysis_graph()` | Chat Debug, Trace Explorer, langfuse/langsmith analysis, all production paths |
| `fast_analysis_graph` | `build_fast_analysis_graph()` | Demo Agent `analyzeDirectly` endpoint only |
| `_legacy_analysis_graph` | `build_analysis_graph()` | Reference / rollback — NOT used in production |

**Optimised graph flow** (~9-12s):
```
parallel_start → [classify_intent ‖ vector_retrieve ‖ graph_traverse*]
                        → merge_retrieval → (UNKNOWN → early_exit | known → fast_analyze)
```
`* graph_traverse` returns `[]` immediately when `AgentState["skip_graph"] = True`

**`fast_analyze`** (`app/agents/nodes/fast_analyze.py`) — ONE LLM call replaces the separate analysis module + synthesize steps. Handles all 4 failure types. Eval confirmed: 100% accuracy, 85.56% judge score.

**DO NOT** reintroduce `synthesize` into the `analysis_graph` flow without running evals first. The combined prompt performs better than two sequential calls.

## Confidence Scoring (Critical — Do Not Revert to LLM Self-Reporting)

`AnalysisReport.confidence` is computed by `compute_confidence()` in `app/agents/nodes/confidence.py` — **NOT** by the LLM.

The LLM returns a raw confidence suggestion (0.0–1.0) which is used only as a `±0.075` secondary adjustment. The primary score is deterministic evidence-based computation from session trace signals.

**Signal weights** (abbreviated — see full table in `docs/adal/aethen_internal_flow.md` Part 6):
- `tool_misfire`: failed status (0.45) + error message (0.25) + timeout (0.10)
- `memory`: doc_id_full_miss (0.58), partial_mismatch (scaled), low scores (0.20–0.30)
- `hallucination`: flag × proportion (0.30–0.50) + no_sources × proportion (0.15–0.30)
- `blind_spot`: zero_chunks (0.50), very_low_scores (0.30)

**DO NOT** replace with `float(parsed.get("confidence", 0.5))` from the LLM response — that was the old broken approach.

**Tests**: `tests/test_confidence_scorer.py` — 40 unit tests covering all failure types, determinism, clamping, and ordering guarantees. Run before any changes to the scorer.

**Rollback**: Change `analysis_graph = build_optimized_analysis_graph()` to `analysis_graph = _legacy_analysis_graph`.

## Fundamental Architectural Constraint — Trace-Only Analysis

**Aethen never accesses the monitored agent's knowledge base, embedding model, or domain content.** Every classification is made from observable execution trace signals only.

This has direct implications for code changes:

- **Score thresholds (0.5, 0.3) in `confidence.py` are universal heuristics**, not domain-calibrated values. Do not treat them as ground truth — they are the best approximation without KB access.
- **`expected_doc_ids` is the highest-accuracy signal** (weight 0.58). Changes that remove or ignore this field will significantly degrade memory failure classification accuracy.
- **Hallucination detection is surface-level** — LLM output vs retrieved `doc_content` comparison. False positives are expected when the LLM uses correct training knowledge not present in retrieved docs.
- **Aethen is a signal amplifier, not a domain expert.** Classification outputs mean "this pattern looks anomalous in the trace" — not "this answer is factually wrong." Low confidence scores (< 0.5) mean investigate, not condemn.

When modifying classification logic: ask "does this change require knowing the agent's KB?" If yes, it's out of scope for Aethen's current architecture.

## Per-Org LLM Credentials

LLM credentials are stored per org (Fernet-encrypted, `app_settings` table) and injected via `contextvars.ContextVar` (`_org_llm_ctx` in `app/agents/llm.py`). Route handlers call `set_org_llm_context(config)` before `ainvoke()`. Never pass credentials through function arguments — use the context var.

## Authentication

- **JWT middleware** (`app/middleware/auth.py`) verifies Supabase tokens via `/auth/v1/user` API (60s cache). Sets `request.state.user_id`, `org_id`, `is_admin`.
- **Admin users**: `ADMIN_EMAILS` env var — bypasses org scoping, sees all data including `org_id=NULL`.
- **`get_data_org_id(request)`** (`app/utils/request_context.py`) — use this in ALL data route handlers, not `getattr(request.state, "org_id", None)` directly. Returns `None` for admin (no filter), org UUID for regular users, sentinel UUID for users without org.
- **Public paths**: `/api/demo/chat`, `/api/demo/run`, `/api/demo/scenarios`, `/api/demo/analyze-direct`, `/api/health` — no JWT required.
