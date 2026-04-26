# Testing Rules

## Philosophy
- Tests prove the system works, not that the code was written.
- Test behavior, not implementation details.
- Every bug fix must include a regression test.

## Frontend Testing

### Stack
- **Vitest** as test runner (Jest-compatible, faster with Vite).
- **React Testing Library** for component tests.
- **MSW (Mock Service Worker)** for API mocking.

### Standards
- Test files: `ComponentName.test.tsx` co-located with the component.
- Test user-visible behavior: "renders the trace list", not "calls setState".
- Use `screen.getByRole()` and `screen.getByText()` — avoid `getByTestId` unless no semantic alternative exists.
- Mock API calls with MSW handlers, never mock `fetch` directly.
- Snapshot tests are discouraged — use explicit assertions.

### What to Test
- All pages render without errors.
- Interactive components respond to user events correctly.
- Error states display appropriate messages.
- Loading states appear during data fetching.

## Backend Testing

### Stack
- **pytest** with **pytest-asyncio** for async tests.
- **httpx** `AsyncClient` for API endpoint testing.
- **unittest.mock** / **pytest-mock** for mocking external services.

### Standards
- Test files: `test_<module>.py` in `backend/tests/`, mirroring the `app/` structure.
- Use fixtures for shared setup (DB clients, test data, app instances).
- Mark async tests with `@pytest.mark.asyncio`.
- Test both success and error paths for every function.

### LangGraph Testing
- Test each node function independently with mocked state.
- Test graph routing logic: given state X, does the graph route to node Y?
- Mock all LLM calls — tests must not make real API calls.
- Use deterministic mock responses that cover:
  - Normal case
  - Empty/missing data
  - Malformed LLM output (structured output parsing failures)

### API Testing
- Test every endpoint with valid input → 200 response.
- Test with invalid input → appropriate 4xx response.
- Test with missing auth → 401/403.
- Verify response envelope structure (`data`, `error`, `metadata`).

### Integration Tests (Week 3)
The following end-to-end scenarios must pass:
1. Memory Debug — stale embedding detection
2. Tool Misfire — parameter error identification
3. Hallucination RCA — source mismatch detection
4. Blind Spot — cross-session pattern finding
5. Full pipeline — ingest → analyze → report

## Coverage
- Aim for **80%+ line coverage** on backend business logic.
- Frontend: focus on component behavior coverage over line coverage.
- CI must block PRs that decrease coverage.

## CI Integration
- Tests run on every push and PR.
- Frontend and backend test suites run in parallel.
- Failing tests block merge.

---

## Implementation Status (as of Session 10)

| Standard | Status | Notes |
|---|---|---|
| Backend pytest + pytest-asyncio | ✅ Implemented | 32 tests passing |
| Integration tests (5 scenarios) | ✅ Implemented | 7 integration + 7 adapter tests |
| LangGraph node isolation tests | ⚠️ Partial | Nodes tested via integration, not individually mocked |
| Frontend Vitest + RTL | ❌ Not started | No `.test.tsx` files exist yet |
| MSW for API mocking | ❌ Not started | Deferred — frontend tests not yet set up |
| 80%+ backend coverage | ⚠️ Below target | Core API paths covered, not measured with coverage tool |
| CI pipeline | ❌ Not started | Tests run manually only |

**Priority**: Frontend smoke tests and CI pipeline are tracked in `docs/adal/action_items.md` (A9, A10).
