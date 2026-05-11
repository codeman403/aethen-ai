# CI/CD Pipeline

---

## Overview

Aethen has two GitHub Actions workflows:

| Workflow | File | Trigger | Purpose |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | Push/PR to `main`, `develop` | Backend tests + frontend build |
| **Smoke Test** | `.github/workflows/smoke.yml` | Push to `main` | Live health check + auto-rollback |

---

## CI Workflow (`ci.yml`)

```mermaid
flowchart LR
    PUSH["Push to main/develop\nor PR opened"]
    BACK["Backend job\nubuntu-latest"]
    FRONT["Frontend job\nubuntu-latest"]

    PUSH --> BACK & FRONT

    BACK --> B1["Setup Python 3.11"]
    B1 --> B2["pip install poetry"]
    B2 --> B3["poetry install --with dev"]
    B3 --> B4["poetry run pytest"]

    FRONT --> F1["Setup Node 20"]
    F1 --> F2["npm install -g pnpm@9"]
    F2 --> F3["pnpm install --frozen-lockfile"]
    F3 --> F4["pnpm type-check"]
    F4 --> F5["pnpm build"]
```

Both jobs run in parallel. CI fails if either job fails.

### Backend CI Environment

Test runs with placeholder values for keys not available in CI secrets:
```yaml
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY || 'test-key' }}
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY || 'test-key' }}
  DATABASE_URL: ${{ secrets.DATABASE_URL || 'postgresql://test:test@localhost:5432/test' }}
```

Tests that require live services are skipped or mocked when running against placeholder credentials.

### Frontend CI Environment

```yaml
env:
  NEXT_PUBLIC_API_URL: http://localhost:8000
```

The build validates TypeScript, module resolution, and Next.js compilation. No Supabase or API keys needed.

---

## Smoke Test Workflow (`smoke.yml`)

Runs after every push to `main` — after the deployment has been applied to Render and Vercel.

```mermaid
flowchart TD
    PUSH["Push to main"]
    WAIT["Wait 30 s\n(deployment stabilise)"]
    H1["GET /api/health → 200?"]
    H2["GET /docs → 200?"]
    H3["GET $FRONTEND_URL → 200?"]
    PASS["✅ All smoke tests passed"]
    FAIL["❌ Smoke test failed"]
    ROLLBACK["Trigger Render rollback\nto previous live deploy"]

    PUSH --> WAIT --> H1 --> H2 --> H3
    H3 -->|all pass| PASS
    H1 -->|fail| FAIL
    H2 -->|fail| FAIL
    H3 -->|fail| FAIL
    FAIL --> ROLLBACK
```

### Required Repository Variables/Secrets

| Name | Type | Purpose |
|---|---|---|
| `BACKEND_URL` | Variable | Live backend URL (`https://aethen-ai-backend.onrender.com`) |
| `FRONTEND_URL` | Variable | Live frontend URL (`https://aethen-ai.vercel.app`) |
| `RENDER_SERVICE_ID` | Variable | Render service ID for rollback |
| `RENDER_API_KEY` | Secret | Render API key for rollback API |

If `BACKEND_URL` is not set, the smoke test job is skipped (safe for forks/PRs).

### Rollback Mechanism

On failure:
1. Fetches the previous "live" deploy from Render API
2. Triggers a rollback to that deploy via `POST /v1/services/{id}/deploys/{deploy_id}/rollback`
3. Writes a summary to the GitHub Actions job summary

---

## Branch Protection

Recommended settings for `main`:
- Require CI workflow to pass before merge
- Require at least 1 approving review
- Require branches to be up to date before merging
- No force pushes

---

## Deployment Triggers

| Event | What deploys |
|---|---|
| Push to `main` | Render auto-deploy (backend) + Vercel auto-deploy (frontend) |
| Pull request | CI only — no deployment |
| Manual trigger | Both workflows support `workflow_dispatch` |
