# Architecture Trade-offs

---

## LangGraph vs Raw LangChain Chains

**Chosen:** LangGraph `StateGraph` with typed `AgentState`

**Why:**
- Deterministic routing: conditional edges are explicit code, not LLM decisions
- Typed state flows: `AgentState(TypedDict)` catches type errors at development time
- Rollback: swap `analysis_graph = _legacy_analysis_graph` in one line
- Parallel execution: LangGraph handles `parallel_start` → multiple-edge fan-out natively
- Human-in-the-loop: checkpointing support built-in (not used in v0.1 but available)

**Trade-off:** More upfront setup. A simple sequential LangChain chain would have been faster to build initially.

---

## pgvector vs Pinecone

**Chosen:** pgvector (Postgres extension)

**Why:**
- No external SaaS dependency — collocated with session data, no extra connection
- Lower latency at small-medium dataset sizes (< 100K vectors) — exact cosine search in < 5 ms
- No monthly cost (Postgres already required for session storage)
- `org_id` column provides native tenant isolation with SQL semantics

**Trade-off:**
- No managed index tuning — HNSW index must be re-enabled manually at scale
- Postgres RAM scales with dataset size (HNSW index = ~200 bytes/vector in RAM)
- Migration from Pinecone required (`scripts/migrate_to_pgvector.py`)

---

## `fast_analyze` (1 LLM call) vs Separate Modules + Synthesize

**Chosen:** `fast_analyze` — merged analysis + synthesis

**Why:**
- 9–12 s vs 25–30 s for legacy pipeline (saves ~14–18 s per request)
- Eval confirmed 100% classification accuracy maintained (no regression)
- LLM judge score improved from 83% to 85.56% after merge
- Single context window means the model has full trace + evidence for both classification and root cause simultaneously

**Trade-off:**
- Less explainable — no intermediate per-module findings to inspect
- Harder to debug when analysis output is unexpected (no separate synthesis step to isolate)
- Legacy modules (`memory_debug`, `tool_debug`, `hallucination_rca`, `blind_spot`) retained for rollback

---

## Deterministic Confidence vs LLM Self-Reporting

**Chosen:** Deterministic evidence-based scoring in `compute_confidence()`

**Why:**
- LLMs consistently overestimate confidence — studies show systematic calibration failures
- Evidence signals are auditable: every confidence point is traceable to a specific trace signal
- Repeatable: same input always produces the same score (required for regression testing)
- LLM suggestion still influences the score at ±0.075 (keeps human intuition in the loop)

**Trade-off:**
- Signal weights (0.45, 0.58, etc.) are universal heuristics calibrated without KB access — may need domain-specific tuning for some agent types
- No access to the agent's KB means confidence in hallucination detection is surface-level

---

## Supabase Auth API Verification vs Local JWT Parsing

**Chosen:** Remote verification via `GET /auth/v1/user`

**Why:**
- Works for all sign-in methods (email, Google, GitHub) without managing signing keys
- Always returns the latest user state (revoked tokens are rejected immediately)
- No need to rotate JWT secret or manage JWKS endpoints

**Trade-off:**
- One HTTP call per uncached token (5 s timeout)
- Network dependency — if Supabase is unavailable, auth breaks
- Mitigated by 60 s in-memory token cache (500 max entries)

---

## Render Free Tier

**Chosen for capstone:** Render free tier

**Why:** Zero cost for a capstone project demonstration.

**Trade-off:** 30 s cold start after 15 min idle. Not suitable for production SLA. Upgrading to Render Starter ($7/mo) eliminates cold starts.
