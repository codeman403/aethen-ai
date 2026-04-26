# Backend Rules — Python / FastAPI / LangGraph

## Language & Runtime
- **Python 3.11+** with type hints on all function signatures.
- **Poetry** for dependency management — never use pip directly.
- **Ruff** for linting and formatting (replaces black, isort, flake8).

## API Design

### FastAPI
- All route handlers must be `async def`.
- Group routes by domain in separate routers: `api/traces.py`, `api/analysis.py`.
- Use dependency injection (`Depends()`) for shared services (DB connections, auth).
- Response envelope for all endpoints:
  ```python
  {
      "data": <payload>,       # The actual response data
      "error": <str | null>,   # Error message if failed
      "metadata": {            # Optional metadata
          "request_id": "...",
          "duration_ms": 123
      }
  }
  ```

### Pydantic v2
- All request/response bodies must be Pydantic `BaseModel` subclasses.
- Use `Field()` with descriptions for all fields — these become API docs.
- Validate at the boundary — inner services work with validated models, not raw dicts.
- Use `model_config = ConfigDict(strict=True)` for critical models.

## LangGraph / LangChain

### State Machine Design
- Each module (Memory Debug, Tool Misfire, Hallucination RCA, Blind Spot) is a separate LangGraph `StateGraph`.
- State must be a typed `TypedDict` or `dataclass` with clear field documentation.
- Every node function has a single responsibility — no God nodes.
- Conditional edges must have explicit routing functions with logging.
- Always define `END` states — no infinite loops.

### LLM Calls
- Wrap all LLM calls in retry logic with exponential backoff.
- Use structured outputs (`with_structured_output()`) whenever possible.
- Log all LLM inputs/outputs at DEBUG level for traceability.
- Never hardcode model names — use config module.
- Temperature and other params are per-use-case constants in config, not inline.

### Prompts
- Store prompts as constants or templates in dedicated files (`app/prompts/`).
- Use f-strings or `.format()` for variable injection — never string concatenation.
- Include system prompts that define the module's role and output format.

## Database Access

### Pinecone (Vector DB)
- Use async client where available.
- Always specify `namespace` for multi-tenant or multi-module isolation.
- Include metadata filters in queries — never rely on vector similarity alone.
- Log query latency and result counts.

### Neo4j (Graph DB)
- Use async driver (`neo4j.AsyncDriver`).
- Parameterize ALL Cypher queries — never interpolate user input.
- Close sessions/transactions explicitly (use `async with`).
- Define graph schema (node labels, relationship types) in a central schema file.

## Error Handling
- Catch specific exceptions — never bare `except:` or `except Exception:` without re-raising.
- Use custom exception classes for domain errors: `TraceNotFoundError`, `AnalysisFailedError`.
- HTTP errors must return appropriate status codes with the response envelope.
- Log errors with full context (request ID, input params, stack trace).

## Configuration
- All config via environment variables, loaded through a Pydantic `Settings` class.
- Never access `os.environ` directly outside the config module.
- Provide sensible defaults for non-secret values.
- Secrets (`*_API_KEY`, `*_PASSWORD`) must never have defaults.

## Logging
- Use `structlog` for structured JSON logging.
- Log levels: `DEBUG` for tracing, `INFO` for key operations, `WARNING` for recoverable issues, `ERROR` for failures.
- Include `request_id` in all log entries for correlation.
- Never log secrets, full API keys, or PII.

## Testing
- See `rules/testing.md` for full testing standards.
- Every LangGraph node must be testable in isolation with mocked LLM responses.
- Every API endpoint must have integration tests.

---

## Implementation Status (as of Session 10)

| Standard | Status | Notes |
|---|---|---|
| Python 3.11+, Poetry, Ruff | ✅ Implemented | Type hints on all public functions |
| Async route handlers | ✅ Implemented | All endpoints are `async def` |
| Response envelope `{data, error}` | ✅ Implemented | Consistent across all endpoints |
| Pydantic v2 models | ✅ Implemented | Request/response bodies validated |
| LangGraph state machine | ✅ Implemented | Single graph with conditional routing to 4 modules |
| LLM factory (no hardcoded models) | ✅ Implemented | `app/agents/llm.py` — centralized factory |
| Retry logic on LLM calls | ❌ Not implemented | LLM calls are fire-once; LangChain has built-in retry but not explicitly configured |
| Custom exception classes | ❌ Not implemented | Uses generic `Exception` / `ValueError`. Deferred — functional but less precise error reporting |
| Prompts in dedicated files | ⚠️ Partial | Prompts are constants in node files, not in a separate `app/prompts/` directory |
| Secrets have no defaults | ⚠️ Not enforced | API keys default to `""` in config — allows graceful degradation but doesn't fail-fast on missing keys |
| structlog logging | ✅ Implemented | JSON structured logging with request correlation |
| Postgres as source of truth | ✅ Implemented | Neo4j is graph-only, Pinecone is vectors-only |
