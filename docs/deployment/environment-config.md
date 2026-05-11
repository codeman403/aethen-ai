# Environment Configuration

---

## Complete Variable Reference

### Backend (`backend/.env`)

```env
# ── App ──────────────────────────────────────────────────────────────────────
APP_NAME="Aethen-AI Backend"   # Default: "Aethen-AI Backend"
DEBUG=false                     # Default: false; set true for local dev
LOG_LEVEL=INFO                  # DEBUG | INFO | WARNING | ERROR

# ── LLM Providers ────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=              # Optional; falls back to GPT-4o-mini if unset
ANTHROPIC_BASE_URL=             # Optional; for proxy/custom endpoints
OPENAI_API_KEY=                 # REQUIRED
OPENAI_BASE_URL=                # Optional; for proxy/custom endpoints
COHERE_API_KEY=                 # REQUIRED (Rerank v3)

# ── PostgreSQL + pgvector ─────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
# REQUIRED. Supabase: Settings → Database → Connection string → URI (Session mode, port 5432)
# pgvector extension must be enabled in the Supabase project

# ── Neo4j Aura ───────────────────────────────────────────────────────────────
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io   # REQUIRED
NEO4J_USER=neo4j                                # Default: neo4j
NEO4J_PASSWORD=                                 # REQUIRED

# ── Observability ─────────────────────────────────────────────────────────────
LANGFUSE_PUBLIC_KEY=            # Optional; required for full trace feature
LANGFUSE_SECRET_KEY=            # Optional
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com  # Default

LANGSMITH_API_KEY=              # Optional
LANGSMITH_ENDPOINT=https://api.smith.langchain.com  # Default
LANGSMITH_PROJECT=Aethen        # Default

# ── Supabase Auth ─────────────────────────────────────────────────────────────
SUPABASE_URL=https://xxxxx.supabase.co  # Optional; disables JWT auth if unset
SUPABASE_ANON_KEY=eyJ...               # Optional
SUPABASE_JWT_SECRET=                    # Optional; HS256 fallback

# ── Admin ─────────────────────────────────────────────────────────────────────
ADMIN_EMAILS=admin@example.com,ops@example.com   # Optional; comma-separated

# ── Credential Encryption ─────────────────────────────────────────────────────
CREDENTIAL_ENCRYPTION_KEY=      # Optional; required for per-org LLM key feature
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# ── Email ─────────────────────────────────────────────────────────────────────
RESEND_API_KEY=                 # Optional; required for email digest feature
EMAIL_FROM="Aethen <hello@yourdomain.com>"  # Optional

# ── Error Monitoring ──────────────────────────────────────────────────────────
SENTRY_DSN=                     # Optional
SENTRY_ENVIRONMENT=development  # Default: development

# ── Cron ─────────────────────────────────────────────────────────────────────
CRON_SECRET=                    # Optional; required for Vercel cron auth

# ── Frontend ─────────────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:3000  # Default

# ── Features ─────────────────────────────────────────────────────────────────
PII_REDACTION_ENABLED=true      # Default: true
USE_PGVECTOR=true               # Default: true (Pinecone backend removed)
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000      # Backend URL
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Optional
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

---

## Environment Precedence

1. Environment variables set in the OS shell
2. Variables from `backend/.env` (loaded with `override=True` by python-dotenv)

Use `DEBUG=true` locally to get dev-friendly console log output (not JSON).

---

## Validation at Startup

`app/config.py` validates required variables at import time:

```python
required_fields = ["openai_api_key", "cohere_api_key", "database_url", "neo4j_uri", "neo4j_password"]
```

If any are missing, the backend refuses to start with a clear error message listing the missing variables. This prevents silent misconfigurations.

Optional features degrade gracefully when their variables are unset: Langfuse tracing is skipped, JWT auth is disabled, email digest is disabled, etc.
