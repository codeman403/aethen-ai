# Unit Tests

See [TESTING.md](../../TESTING.md) for setup and running instructions.

---

## Key Unit Test Files

### `test_confidence_scorer.py` — 40 tests

The most important unit test file. Verifies the deterministic confidence scorer is never accidentally broken or replaced with LLM self-reporting.

Coverage:
- All 4 failure types: memory, tool_misfire, hallucination, blind_spot
- Edge cases: empty tool calls, no retrieval events, zero LLM calls
- Determinism: same input → same output every time
- Clamping: score never < 0.05 or > 0.95
- Signal ordering: stronger signals produce higher scores
- LLM adjustment range: ±0.075 max

```bash
poetry run pytest tests/test_confidence_scorer.py -v
```

### `test_pii_redactor.py`

Tests scrubadub PII detection and redaction:
- Email addresses
- Phone numbers
- Names (where detectable)
- Verifies that redacted text contains `[REDACTED]` markers

### `test_qc_helpers.py`

Tests data quality check logic:
- Session completeness scoring
- Missing field detection
- Schema validation edge cases

### `test_utils.py`

Tests utility functions including `strip_injection()`:
- Direct injection patterns (`IGNORE PREVIOUS INSTRUCTIONS`)
- Jailbreak attempts
- Benign text is not redacted
- `full_redact=True` replaces entire field on match

### `test_rerank.py`

Tests Cohere reranking node:
- Returns top-5 results
- Graceful fallback when `COHERE_API_KEY` is unset
- Handles empty evidence list

---

## Running Specific Tests

```bash
# By file
poetry run pytest tests/test_confidence_scorer.py

# By test name pattern
poetry run pytest -k "test_memory"

# With output
poetry run pytest tests/test_confidence_scorer.py -v -s

# Coverage for a module
poetry run pytest tests/test_confidence_scorer.py --cov=app/agents/nodes/confidence
```
