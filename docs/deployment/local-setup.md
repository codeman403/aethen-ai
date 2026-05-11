# Local Setup

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://python.org) or `pyenv` |
| Poetry | 2.0+ | `pip install "poetry>=2.0.0"` |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) or `nvm` |
| pnpm | 9.0 | `npm install -g pnpm@9` |

External services required:
- **Supabase** — free account at [supabase.com](https://supabase.com) (PostgreSQL + pgvector extension)
- **Neo4j Aura** — free instance at [neo4j.com/cloud/aura-free](https://neo4j.com/cloud/aura-free)
- **OpenAI** — API key from [platform.openai.com](https://platform.openai.com)
- **Cohere** — API key from [cohere.com](https://cohere.com)

Optional (for full functionality):
- **Anthropic** — API key for Claude analysis (falls back to GPT-4o-mini without it)
- **Langfuse** — account at [cloud.langfuse.com](https://us.cloud.langfuse.com)
- **LangSmith** — account at [smith.langchain.com](https://smith.langchain.com)

---

## Step 1: Clone and Configure Environment

```bash
git clone https://github.com/codeman403/aethen-ai
cd aethen-ai

# Copy the template
cp .env.example backend/.env
```

Edit `backend/.env` and fill in at minimum:
```env
OPENAI_API_KEY=sk-...
COHERE_API_KEY=...
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
```

---

## Step 2: Set Up Supabase Database

1. Create a Supabase project at [app.supabase.com](https://app.supabase.com)
2. Enable the pgvector extension: **Project → Database → Extensions → vector**
3. Get your connection string: **Project → Settings → Database → Connection string → URI (Session mode, port 5432)**

Run the pgvector schema migration:
```bash
cd backend
poetry run python scripts/migrate_to_pgvector.py
```

---

## Step 3: Set Up Neo4j

1. Create a free AuraDB instance at [neo4j.com/cloud/aura-free](https://neo4j.com/cloud/aura-free)
2. Note the connection URI, username, and password
3. Add them to `backend/.env`

Seed the schema constraints:
```bash
cd backend
poetry run python scripts/seed_neo4j.py
```

---

## Step 4: Start the Backend

```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload --port 8000
```

Verify: [http://localhost:8000/api/health](http://localhost:8000/api/health)  
API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Step 5: Start the Frontend

```bash
cd frontend
pnpm install

# Configure frontend environment
cp .env.local.example .env.local
```

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

```bash
pnpm dev
```

Frontend: [http://localhost:3000](http://localhost:3000)

---

## Step 6: Seed Test Data

```bash
cd backend

# Generate synthetic traces for testing
poetry run python scripts/generate_traces.py

# Optional: generate adversarial traces for security testing
poetry run python scripts/generate_adversarial_traces.py
```

---

## Step 7: Verify Everything Works

```bash
# Backend health
curl http://localhost:8000/api/health

# Run the test suite
cd backend && poetry run pytest

# Frontend type check
cd frontend && pnpm type-check
```

Then open [http://localhost:3000](http://localhost:3000) and try the Demo Agent page.

---

## Troubleshooting

**Backend fails to start with "Missing required environment variables":**  
Check that `DATABASE_URL`, `NEO4J_URI`, `NEO4J_PASSWORD`, `OPENAI_API_KEY`, and `COHERE_API_KEY` are all set in `backend/.env`.

**pgvector migration fails:**  
Ensure the `vector` extension is enabled in your Supabase project (Project → Database → Extensions → vector → Enable).

**Neo4j connection error:**  
The `neo4j+s://` URI scheme requires TLS. Make sure you're using the Aura URI (not `bolt://` for local Neo4j). Aura free instances may take 30 s to spin up on first use.

**JWT auth errors on the frontend:**  
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project settings. For local testing without auth, leave `SUPABASE_JWT_SECRET` unset in the backend — auth middleware is disabled automatically.

**Cohere reranking fails:**  
Check `COHERE_API_KEY`. If missing, reranking gracefully degrades to vector order — pipeline still works.
