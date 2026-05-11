# Scaling

See also: [docs/architecture/scalability.md](../architecture/scalability.md) for the full analysis.

---

## Current Limits (Free Tier)

| Component | Limit | Impact |
|---|---|---|
| Render free | 512 MB RAM, shared CPU, 30 s cold start | Not production-ready |
| Supabase free | 500 MB DB, 60 MB RAM shared | ~50K sessions max |
| Neo4j Aura free | 200K nodes, 400K relationships | ~50K sessions max |

---

## Scaling Path

### Step 1: Remove Cold Starts (Render Starter, $7/mo)

Eliminates the 30 s cold start. Required for production use.

### Step 2: Scale Database (Supabase Pro, $25/mo)

- 8 GB database, 2 GB RAM
- Supports ~500K sessions
- pgvector performs well to ~1M vectors with HNSW enabled

### Step 3: Add Redis (Redis Cloud free → paid)

Replace in-memory rate limiter and token cache with Redis for multi-instance support.

### Step 4: Scale Compute (Render Standard, $25/mo)

- 1 vCPU, 2 GB RAM
- Allows 2–3 concurrent analysis requests without queuing

### Step 5: Add Ingestion Worker (Celery + Redis)

Move embedding + Neo4j seeding to background workers for high-ingest scenarios.

---

## Auto-Scaling (Kubernetes)

For enterprise-scale deployments (10K+ analyses/day):

```yaml
# Kubernetes HPA example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aethen-backend
spec:
  scaleTargetRef:
    kind: Deployment
    name: aethen-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

At this scale, replace Render with GKE/EKS, Supabase with Cloud SQL + pgvector, and Redis for distributed caching.
