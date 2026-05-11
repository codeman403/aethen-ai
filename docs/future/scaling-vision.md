# Scaling Vision

---

## Phase 1: Production-Ready (Current → v0.2)

Remove the two main blockers for production use:

1. **Render Starter** — eliminates cold starts, enables sustained load
2. **Streaming SSE** — removes 9 s wait, improves perceived performance

At this phase, Aethen can support:
- 1 org, 10 users, 100 analyses/day
- Render Starter + Supabase free tier

---

## Phase 2: Early SaaS (~50–500 organisations)

Infrastructure upgrades:
- Redis for distributed caching (rate limiter + token cache)
- Async ingestion queue (Celery + Redis or ARQ)
- Supabase Pro (8 GB DB, pgvector HNSW enabled)
- Render Standard (1 vCPU, 2 GB RAM)

Product additions:
- Usage billing integration (Stripe)
- Organisation invites and role management
- Webhook-triggered auto-analysis
- Slack / PagerDuty integration

---

## Phase 3: Enterprise Scale (500+ organisations)

Infrastructure:
- Kubernetes (GKE/EKS) for backend
- Cloud SQL with pgvector (or AlloyDB)
- Redis Cluster for distributed caching
- Neo4j Aura Enterprise (dedicated instances)
- CDN for frontend (already Vercel)

Product additions:
- Fine-tuned classifier (lower latency, lower cost)
- Multi-region deployment for data residency
- Custom failure taxonomy per org
- SSO (SAML 2.0, OIDC)
- Audit logs
- SLA guarantees

---

## Estimated Cost Scaling

| Users | Analyses/day | Monthly cost (infra only) |
|---|---|---|
| 10 | 100 | ~$50 |
| 100 | 1 000 | ~$200 |
| 1 000 | 10 000 | ~$1 000 |
| 10 000 | 100 000 | ~$5 000–10 000 |

LLM cost scales linearly at ~$0.006/analysis:
- 100 analyses/day = ~$18/month
- 10 000 analyses/day = ~$1 800/month
