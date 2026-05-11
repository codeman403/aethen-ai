# Sequence Flows

See also: [ARCHITECTURE.md § Request Lifecycle](../../ARCHITECTURE.md#3-request-lifecycle) for the analysis and ingestion sequence diagrams.

---

## Demo Agent Flow

```mermaid
sequenceDiagram
    participant Browser
    participant FE as Frontend
    participant BE as Backend (public)
    participant LLM as GPT-4o-mini / Claude Haiku
    participant LF as Langfuse

    Browser->>FE: Click "Memory Debug" scenario
    FE->>BE: POST /api/demo/run { scenario: "memory" }
    BE->>BE: build synthetic session (synthetic.py)
    BE->>LLM: generate demo agent response (demo prompt)
    LLM-->>BE: chat response
    BE->>LF: log trace (LangChainTracer)
    BE-->>FE: { messages: [...], trace_id }
    FE->>Browser: display chat log + trace ID
    Browser->>FE: Click "Analyse in Aethen"
    FE->>BE: POST /api/ingest + POST /api/chat { session }
    BE->>BE: full analysis_graph pipeline
    BE-->>FE: AnalysisReport
    FE->>Browser: display findings
```

---

## Settings Model Update Flow

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend
    participant MC as Model Cache (in-memory)
    participant PG as Postgres

    FE->>BE: POST /api/settings/models { role: "analysis", model: "claude-haiku-4-5" }
    BE->>PG: upsert app_settings key="model_analysis" value="claude-haiku-4-5"
    BE->>MC: set_active_model("analysis", "claude-haiku-4-5")
    BE-->>FE: { data: { model: "claude-haiku-4-5" } }
    note over MC: Next analysis request uses claude-haiku-4-5\nImmediately — no restart needed
```

---

## Vercel Cron Flow

```mermaid
sequenceDiagram
    participant Vercel as Vercel Cron
    participant BFF as Next.js API Route
    participant BE as FastAPI Backend

    Note over Vercel: 00:00 UTC daily
    Vercel->>BFF: GET /api/cron/pull-langfuse\n(X-Vercel-Cron-Secret header)
    BFF->>BFF: Verify CRON_SECRET header
    BFF->>BE: POST /api/langfuse/pull { source: "all" }
    BE->>BE: Fetch traces from Langfuse API
    BE->>BE: Ingest → embed → graph seed
    BE-->>BFF: { sessions_ingested: N }
    BFF-->>Vercel: 200 OK
```

---

## Eval Push to Langfuse

```mermaid
sequenceDiagram
    participant Runner as Eval Runner
    participant LG as LangGraph
    participant LF as Langfuse

    Runner->>Runner: load golden dataset
    loop For each session (semaphore=5)
        Runner->>LG: analysis_graph.ainvoke({ session })
        LG-->>Runner: AnalysisReport
        Runner->>LF: push_session_scores(session_id, predicted, expected, confidence)
    end
    Runner->>LF: push_aggregate_scores(run_id, accuracy, judge_score)
    Runner-->>Caller: EvalReport
```
