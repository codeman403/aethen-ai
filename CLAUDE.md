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
| **Vector DB** | Pinecone — semantic search over embedded traces |
| **Graph DB** | Neo4j Aura — graph structure only: relationships, traversal, blind spot detection |
| **Deployment** | Vercel (frontend), Render (backend) |
| **Package Managers** | pnpm (frontend), poetry (backend) |

### Data Store Responsibilities

| Store | Owns | Does NOT own |
|-------|------|--------------|
| **PostgreSQL / Supabase** | Agent session JSON (`sessions` table), chat conversation history (`chat_sessions` + `chat_messages` tables), dashboard stats (primary) | Graph relationships, vectors |
| **Neo4j Aura** | Graph nodes + relationships (Session→Query→Chunk→ToolCall→Response), cross-session patterns | Raw session data, stats counting, vectors |
| **Pinecone** | Embedded trace vectors for semantic search | Session metadata, graph structure |

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
│   │   ├── services/        # Business logic (Pinecone, Neo4j)
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

1. **Memory Debug Module** — Analyzes retrieval failures (wrong chunks, stale embeddings, metadata mismatches) via Pinecone metadata inspection.
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

# Session Store — Supabase/PostgreSQL (asyncpg)
# Supabase: Settings → Database → Connection string → URI (Session mode, port 5432)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Vector DB
PINECONE_API_KEY=
PINECONE_INDEX=aethen-traces

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

- [ ] **Create `skills/` directory** — After Week 1-2, once 1-2 modules are built, extract recurring patterns into auto-triggered skill files. Candidates: LangGraph state machine patterns, Neo4j Cypher query patterns, Pinecone ingestion flows. Remind the user when the first LangGraph module is functional.

## Important Notes for AI Agents

- This is a **production-standard project** — follow all conventions strictly.
- When switching between AI agents (AdaL, Claude Code, Cursor, etc.), this file and the `rules/` directory provide full context. No agent-specific config is required for core development.
- Always check existing code patterns before introducing new ones.
- Do not modify documentation files (`capstone_proj_proposal_codeman403.md`, `existing_product_comparison.md`, `proj_plan.md`) — they are reference material.
- Keep this file updated as the project evolves.
