# Aethen-AI — 360° System Flow Diagram

> Complete prompt-to-output flow for every route Aethen can take.
> Covers all user types, entry points, pipeline branches, and output forms.

---

## Full System Flow

```mermaid
flowchart TD
    %% ─────────────────────────────────────────
    %% USER ENTRY POINTS
    %% ─────────────────────────────────────────

    subgraph USERS["👤 Users"]
        PUB("Public visitor\n(no login)")
        AUTH("Authenticated user\n(org scoped)")
        ADMIN("Admin user\n(ADMIN_EMAILS)")
    end

    subgraph ENTRY["🚪 Entry Points"]
        DA_SCENARIO("Demo Agent\nScenario button\n(Memory / Tool / Hallucination / Blind Spot)")
        DA_CHAT("Demo Agent\nFreeform chat")
        DA_ANALYZE("Demo Agent\nClick ▶ Analyze")
        CD("Chat Debug\nType a query")
        TE("Trace Explorer\nClick session")
        PULL("Pull Traces\n/api/langfuse/pull\n/api/langsmith/pull")
        BACKFILL("Backfill\n/api/backfill\n(bulk historical import)")
        INGEST("Direct ingest\n/api/ingest")
    end

    %% User → Entry wiring
    PUB  --> DA_SCENARIO & DA_CHAT & DA_ANALYZE
    AUTH --> DA_SCENARIO & DA_CHAT & DA_ANALYZE & CD & TE & PULL & BACKFILL
    ADMIN --> DA_SCENARIO & DA_CHAT & DA_ANALYZE & CD & TE & PULL & BACKFILL & INGEST

    %% ─────────────────────────────────────────
    %% DEMO AGENT PATHS
    %% ─────────────────────────────────────────

    subgraph DEMO_PATHS["🤖 Demo Agent Pipeline"]
        DEMO_LLM("Demo LLM call\n[GPT-4o-mini + mock tools]\nSimulates failing agent")
        DEMO_TOOLS("Mock tools execute\n- search_knowledge_base\n- query_database\n- send_email\n(wired to fail realistically)")
        FAST_G("fast_analysis_graph\n/api/demo/analyze-direct")
        FAST_G2("fast_analysis_graph\n(public path)")
    end

    DA_SCENARIO --> DEMO_LLM
    DA_CHAT     --> DEMO_LLM
    DEMO_LLM    --> DEMO_TOOLS
    DA_ANALYZE  --> |"isAuthenticated"| FAST_G
    DA_ANALYZE  --> |"public user"| FAST_G2

    %% ─────────────────────────────────────────
    %% CHAT DEBUG ROUTING
    %% ─────────────────────────────────────────

    subgraph CHAT_ROUTE["💬 Chat Debug — Intent Router"]
        LLM_ROUTE("_llm_route\n[GPT-4o-mini]\nClassifies intent → JSON")
        DATA_INT("data intent\n→ SQL generated")
        GEN_INT("general intent\n→ conversational answer")
        DIAG_INT("diagnostic intent\n→ run full analysis")
    end

    CD --> LLM_ROUTE
    LLM_ROUTE --> DATA_INT & GEN_INT & DIAG_INT

    subgraph CHAT_HANDLERS["Chat Debug Handlers"]
        SQL_EXEC("_handle_text_to_sql\nExecute SQL on sessions table\n[org_id enforced in WHERE]\nOptional: extract trace content")
        GEN_HANDLER("_handle_general\n[GPT-4o-mini]\nConversational answer\nMay offer to run diagnosis")
        DIAG_CONSENT("User accepts diagnosis offer\n→ re-routes to diagnostic")
    end

    DATA_INT --> SQL_EXEC
    GEN_INT  --> GEN_HANDLER
    GEN_HANDLER --> |"implicit consent detected"| DIAG_CONSENT
    DIAG_INT & DIAG_CONSENT --> FULL_G

    TE --> FULL_G

    %% ─────────────────────────────────────────
    %% LANGGRAPH PIPELINES
    %% ─────────────────────────────────────────

    subgraph FULL_GRAPH["⚙️ analysis_graph — Optimised Pipeline (~9-12s)"]
        PAR_START("parallel_start\n(fan-out entry node)")
        CLASSIFY("classify_intent\n[GPT-4o-mini]\nReads: LLM calls, tool errors,\nretrieval scores, hallucination flags\n→ {failure_type, reasoning}")
        VEC_RET("vector_retrieve\n[Pinecone]\nDual-namespace search:\n• failure_patterns (session-level)\n• traces (event-level)\nTop 10 results")
        GRAPH_T("graph_traverse\n[Neo4j]\n5 traversal types:\n• 1-hop: FAILED_WITH, RELATED_TO\n• 2-hop: shared chunks\n• 2-hop: systemic blind spots\n• 2-hop: same-query failures\n*skipped if skip_graph=True")
        MERGE("merge_retrieval\nCheck failure_type from classify")
        EARLY_EXIT("early_exit\nUNKNOWN → minimal report\nconfidence=0, no findings")
        FAST_AN("fast_analyze\n[Claude Haiku 4.5 → GPT-4o-mini fallback]\nSingle LLM call:\n• Reads session + vector evidence\n• Identifies failure type\n• Generates findings + root cause\n• Produces AnalysisReport")
    end

    FULL_G("analysis_graph\n(all production paths)") --> PAR_START
    PAR_START --> CLASSIFY & VEC_RET & GRAPH_T
    CLASSIFY  --> MERGE
    VEC_RET   --> MERGE
    GRAPH_T   --> MERGE
    MERGE --> |"UNKNOWN"| EARLY_EXIT
    MERGE --> |"memory / tool_misfire /\nhallucination / blind_spot"| FAST_AN

    subgraph FAST_GRAPH["⚡ fast_analysis_graph — Demo Path (~8-10s)"]
        F_CLASSIFY("classify_intent\n[GPT-4o-mini]\nSession built from\nscenario data directly")
        F_VEC("vector_retrieve\n[Pinecone]")
        F_EARLY("early_exit\n(UNKNOWN → no failure)")
        F_FAST("fast_analyze\n[Claude Haiku → GPT-4o-mini]")
    end

    FAST_G  --> F_CLASSIFY
    FAST_G2 --> F_CLASSIFY
    F_CLASSIFY --> |"UNKNOWN"| F_EARLY
    F_CLASSIFY --> |"known failure"| F_VEC
    F_VEC --> F_FAST

    %% ─────────────────────────────────────────
    %% INGESTION PATHS
    %% ─────────────────────────────────────────

    subgraph INGESTION["📥 Trace Ingestion"]
        PII("PII Redactor\nscrubadub + medical regex")
        STORE_VEC("Pinecone upsert\nvector embeddings")
        STORE_GRAPH("Neo4j node creation\n+ link_failure_patterns()")
        STORE_PG("PostgreSQL save_session\n(org_id stamped)")
        BG_ANALYSIS("Background analysis\n[analysis_graph]\nOptional — triggered\nfor new sessions")
    end

    PULL    --> PII
    INGEST  --> PII
    BACKFILL --> |"raw storage only\nno analysis pipeline\n200 traces/chunk"| STORE_PG & STORE_VEC & STORE_GRAPH

    PII --> STORE_VEC & STORE_GRAPH & STORE_PG
    STORE_PG --> |"is_new=True"| BG_ANALYSIS
    BG_ANALYSIS --> FULL_G

    %% ─────────────────────────────────────────
    %% OUTPUTS
    %% ─────────────────────────────────────────

    subgraph OUTPUTS["📤 Final Outputs"]
        OUT_REPORT("AnalysisReport\n────────────────\n• failure_type\n• summary\n• root_cause\n• findings (title, severity,\n  description, evidence,\n  recommendation)\n• confidence 0.0–1.0")
        OUT_NO_FAIL("No Failure Detected\n────────────────\nconfidence=0\nfindings=[]")
        OUT_DATA("Data Answer\n────────────────\nNatural language summary\nof SQL query results\n(counts, lists, trends)")
        OUT_CONV("Conversational Reply\n────────────────\nGeneral answer or\ndiagnosis offer")
        OUT_DEMO("Demo Agent Response\n────────────────\nAI agent reply\n(may include tool\ncall errors/results)")
        OUT_RAW("Raw Session Stored\n────────────────\nPostgres + Pinecone\n+ Neo4j\nNo analysis yet")
    end

    FAST_AN    --> OUT_REPORT
    F_FAST     --> OUT_REPORT
    EARLY_EXIT --> OUT_NO_FAIL
    F_EARLY    --> OUT_NO_FAIL
    SQL_EXEC   --> OUT_DATA
    GEN_HANDLER --> OUT_CONV
    DEMO_TOOLS --> OUT_DEMO
    STORE_PG & STORE_VEC & STORE_GRAPH --> OUT_RAW

    %% ─────────────────────────────────────────
    %% STYLING
    %% ─────────────────────────────────────────

    style USERS        fill:#1e293b,color:#94a3b8,stroke:#334155
    style ENTRY        fill:#1e293b,color:#94a3b8,stroke:#334155
    style DEMO_PATHS   fill:#1e1b4b,color:#a5b4fc,stroke:#4338ca
    style CHAT_ROUTE   fill:#1c1917,color:#d6d3d1,stroke:#57534e
    style CHAT_HANDLERS fill:#1c1917,color:#d6d3d1,stroke:#57534e
    style FULL_GRAPH   fill:#052e16,color:#86efac,stroke:#16a34a
    style FAST_GRAPH   fill:#431407,color:#fdba74,stroke:#ea580c
    style INGESTION    fill:#0c1a2e,color:#93c5fd,stroke:#2563eb
    style OUTPUTS      fill:#1a1a1a,color:#e5e5e5,stroke:#525252

    style OUT_REPORT fill:#14532d,color:#bbf7d0,stroke:#16a34a
    style OUT_NO_FAIL fill:#1c1917,color:#fde68a,stroke:#d97706
    style EARLY_EXIT fill:#1c1917,color:#fde68a,stroke:#d97706
    style F_EARLY    fill:#1c1917,color:#fde68a,stroke:#d97706
```

---

## Route Summary Table

| Trigger | Auth Required | Pipeline | Avg Latency | Output |
|---------|--------------|----------|-------------|--------|
| Demo scenario button click | None | Demo LLM + mock tools | ~2-4s | Agent chat response |
| Demo freeform chat | None | Demo LLM + mock tools | ~2-4s | Agent chat response |
| Demo → Analyze (any user) | None | `fast_analysis_graph` | ~8-10s | AnalysisReport |
| Chat Debug — counting/filtering query | Auth | SQL intent → text-to-SQL → Postgres | ~3-6s | Data answer |
| Chat Debug — "what is X?" question | Auth | General intent → LLM | ~2-3s | Conversational reply |
| Chat Debug — "diagnose this session" | Auth | Diagnostic intent → `analysis_graph` | ~9-12s | AnalysisReport |
| Trace Explorer — click session | Auth | `analysis_graph` | ~9-12s | AnalysisReport |
| Pull Traces (Langfuse/LangSmith) | Auth | Ingest → Postgres/Pinecone/Neo4j → optional background analysis | ~5-30s | Sessions stored |
| Backfill (bulk historical) | Auth | Raw storage only, 200/chunk, background | minutes–hours | Sessions stored (no analysis) |
| Direct ingest API | Auth | Ingest → Postgres/Pinecone/Neo4j | ~1-2s/session | Session stored |

---

## Classification Branch Decision Tree

```
classify_intent reads:
  ├── LLM calls        → hallucination_flag, source_documents, response
  ├── Tool calls       → status (failed/timeout), error message, latency
  ├── Retrieval events → relevance_scores, expected vs actual doc IDs, chunks_returned
  └── Failure summary  → pre-set label (hint only — LLM may override)

Result:
  ├── memory       → low similarity scores (<0.5), doc ID mismatch, stale embeddings
  ├── tool_misfire → failed/timeout tool call, permission error, bad parameters
  ├── hallucination→ LLM response contradicts source docs, claims without grounding
  ├── blind_spot   → zero retrieval results, topic absent from knowledge base
  └── unknown      → no clear signals → early_exit (no analysis, ~2s total)
```

---

## Key Architectural Rules

1. **`get_data_org_id(request)`** is called at the top of every data route handler. Returns `None` for admin (no filter), org UUID for regular users, sentinel UUID `00000000-...` for users with no org yet.

2. **`set_org_llm_context(config)`** is called before every `analysis_graph.ainvoke()`. Threads per-org LLM credentials through LangGraph via `contextvars.ContextVar`.

3. **Early exit** fires in both graphs when `failure_type == UNKNOWN`. In `fast_analysis_graph`, it saves the entire vector retrieve + analyze steps. In `analysis_graph`, retrieval has already started in parallel (trade-off for the ~2s parallelism gain on real failures).

4. **`skip_graph=True`** in initial state causes `graph_traverse` to return `[]` immediately. Callers set this when the org has no cross-session Neo4j data (avoids ~3s Neo4j connection overhead).

5. **Backfill never runs LangGraph**. It stores raw sessions at maximum speed. Users run diagnosis on demand later from Trace Explorer.
