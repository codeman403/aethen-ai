# Deployment Guide

---

## Production Architecture

| Component | Platform | Config file |
|---|---|---|
| Frontend | Vercel | `frontend/vercel.json` |
| Backend | Render (Docker) | `backend/render.yaml` + `backend/Dockerfile` |
| Database | Supabase (PostgreSQL + pgvector) | `DATABASE_URL` env var |
| Graph DB | Neo4j Aura | `NEO4J_*` env vars |

Live URLs:
- Frontend: https://aethen-ai.vercel.app
- Backend: https://aethen-ai-backend.onrender.com
- API health: https://aethen-ai-backend.onrender.com/api/health

---

## Local Development

### Prerequisites

- Node.js 20+ and pnpm 9: `npm install -g pnpm@9`
- Python 3.11+ and Poetry 2+: `pip install "poetry>=2.0.0"`
- A Supabase project with pgvector extension enabled
- Neo4j Aura free instance
- OpenAI and Cohere API keys

### Backend Setup

```bash
cd backend

# Install dependencies
poetry install

# Configure environment
cp ../.env.example .env
# Edit .env and fill in: OPENAI_API_KEY, COHERE_API_KEY, DATABASE_URL,
# NEO4J_URI, NEO4J_PASSWORD, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY

# Run database setup (create session_vectors table)
poetry run python scripts/migrate_to_pgvector.py

# Seed Neo4j schema
poetry run python scripts/seed_neo4j.py

# Start development server
poetry run uvicorn app.main:app --reload --port 8000
```

Backend available at: http://localhost:8000  
API docs (Swagger): http://localhost:8000/docs

### Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Configure environment
cp .env.local.example .env.local
# Set: NEXT_PUBLIC_API_URL=http://localhost:8000
# Set: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# Start development server
pnpm dev
```

Frontend available at: http://localhost:3000

### Seed Demo Data

```bash
cd backend

# Generate synthetic sessions for testing
poetry run python scripts/generate_traces.py

# Reset and reseed everything
poetry run python scripts/reset_and_reseed.py
```

---

## Deploying to Render (Backend)

### First Deploy

1. Go to [render.com](https://render.com) → New → **Blueprint**
2. Connect your GitHub repository
3. Render detects `backend/render.yaml` automatically
4. Fill in the secret env vars in the Render dashboard (all marked `sync: false`):

   ```
   ANTHROPIC_API_KEY
   OPENAI_API_KEY
   COHERE_API_KEY
   DATABASE_URL
   NEO4J_URI
   NEO4J_USER
   NEO4J_PASSWORD
   LANGFUSE_PUBLIC_KEY
   LANGFUSE_SECRET_KEY
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_JWT_SECRET
   CREDENTIAL_ENCRYPTION_KEY
   ADMIN_EMAILS
   SENTRY_DSN (optional)
   RESEND_API_KEY (optional)
   ```

5. Click **Apply** — Render builds the Docker image and deploys

### Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

`requirements.txt` is generated from `poetry.lock` via `poetry export --only main --without-hashes`. No Poetry needed at build time.

### Render Configuration (`render.yaml`)

```yaml
services:
  - type: web
    name: aethen-ai-backend
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /api/health
```

### Updates

Push to `main` — Render automatically rebuilds and deploys. Smoke tests in `.github/workflows/smoke.yml` run after deploy; if they fail, the previous deploy is automatically restored.

> **Note:** Render free tier spins down after 15 minutes of inactivity. Expect a ~30 s cold start on the next request.

---

## Deploying to Vercel (Frontend)

### First Deploy

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set **Root Directory** to `frontend` (Vercel may auto-detect via `vercel.json`)
3. Add environment variables in Vercel dashboard:

   ```
   NEXT_PUBLIC_API_URL=https://aethen-ai-backend.onrender.com
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SENTRY_DSN (optional)
   ```

4. Deploy

### Cron Jobs

`frontend/vercel.json` defines three Vercel cron jobs:

| Cron | Schedule | Endpoint |
|---|---|---|
| Pull Langfuse traces | `0 0 * * *` (00:00 UTC) | `/api/cron/pull-langfuse` |
| Pull LangSmith traces | `0 0 * * *` (00:00 UTC) | `/api/cron/pull-langsmith` |
| Send daily digest | `0 7 * * *` (07:00 UTC) | `/api/cron/digest` |

These cron routes authenticate via `CRON_SECRET` header (set in both Vercel dashboard and backend env).

---

## Environment Variables Reference

See `.env.example` at the repo root. Complete list with descriptions:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | OpenAI API key (classifier + embeddings) |
| `ANTHROPIC_API_KEY` | No | Anthropic key (falls back to GPT-4o-mini) |
| `COHERE_API_KEY` | **Yes** | Cohere key (Rerank v3) |
| `DATABASE_URL` | **Yes** | Supabase PostgreSQL connection string |
| `NEO4J_URI` | **Yes** | Neo4j Aura URI (`neo4j+s://...`) |
| `NEO4J_USER` | **Yes** | Neo4j user (default: `neo4j`) |
| `NEO4J_PASSWORD` | **Yes** | Neo4j password |
| `LANGFUSE_PUBLIC_KEY` | No | Langfuse project public key |
| `LANGFUSE_SECRET_KEY` | No | Langfuse project secret key |
| `LANGFUSE_BASE_URL` | No | Default: `https://us.cloud.langfuse.com` |
| `LANGSMITH_API_KEY` | No | LangSmith API key |
| `SUPABASE_URL` | No | Supabase project URL (auth middleware) |
| `SUPABASE_ANON_KEY` | No | Supabase anon key (auth middleware) |
| `SUPABASE_JWT_SECRET` | No | JWT secret (HS256 fallback) |
| `ADMIN_EMAILS` | No | Comma-separated admin emails |
| `CREDENTIAL_ENCRYPTION_KEY` | No | Fernet key for per-org credential encryption |
| `RESEND_API_KEY` | No | Resend API key (email) |
| `EMAIL_FROM` | No | Sender address `"Aethen <hello@domain.com>"` |
| `SENTRY_DSN` | No | Sentry project DSN |
| `SENTRY_ENVIRONMENT` | No | Default: `development` |
| `CRON_SECRET` | No | Shared secret for Vercel cron authentication |
| `FRONTEND_URL` | No | Default: `http://localhost:3000` |
| `PII_REDACTION_ENABLED` | No | Default: `true` |
| `LOG_LEVEL` | No | Default: `INFO` |
| `DEBUG` | No | Default: `false` |

---

## Health Check

```bash
curl https://aethen-ai-backend.onrender.com/api/health
```

Returns:
```json
{
  "data": {
    "status": "ok",
    "services": {
      "postgres": "connected",
      "neo4j": "connected",
      "embedding": "ready"
    }
  }
}
```

---

## Rollback

**Manual rollback (Render):**
1. Render dashboard → Service → Deploys
2. Select a previous deploy → **Rollback**

**Automatic rollback:**
The `smoke.yml` GitHub Actions workflow triggers a Render rollback automatically if the post-deploy health checks fail. Requires `RENDER_SERVICE_ID` and `RENDER_API_KEY` in GitHub repository variables/secrets.
