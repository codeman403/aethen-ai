# Aethen-AI — Agent Reliability Studio

> **AI failure intelligence platform** — diagnoses why AI agents fail by reasoning across execution traces, vector DB metadata, and tool logs using Graph RAG and a multi-module LangGraph state machine.

---

## What it does

Aethen-AI ingests AI agent execution traces and runs them through a 4-module diagnostic pipeline:

| Module | What it detects |
|---|---|
| **Memory Debug** | Retrieval failures — wrong chunks, stale embeddings, metadata mismatches |
| **Tool Misfire** | Tool call failures — wrong parameters, permission errors, timeouts |
| **Hallucination RCA** | Hallucinations — LLM outputs not grounded in source documents |
| **Blind Spot Detector** | Systemic knowledge gaps across multiple failure sessions (Graph RAG) |

Each module produces structured findings with severity ratings, root cause identification, and remediation recommendations.

### Demo Agent

The **Demo Agent** (`/demo-agent`) lets you generate real failure traces directly from the browser — no scripts required. Click a scenario button (Memory Debug, Tool Misfire, Hallucination, Blind Spot), watch the LLM respond in the chat log, and see the trace appear in Langfuse. Pull it into Aethen from the dashboard to run the full analysis pipeline — end-to-end in one UI.

---

## Architecture

```
Frontend (Next.js 14)  →  BFF API routes  →  Python Backend (FastAPI)
                                                      │
                              ┌───────────────────────┤
                              │    LangGraph Pipeline   │
                              │  classify → retrieve    │
                              │  → rerank → analyze     │
                              │  → synthesize           │
                              └───────────────────────┘
                                    │           │
                               Pinecone      Neo4j
                             (vector search) (graph RAG)
```

**LLMs**: GPT-4o-mini (routing/classification), Claude Sonnet 4.6 (synthesis)
**Observability**: Langfuse (live trace ingestion)

---

## Quick Start

### Prerequisites

- Node.js 20+ with pnpm
- Python 3.11+ with Poetry
- API keys (see Environment Variables below)

### Frontend

```bash
cd frontend
pnpm install
pnpm dev          # http://localhost:3000
```

### Backend

```bash
cd backend
poetry install
cp ../.env.example ../.env   # fill in your API keys
poetry run dev    # http://localhost:8000
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
# LLM Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
COHERE_API_KEY=

# Vector DB
PINECONE_API_KEY=
PINECONE_INDEX=

# Graph DB
NEO4J_URI=
NEO4J_USER=
NEO4J_PASSWORD=

# Observability
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/ingest` | Ingest a session trace |
| `POST` | `/api/chat` | Analyze a session (full pipeline) |
| `POST` | `/api/qc` | Quality check report for session IDs |
| `GET` | `/api/stats` | Dashboard aggregated metrics |
| `GET` | `/api/sessions` | List ingested sessions, filter by `?failure_type=` |
| `POST` | `/api/langfuse/pull` | Pull live traces from Langfuse |
| `GET` | `/api/langfuse/health` | Langfuse connection health |
| `POST` | `/api/demo/run` | Run a demo scenario via LLM with Langfuse tracing |
| `GET` | `/api/demo/scenarios` | List available demo scenarios |

---

## Deployment

### Frontend → Vercel

1. Connect repo to Vercel
2. Set **Root Directory** to `frontend` (or it reads `vercel.json` automatically)
3. Add environment variables in Vercel dashboard (`NEXT_PUBLIC_API_URL` pointing to your backend)
4. Deploy

### Backend → Render

1. Go to **render.com** → New → Blueprint
2. Connect your GitHub repo — Render will detect `backend/render.yaml` automatically
3. Fill in the secret env vars in the Render dashboard (the ones marked `sync: false`):
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `COHERE_API_KEY`
   - `PINECONE_API_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
   - `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
4. Click **Apply** — Render builds the Docker image and deploys

Your backend URL will be `https://aethen-ai-backend.onrender.com`.
Health check: `GET /api/health`

> Note: free tier spins down after 15 min of inactivity (~30s cold start on next request).

---

## Running Tests

```bash
# Backend (26 tests)
cd backend
poetry run pytest

# Frontend type check + build
cd frontend
pnpm type-check
pnpm build
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Python 3.11, FastAPI, LangGraph, LangChain |
| LLMs | Claude Sonnet 4.6, GPT-4o-mini, Cohere Rerank v3 |
| Vector DB | Pinecone |
| Graph DB | Neo4j Aura |
| Observability | Langfuse |
| Deployment | Vercel (frontend), Render (backend) |
