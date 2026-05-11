# Scalability Analysis

---

## Current Scale

Aethen is deployed on Render (free tier) and Supabase (free tier) for the capstone. The architecture is designed to scale to a production SaaS tier with minimal structural changes.

---

## Infrastructure Breakpoints

| Component | Current limit | When to change | Change needed |
|---|---|---|---|
| **pgvector** | Exact cosine search (≤100K vectors, < 5 ms) | > 100K rows | Re-enable HNSW index (`enable_indexscan=on`) |
| **Postgres pool** | asyncpg connection pool | > 100 concurrent requests | Tune `min_size` / `max_size` on `asyncpg.create_pool` |
| **Token cache** | In-memory dict, 500 entries | Multi-instance deployment | Replace with Redis (`redis-py` async) |
| **Rate limiter** | In-memory per-IP counters | Multi-instance deployment | Replace with Redis sliding window |
| **Neo4j** | Connection pool with 200 s lifetime | High write throughput | Upgrade from Aura free to Aura Enterprise |
| **Render** | Free tier — 30 s cold start, 512 MB RAM | Production SLA | Upgrade to Render Starter ($7/mo) or Standard |

---

## Tiered SaaS Model

| Tier | Sessions/month | Vector count | Recommended infra |
|---|---|---|---|
| **Free** | 100 | ~3 000 | Render free + Supabase free |
| **Starter** | 1 000 | ~30 000 | Render Starter + Supabase Pro |
| **Growth** | 10 000 | ~300 000 | Render Standard + dedicated Postgres |
| **Enterprise** | Unlimited | Millions | Kubernetes (GKE/EKS) + Cloud SQL + Redis |

---

## Async Ingestion Queue

At high ingest volumes, the synchronous embedding + Neo4j seeding path (`POST /api/ingest`) becomes a bottleneck. The recommended upgrade:

```
POST /api/ingest → validate + store in Postgres (fast)
                  → enqueue embedding + graph jobs (async)
                  → worker pulls jobs → embed → upsert pgvector → seed Neo4j
```

Suggested: Celery + Redis or ARQ (async-native). The `backfill` endpoint (`POST /api/backfill`) already implements the worker pattern for historical sessions.

---

## LLM Concurrency

The eval runner uses `asyncio.Semaphore(5)` to cap concurrent LLM calls. Production traffic may require tuning based on API tier rate limits:

| Provider | Default RPM | Semaphore recommendation |
|---|---|---|
| OpenAI (GPT-4o-mini) | 500 RPM (tier 1) | 10–20 |
| Anthropic (Claude Haiku) | 1 000 RPM | 20–50 |
| Cohere Rerank | 1 000 RPM | 10 |

---

## Frontend Scaling

Vercel auto-scales serverless functions. No changes needed for frontend scaling.

Cron jobs (`pull-langfuse`, `pull-langsmith`, `digest`) run at 00:00 and 07:00 UTC. If ingestion volume exceeds Vercel function timeout (10 s default, 60 s max on Pro), move cron logic to a Render background worker.
