# Cloud Deployment

See [DEPLOYMENT.md](../../DEPLOYMENT.md) for the complete step-by-step guide.

---

## Architecture

```
[Vercel]  ─────── Frontend (Next.js)
    │
    │ HTTPS
    ▼
[Render]  ─────── Backend (FastAPI, Docker)
    │
    ├── [Supabase]  ── PostgreSQL + pgvector
    ├── [Neo4j Aura] ── Graph DB
    ├── [Langfuse]   ── Observability / eval scores
    ├── [OpenAI]     ── Embeddings + GPT-4o-mini
    ├── [Anthropic]  ── Claude Haiku 4.5
    ├── [Cohere]     ── Rerank v3
    ├── [Resend]     ── Email
    └── [Sentry]     ── Error tracking
```

---

## Service Configuration Summary

| Service | Plan | Cost | Notes |
|---|---|---|---|
| Vercel | Hobby (free) | $0 | Frontend + cron |
| Render | Free | $0 | 30 s cold start after 15 min idle |
| Supabase | Free | $0 | 500 MB DB, 1 GB bandwidth |
| Neo4j Aura | Free | $0 | 200K nodes, 400K relationships |
| OpenAI | Pay-per-use | ~$0.003/analysis | Embeddings + GPT-4o-mini |
| Cohere | Pay-per-use | ~$0.002/rerank | Rerank v3 |
| Anthropic | Pay-per-use | ~$0.001/analysis | Claude Haiku 4.5 |
| Langfuse | Free cloud | $0 | Unlimited traces on free tier |
| Sentry | Free | $0 | 5K errors/month |

**Total for capstone:** $0/month infrastructure + ~$0.01 per analysis.

---

## Production Checklist

Before promoting to production:

- [ ] `SUPABASE_JWT_SECRET` set (enables JWT auth)
- [ ] `CREDENTIAL_ENCRYPTION_KEY` set (enables per-org LLM keys)
- [ ] `ADMIN_EMAILS` set
- [ ] `SENTRY_DSN` set
- [ ] `CRON_SECRET` set in both Vercel and Render
- [ ] GitHub Actions secrets set (`BACKEND_URL`, `FRONTEND_URL`, `RENDER_SERVICE_ID`, `RENDER_API_KEY`)
- [ ] Smoke test workflow verified working (test manual `workflow_dispatch`)
- [ ] pgvector migration run (`scripts/migrate_to_pgvector.py`)
- [ ] Neo4j schema seeded (`scripts/seed_neo4j.py`)
- [ ] Eval passes regression gates (`POST /api/eval`, `mode=fast`)

---

## Domain Configuration

To use a custom domain:

**Frontend (Vercel):**
1. Vercel dashboard → Project → Settings → Domains
2. Add domain and configure DNS CNAME record

**Backend (Render):**
1. Render dashboard → Service → Settings → Custom Domain
2. Add domain and configure DNS A record
3. Update `FRONTEND_URL` on Render to match the actual frontend domain (for CORS)
