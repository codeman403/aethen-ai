# Testing Guide

---

## Test Suite Overview

| Suite | Location | Count | Tool |
|---|---|---|---|
| Backend unit + integration | `backend/tests/` | 25 files | pytest + pytest-asyncio |
| Frontend type safety | `frontend/` | — | TypeScript compiler (`tsc --noEmit`) |
| Frontend unit | `frontend/src/` | Vitest | vitest |
| Live smoke tests | `.github/workflows/smoke.yml` | 3 checks | curl |

---

## Backend Tests

### Running Tests

```bash
cd backend

# Full suite
poetry run pytest

# Verbose
poetry run pytest -v

# Stop on first failure
poetry run pytest -x

# Specific file
poetry run pytest tests/test_confidence_scorer.py

# With coverage
poetry run pytest --cov=app --cov-report=term-missing
```

### Test Files and Coverage

| File | What it tests |
|---|---|
| `test_confidence_scorer.py` | 40 unit tests — all 4 failure types, edge cases, determinism, clamping, signal ordering |
| `test_integration.py` | End-to-end pipeline: ingest → classify → retrieve → analyze |
| `test_eval_pipeline.py` | Eval runner: fast + full mode, regression gate checks |
| `test_api_sessions.py` | Session CRUD API endpoints |
| `test_api_stats.py` | Dashboard stats endpoint |
| `test_api_langsmith.py` | LangSmith provider integration |
| `test_chat.py` | Chat analysis endpoint |
| `test_chat_sessions.py` | Conversation history API |
| `test_ingest.py` | Ingest endpoint validation, PII redaction |
| `test_health.py` | Health check endpoint |
| `test_qc_helpers.py` | Data quality check logic |
| `test_rerank.py` | Cohere reranking node |
| `test_pii_redactor.py` | PII detection + redaction |
| `test_mcp_tools.py` | MCP server tools |
| `test_sources_api.py` | Observability source management |
| `test_eval_api.py` | Evaluation API endpoint |
| `test_freeform_intents.py` | Free-form chat intent handling |
| `test_langfuse_adapter_extended.py` | Langfuse trace adapter |
| `test_langsmith_provider.py` | LangSmith provider |
| `test_new_features.py` | Feature regression tests |
| `test_utils.py` | Utility function tests |

### Test Configuration

`pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"    # all async test functions auto-wrapped
testpaths = ["tests"]
```

Most tests use mocking for external services (LLMs, Postgres, Neo4j) so they run in CI without real credentials. Integration tests that require live services are skipped when `DATABASE_URL` is not a real database.

### Key Test: Confidence Scorer (40 tests)

`tests/test_confidence_scorer.py` ensures the deterministic confidence scorer is never accidentally replaced with LLM self-reporting:

```python
# Example: doc ID full miss should score ~0.58+
def test_memory_doc_id_full_miss():
    session = make_session_with_retrieval(expected=["doc-A"], actual=["doc-B"])
    score, bd = compute_confidence(session, FailureType.MEMORY, 0.5)
    assert score > 0.50
    assert any(s["signal"] == "doc_id_full_miss" for s in bd.signals)
```

Run before any change to `app/agents/nodes/confidence.py`.

---

## Frontend Tests

### Type Check

```bash
cd frontend
pnpm type-check    # tsc --noEmit — zero TypeScript errors required
```

### Build Validation

```bash
cd frontend
pnpm build         # Next.js production build — must succeed with no errors
```

### Unit Tests (Vitest)

```bash
cd frontend
pnpm test          # vitest run
pnpm test:watch    # vitest interactive mode
```

---

## Evaluation as Testing

The evaluation pipeline (`POST /api/eval`) is a higher-level test that validates the full LangGraph pipeline against a golden dataset:

```bash
cd backend
poetry run python scripts/run_eval.py --mode fast   # classify-only, ~30 s
poetry run python scripts/run_eval.py --mode full   # full pipeline + LLM judge, ~5 min
```

**Regression gates** (must pass before production deployment):

| Gate | Threshold | Current |
|---|---|---|
| Classification accuracy | ≥ 90% | 100% |
| Keyword match rate | ≥ 70% | — |
| LLM judge score | ≥ 75% | 85.56% |

---

## CI/CD Tests

### `ci.yml` — Runs on push/PR to `main` and `develop`

1. **Backend** — `poetry run pytest` in `ubuntu-latest`
2. **Frontend** — `pnpm type-check` + `pnpm build`

Environment variables in CI use test values for non-critical keys (`OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY || 'test-key' }}`). Database-dependent tests are skipped when `DATABASE_URL` points to the test placeholder.

### `smoke.yml` — Runs after every push to `main`

1. Wait 30 s for deployment to stabilise
2. `curl GET /api/health` — must return 200
3. `curl GET /docs` — must return 200
4. `curl GET $FRONTEND_URL` — must return 200
5. On failure: trigger Render rollback to previous live deploy

---

## Writing New Tests

**Backend test template:**
```python
import pytest
from unittest.mock import AsyncMock, patch
from app.models.trace import Session, FailureType

@pytest.mark.asyncio
async def test_my_feature():
    session = Session(
        session_id="test-001",
        agent_id="test-agent",
        outcome="failure",
        failure_type=FailureType.MEMORY,
    )
    # test logic here
```

**Rules:**
- All tests in `backend/tests/` are auto-discovered by pytest
- Use `pytest-mock` for mocking; avoid patching `builtins`
- Do not use `time.sleep` in tests — use `AsyncMock` for async waits
- Do not hardcode live API keys — use `pytest.ini_options` env or fixture injection
