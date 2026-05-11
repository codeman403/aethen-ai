# Troubleshooting

---

## Backend Issues

### Backend fails to start: "Missing required environment variables"

Check `backend/.env` contains all required variables:
```
OPENAI_API_KEY, COHERE_API_KEY, DATABASE_URL, NEO4J_URI, NEO4J_PASSWORD
```

Run: `cat backend/.env | grep -E "^(OPENAI|COHERE|DATABASE|NEO4J)" | wc -l` — should return 5.

### pgvector: "relation 'session_vectors' does not exist"

Run the migration:
```bash
cd backend
poetry run python scripts/migrate_to_pgvector.py
```

Also verify the pgvector extension is enabled in Supabase: Project → Database → Extensions → vector.

### Neo4j: "defunct connection" errors

Neo4j Aura aggressively drops idle connections. The service is configured with `max_connection_lifetime=200s` and `liveness_check_timeout=2s` to handle this.

If errors persist: verify `NEO4J_URI` uses `neo4j+s://` (TLS required for Aura).

### "ModuleNotFoundError" on startup

Run `poetry install` to ensure all dependencies are installed. For Docker: regenerate `requirements.txt`:
```bash
poetry export --only main --without-hashes -f requirements.txt -o requirements.txt
```

### Analysis takes > 30 s

Render free tier has a 30 s cold start after 15 min idle. The first request after idle will be slow. Upgrade to Render Starter to eliminate cold starts.

### JWT auth disabled warning at startup

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the backend env. Without these, JWT auth is automatically disabled (intentional for local dev without Supabase).

---

## Frontend Issues

### "Network Error" or CORS errors in browser

Verify `NEXT_PUBLIC_API_URL` in `frontend/.env.local` points to the correct backend URL (no trailing slash).

For production: ensure `FRONTEND_URL` on Render matches the actual Vercel deployment URL. Mismatched CORS origin is the most common issue.

### Login page redirects loop

Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in the frontend environment. These are required for Supabase auth.

### TypeScript errors in `pnpm build`

Run `pnpm type-check` to see detailed errors. Common cause: updated API response shape not reflected in frontend types. Update the type definition to match the actual response.

---

## Eval Issues

### Eval runner: "Eval dataset not found"

Generate the dataset:
```bash
cd backend
poetry run python scripts/generate_eval_dataset.py
```

### Regression gate fails with low accuracy

Check that `OPENAI_API_KEY` is set and has sufficient quota. The classifier uses GPT-4o-mini — rate limit errors will produce `UNKNOWN` classifications which fail accuracy gates.

Run fast mode for quick diagnosis:
```bash
poetry run pytest tests/test_confidence_scorer.py  # verify no regressions in scoring
poetry run python scripts/run_eval.py --mode fast --limit 5  # quick classification check
```

---

## Security Issues

### Rate limit triggered unexpectedly (429)

Default limits: 100 req/min, 1 000 req/hr per IP. If you're running automated tests or bulk ingestion from a single IP, you may hit these limits.

Solution: Add delay between requests, or temporarily increase limits in `app/utils/rate_limit.py` for local dev:
```python
RateLimitMiddleware(per_minute=500, per_hour=5000)
```

