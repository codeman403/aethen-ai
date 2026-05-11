# E2E Tests

---

## Current Status

Playwright is configured (`@playwright/test`, `playwright`) but E2E browser tests are not yet implemented.

**Status:** Planned for v0.2

---

## What E2E Tests Would Cover

Priority test scenarios:

1. **Demo Agent flow** — click a scenario → verify chat response appears → verify trace ID shown
2. **Analysis flow** — select a session with green dot (cached analysis) → verify report loads instantly
3. **Ingest + analyze** — import a Langfuse trace → run analysis → verify AnalysisReport renders
4. **Auth flow** — login → redirect to dashboard → verify session persists on refresh
5. **Settings** — update model selection → verify persists after page reload

---

## Setup (When Implemented)

```bash
cd frontend

# Install Playwright browsers
pnpm exec playwright install --with-deps chromium

# Run E2E tests
pnpm exec playwright test

# Run with UI
pnpm exec playwright test --ui
```

---

## Smoke Test (Current E2E Coverage)

The live smoke test in `.github/workflows/smoke.yml` provides minimal E2E coverage:
- `GET /api/health` returns 200 (backend alive)
- `GET /docs` returns 200 (API docs reachable)
- `GET https://aethen-ai.vercel.app` returns 200 (frontend alive)

This is verified on every push to `main` against the live deployment.
