# Technical Debt

---

## Known Issues

### `render.yaml` Contains Stale Pinecone Variables

The `backend/render.yaml` still includes `PINECONE_API_KEY` and `PINECONE_INDEX` environment variable declarations from before the migration to pgvector. These are no longer used in the application code.

**Impact:** No functional impact; harmless dead config. Confusing for new contributors.  
**Fix:** Remove `PINECONE_API_KEY` and `PINECONE_INDEX` lines from `render.yaml`.

### In-Memory Rate Limiter and Token Cache

Both the rate limiter (`app/utils/rate_limit.py`) and JWT token cache (`app/middleware/auth.py`) use in-memory dicts. These do not persist across process restarts and do not work correctly with multiple backend instances.

**Impact:** Low at current single-instance Render deployment.  
**Fix:** Replace with Redis (`redis-py` async) when scaling to multiple instances.

### `ci.yml` References PINECONE_API_KEY

The backend CI workflow passes `PINECONE_API_KEY` as an environment variable. This is dead config from the Pinecone era.

**Impact:** No functional impact.  
**Fix:** Remove `PINECONE_API_KEY` and `PINECONE_INDEX` from `ci.yml` env block.

### `delete-later/` Directory at Repo Root

A `delete-later/` directory exists at repo root with Python fix scripts from development. These are not gitignored and appear in `git status`.

**Impact:** Cosmetic. Confusing for new contributors.  
**Fix:** Delete the directory or add to `.gitignore`.

---

## Scalability Gaps

| Item | Priority | Notes |
|---|---|---|
| Async ingestion queue | High | Needed at > 100 ingests/min |
| Redis for rate limiting + token cache | Medium | Needed for multi-instance |
| HNSW index re-enable at scale | Low | Auto-needed at > 100K vectors |
| Eval runner concurrency tuning | Low | `Semaphore(5)` may be too conservative at higher API tiers |

---

## Missing Tests

| Area | Missing | Priority |
|---|---|---|
| E2E tests (Playwright) | No end-to-end browser tests | Medium |
| Load tests | No load/stress tests | Low |
| Security header middleware tests | Not in test suite | Low |
| Rate limiter middleware tests | Not in test suite | Low |
| PII redactor middleware (negative cases) | Only positive cases | Medium |

---

## Documentation Gaps

| Area | Gap | Priority |
|---|---|---|
| Real-world eval dataset | Only synthetic sessions | High |
| SDK usage examples | README only | Medium |
| MCP server documentation | No user-facing docs | Low |

---

## Dependency Notes

| Dependency | Note |
|---|---|
| `fastapi (>=0.136.1,<0.137.0)` | Pinned to a minor range — upgrade when available |
| `anthropic (>=0.97.0,<0.98.0)` | Pinned tightly — monitor for Claude model updates |
| `langgraph (>=1.1.9,<2.0.0)` | Major version range — test carefully on upgrades |
| `cohere (>=5.21,<6.0)` | Current rerank v3 model compatibility |
