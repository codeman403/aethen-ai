# Contributing to Aethen-AI

Thank you for your interest in contributing. This guide covers the conventions and workflow required for all contributions.

---

## Development Setup

```bash
# Clone and install
git clone https://github.com/codeman403/aethen-ai
cd aethen-ai

# Backend
cd backend && poetry install && cd ..

# Frontend
cd frontend && pnpm install && cd ..

# Copy and fill environment variables
cp .env.example backend/.env
```

Minimum required keys to run locally:
- `OPENAI_API_KEY`
- `COHERE_API_KEY`
- `DATABASE_URL` (Supabase PostgreSQL, pgvector extension enabled)
- `NEO4J_URI` + `NEO4J_PASSWORD`

---

## Branching

| Type | Pattern | Example |
|---|---|---|
| New feature | `feat/<module>` | `feat/streaming-analysis` |
| Bug fix | `fix/<description>` | `fix/confidence-clamp` |
| Documentation | `docs/<topic>` | `docs/rag-pipeline` |
| Refactor | `refactor/<scope>` | `refactor/neo4j-service` |
| Chore | `chore/<scope>` | `chore/update-deps` |

Never push directly to `main` or `develop`. Open a PR.

---

## Commit Messages

Follow Conventional Commits:

```
feat: add streaming SSE for analysis results
fix: clamp confidence to 0.05 minimum on empty tool calls
chore: update LangGraph to 1.2.0
docs: add pgvector schema to ARCHITECTURE.md
test: add confidence scorer edge case for empty retrieval
refactor: extract strip_injection into utils/sanitize.py
```

---

## Code Conventions

See `rules/` for the full specification. Key points:

**Backend (Python):**
- Pydantic v2 for all models and validation
- All I/O operations must be `async`
- No bare `except` — catch specific exceptions
- No `any` types — use Pydantic models or typed TypedDicts
- Config via `app/config.py` only — never read `os.environ` directly in business logic
- `structlog` for all logging (structured JSON in production, dev renderer locally)

**Frontend (TypeScript):**
- Server Components by default; `"use client"` only for state, effects, browser APIs
- Tailwind CSS only — no CSS modules, no styled-components
- shadcn/ui for all base UI primitives
- No `any` types

---

## Testing

All PRs must pass the full test suite:

```bash
# Backend
cd backend
poetry run pytest                          # full suite
poetry run pytest -x                       # stop on first failure
poetry run pytest tests/test_confidence_scorer.py  # specific file

# Frontend
cd frontend
pnpm type-check                            # TypeScript
pnpm build                                 # Production build validation
```

**Coverage requirements:**
- All new API endpoints must have at least one test in `tests/`
- All new LangGraph nodes must have isolation tests
- Confidence scoring changes require updating `tests/test_confidence_scorer.py`

---

## Pull Request Checklist

- [ ] Tests pass locally (`poetry run pytest` + `pnpm type-check`)
- [ ] No source code modified for documentation-only PRs
- [ ] No secrets or API keys committed
- [ ] PR description explains the change and links to any related issues
- [ ] Architectural changes update `ARCHITECTURE.md`

---

## Architecture Decisions

Before making architectural changes, read `docs/implementation_timeline.md`. It documents every major choice, failure, pivot, and lesson since project inception.

**Critical constraints (do not change without understanding them):**
- `analysis_graph` uses `fast_analyze` (not the legacy separate-modules pipeline) — eval confirmed 85.56% judge score; do not re-add `synthesize` without re-running evals
- `AnalysisReport.confidence` is computed by `compute_confidence()`, not LLM self-reporting — do not replace with `float(parsed.get("confidence"))`
- Per-org LLM credentials use `contextvars.ContextVar` — never pass credentials through function arguments

---

## Security

Do not commit credentials, API keys, or any `.env` file. If you discover a security vulnerability, report it privately via GitHub Security Advisories rather than opening a public issue.
