# Aethen-AI — Action Items & Gap Tracker

> **Created**: 2026-04-25
> **Source**: Mid-development review (`docs/adal/mid_dev_review.md`)
> **Purpose**: Track every action item, gap, and suggestion. Each item requires explicit user approval before implementation.
>
> **Status legend**: ⬜ Not started | 🟡 Approved | 🟢 Done | ❌ Rejected/Deferred

---

## 🔴 Critical (Do Immediately)

### A1. Commit all uncommitted work to Git
**Risk**: 40+ modified/untracked files. Data loss on disk issue or accidental `git clean`.
**Action**: Stage all changes into logical, conventional commits and push to remote.
**Suggested commit grouping**:
1. `feat(backend): add postgres service, chat sessions, text-to-SQL, langfuse utils`
2. `feat(backend): add demo agent, langfuse pull, stats, sessions API endpoints`
3. `feat(backend): add abuse protection (rate limiter + sanitizer)`
4. `feat(frontend): add chat debug, trace explorer, demo agent, data quality pages`
5. `feat(frontend): upgrade dashboard with reliability gauge, clickable items`
6. `chore(backend): add Dockerfile, render.yaml, seed scripts`
7. `docs: add implementation timeline, session progress, scenarios, skills`
8. `test(backend): add integration tests and freeform intent tests`
**Status**: 🟢 Done (2026-04-26) — 8 commits pushed to main
**Affects**: All files

---

## 🟡 High Priority (Before Submission)

### A2. Fix Claude vs GPT-4o-mini documentation mismatch
**Gap**: README.md, CLAUDE.md, and proposal reference "Claude Sonnet 4.6 (Synthesis)" but actual code uses GPT-4o-mini via OpenAI proxy.
**Action**: Wired Claude Sonnet 4.6 (`claude-sonnet-4-6`) via Anthropic proxy in `get_anthropic_llm()`. Falls back to GPT-4o-mini if no key. Updated docs to reflect.
**Files updated**: `backend/app/agents/llm.py`, `README.md`, `CLAUDE.md`, `docs/implementation_timeline.md`
**Status**: 🟢 Done (2026-04-26)

### A3. Replace frontend/README.md boilerplate
**Gap**: `frontend/README.md` is the default create-next-app text. Looks unfinished.
**Action**: Rewrote with tech stack, all 9 pages, project structure tree, scripts, and env vars.
**Files updated**: `frontend/README.md`
**Status**: 🟢 Done (2026-04-26)

### A4. Align rules/ with actual implementation
**Gap**: Rules define aspirational standards the codebase doesn't fully follow. An evaluator reading both will notice.
**Action**: Added "Implementation Status" tables to all 4 rules files — honest accounting of what's implemented, partial, and deferred. Cross-references action items for tracked gaps.
**Files updated**: `rules/testing.md`, `rules/frontend.md`, `rules/git.md`, `rules/backend.md`
**Status**: 🟢 Done (2026-04-26)

### A5. Add env var validation at backend startup
**Gap**: No schema-based validation. Backend silently fails if required vars are missing.
**Action**: Added `@model_validator` to `Settings` in `app/config.py` to check for missing required fields (`openai_api_key`, `database_url`, etc.) and raise an explicit `ValueError` on startup.
**Files updated**: `backend/app/config.py`
**Status**: 🟢 Done (2026-04-26)

### A6. Deploy to Render + Vercel
**Gap**: Config files exist (`render.yaml`, `vercel.json`, `Dockerfile`) but deployment hasn't been tested.
**Action**: Fill ENV vars in Render/Vercel dashboards, deploy, verify health endpoint, run Demo Agent → Pull → Analyze end-to-end.
**Status**: ⬜

---

## 🟠 Medium Priority (Improves Quality)

### A7. Add React error boundary
**Gap**: No global error handling on frontend. LLM pipeline failures show as blank screens or console errors.
**Action**: Created `frontend/src/app/(dashboard)/error.tsx` with a premium error UI and "Try again" recovery mechanism.
**Files updated**: `frontend/src/app/(dashboard)/error.tsx`
**Status**: 🟢 Done (2026-04-26)

### A8. Add API retry with exponential backoff (frontend)
**Gap**: All `fetch` calls in `api.ts` are fire-once. LLM calls can be flaky.
**Action**: Added `fetchWithRetry()` to `lib/api.ts` with 3 retries, exponential backoff (1s, 2s, 4s), retrying strictly on 5xx/429 or network errors.
**Files updated**: `frontend/src/lib/api.ts`
**Status**: 🟢 Done (2026-04-26)

### A9. Add basic frontend tests
**Gap**: Zero `.test.tsx` files. `rules/testing.md` specifies Vitest + React Testing Library.
**Action**: Installed Vitest + React Testing Library. Added `page.test.tsx` (dashboard render) and `api.test.ts` (API client). Configured `package.json` test scripts. Fixed nested `<div>` in `<p>` hydration warnings.
**Files updated**: `frontend/vitest.config.ts`, `frontend/package.json`, `frontend/src/app/(dashboard)/__tests__/page.test.tsx`, `frontend/src/lib/__tests__/api.test.ts`, `frontend/src/app/(dashboard)/page.tsx`
**Status**: 🟢 Done (2026-04-26)

### A10. Add GitHub Actions CI pipeline
**Gap**: Tests only run manually. No automated quality gate.
**Action**: Create `.github/workflows/ci.yml` that runs on push/PR:
- Backend: `poetry install && poetry run pytest`
- Frontend: `pnpm install && pnpm type-check && pnpm build`
**Status**: ⬜

### A11. Document scope delta between proposal and implementation
**Gap**: Proposal describes features (React Flow, bubble charts, 7 Neo4j node types) that weren't implemented. Evaluators who read closely will notice.
**Action**: Created `docs/scope_adjustments.md` with 4 sections: Implemented as Proposed, Simplified, Deferred, and Architectural Pivots. Every delta explained with reasoning.
**Files updated**: `docs/scope_adjustments.md`
**Status**: 🟢 Done (2026-04-26)

---

## 🟢 Nice to Have (Polish)

### A12. Add loading.tsx files for route segments
**Gap**: No suspense boundaries. Pages show nothing while loading.
**Action**: Add `loading.tsx` to `(dashboard)/`, `(dashboard)/chat/`, `(dashboard)/traces/` with skeleton UI.
**Status**: ⬜

### A13. Auto-refresh dashboard every 60s
**Gap**: Mentioned in session_progress.md as nice-to-have.
**Action**: Add `setInterval` in dashboard page to re-fetch stats every 60 seconds.
**Status**: ⬜

### A14. Add `docker-compose.yml` for full local stack
**Gap**: Backend has `Dockerfile` but no compose file for running with local Postgres/Neo4j.
**Action**: Create `docker-compose.yml` with backend + postgres services (Neo4j is cloud-only; pgvector runs inside Postgres).
**Status**: ⬜

---

## 💡 Additional Suggestions (Value-Add)

### S1. Add a demo video/GIF to README
**Why**: A 30-second GIF showing the Demo Agent → Pull → Analyze flow is worth 1000 words. Evaluators and LinkedIn viewers will immediately understand what the project does.
**Action**: Record a screen capture of the full demo loop, convert to GIF, add to README.

### S2. Add a "How It Works" section to README with the LangGraph diagram
**Why**: The mermaid diagram in `architecture.md` is great but buried. Surface it in README where evaluators will see it first.
**Action**: Copy the pipeline mermaid diagram from `architecture.md` into README.

### S3. Create a one-page evaluator guide
**Why**: Evaluators have limited time. A `docs/EVALUATOR_GUIDE.md` that says "do these 5 things to see the full demo" removes friction.
**Suggested content**:
1. Visit live URL
2. Click Demo Agent → run all 4 scenarios
3. Go to Dashboard → Pull Langfuse
4. Click a session on any module page → see analysis
5. Go to Chat Debug → try the self-analysis scenario

### S4. Pin all dependency versions
**Why**: `poetry.lock` and `pnpm-lock.yaml` exist, but explicit version pins in `pyproject.toml` and `package.json` prevent surprise breaks on CI or fresh installs.
**Action**: Review and pin major versions for critical deps (langchain, langgraph, langfuse, next).

### S5. Add health check endpoint response time to README
**Why**: Render free tier has ~30s cold start. Documenting this sets correct expectations.
**Action**: Add a note in README under Deployment: "Free tier spins down after 15 min — first request may take ~30s."

### S6. Consider adding a project architecture diagram image
**Why**: Not all markdown renderers support mermaid. A PNG/SVG of the architecture ensures the diagram is visible on GitHub, in the PDF submission, and on LinkedIn.
**Action**: Export the mermaid diagram as an image and add to `assets/` + reference in README.

---

### A16. Fix chat follow-up detection + session context handoff
**Gap**: Analysis of session `cs-69016bf50565` revealed that follow-up questions like "what do you understand from this failure" route to `"general"` instead of `"diagnostic"`. The LLM generates ungrounded analysis text (hallucination) instead of running the LangGraph pipeline. No mechanism to bind a data-path session_id to the next diagnostic question.
**Action** (all in `backend/app/api/chat.py`):
1. Add `_extract_session_id_from_history()` regex helper — finds last session_id mentioned in assistant messages
2. Update `_llm_route` prompt — instruct LLM to return `session_id` in diagnostic intent when history contains a referenced session
3. Update diagnostic path — when `route_result` has `session_id`, fetch that exact session via `postgres_service.get_session()` instead of random failure_type lookup
4. Add general path guard — redirect to "ask me to diagnose it" when session_id is in context and LLM response looks like analysis
**Files**: `backend/app/api/chat.py`
**Status**: 🟢 Done (2026-04-26)

### A15. Document and validate `_infer_failure_type` retain decision
**Gap**: Audit (Session 12) found `_infer_failure_type` in `langfuse_provider.py` is mostly dead in the analysis pipeline — `classify_intent` always overwrites it. Keeping it for two reasons only: (a) display pre-label before analysis runs, (b) `retrieve.py:76` Neo4j pattern matching depends on it.
**Action**: Add inline comment to `_infer_failure_type` stating its narrow role. Add comment to `retrieve.py:76` explaining it reads pre-set label as a hint. No code deletion — retain is the decision.
**Status**: ⬜

---

---

## 🔴 Outstanding UI Issues (From Session 15-16, Unresolved)

> **Carried forward**: User confirmed these issues persist after multiple attempts. Must be addressed in next session.

### U1. Results positioning — pin to top, not buried at bottom
**Issue**: Diagnostic results (analysis output) appear below the fold / at the bottom of the detail panel. User must scroll down to see them.
**Required**: Results/findings/summary should render at the TOP of the detail panel, immediately visible without scrolling. Raw session logs/context should be below.
**Pages affected**: All diagnostic pages (memory-debug, tool-misfire, hallucination-rca, blind-spots)
**Status**: ⬜

### U2. "Analyzing..." state not prominent enough
**Pages affected**: All diagnostic pages
**Status**: 🟢 Done (2026-04-29) — large centered spinner + backdrop-blur overlay added to all 4 module pages

### U3. Search boxes on all pages
**Pages affected**: All diagnostic pages with session lists
**Status**: 🟢 Done (already implemented) — SessionsList has search input + date filter wired to filteredSessions

### U4. Redundant info and light/small fonts
**Issue**: Some UI elements show redundant information (duplicate labels, repeated data). Font weights are too light and sizes too small in places, reducing readability.
**Required**: Audit all diagnostic pages — remove duplicate info, increase font weights (medium→semibold for labels, normal→medium for body text), ensure minimum text-sm across all content.
**Pages affected**: All pages
**Status**: ⬜

### U5. General layout/styling issues still present
**Issue**: User reported "same issue" persists despite multiple rounds of fixes. Likely a combination of the above + possible rendering/build issues.
**Required**: Fresh visual audit of all pages in next session — compare against user expectations, fix incrementally with user feedback at each step.
**Status**: ⬜

---

---

## 🔵 RAG Quality Improvements (from `docs/adal/rag_analysis.md`)

> Full analysis and rating in `docs/adal/rag_analysis.md`. Current rating: **6.5/10**.
> All items below target the weak points identified in that review.

### R1. Improve query formulation in `vector_retrieve`
**File**: `backend/app/agents/nodes/retrieve.py`
**Status**: 🟢 Done (2026-04-29) — failure-type-aware query phrases replace naive pipe-joined concatenation

### R2. Fix graph result serialization for reranker
**File**: `backend/app/agents/nodes/rerank.py`
**Status**: 🟢 Done (2026-04-29) — all 5 graph result types now produce content-bearing strings

### R3. Make rerank query failure-type-aware
**File**: `backend/app/agents/nodes/rerank.py`
**Status**: 🟢 Done (2026-04-29) — rerank query uses failure-type vocabulary instead of session ID

### R4. Add retrieval quality logging
**Files**: `backend/app/agents/nodes/rerank.py`
**Status**: 🟢 Done (2026-04-29) — min_score, avg_score, above_threshold added to rerank_complete log

### R5. Move retrieved evidence higher in analysis node prompts
**Files**: `backend/app/agents/nodes/memory_debug.py`, `tool_debug.py`, `hallucination_rca.py`, `blind_spot.py`
**Status**: 🟢 Done (2026-04-29) — cross-session evidence block moved to top of all 4 context builders

---

## Change Log

| Date | Item | Action | Notes |
|------|------|--------|-------|
| 2026-04-25 | — | File created from mid-dev review | — |
| 2026-04-26 | A15 | Added from Session 12 classification audit | `_infer_failure_type` retain decision documented |
| 2026-04-27 | U1-U5 | Added outstanding UI issues from Sessions 15-16 | Results positioning, analyzing state, search, fonts, layout |
| 2026-04-28 | R1-R5 | Added RAG improvement items from codebase review | Full analysis in `docs/adal/rag_analysis.md` |
| 2026-04-29 | R1-R5 | Implemented all RAG fixes | retrieve.py, rerank.py, all 4 analysis nodes |
| 2026-04-29 | U2 | Analyzing overlay added to all 4 module pages | backdrop-blur + centered spinner |
| 2026-04-29 | U3 | Marked done — was already implemented in SessionsList | search + date filter already wired |
