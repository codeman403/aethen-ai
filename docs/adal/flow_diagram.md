# Aethen-AI — System Flow Diagram

> **Last updated**: 2026-04-26 (Session 15 — post P0/P1/P2 hardening)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Next.js)                             │
│  Dashboard │ Memory Debug │ Tool Misfire │ Hallucination │ Blind Spot  │
│  Demo Agent │ Chat Debug │ Data Quality │ Traces                       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ REST API
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                                │
│  /api/ingest │ /api/analyze │ /api/chat │ /api/demo │ /api/sessions    │
└──────┬───────────┬───────────┬───────────┬──────────────────────────────┘
       │           │           │           │
       ▼           ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Postgres │ │  Neo4j   │ │ Pinecone │ │ Langfuse │
│ (Source  │ │ (Graph   │ │ (Vector  │ │ (Live    │
│  of      │ │  Patterns│ │  Search) │ │  Traces) │
│  Truth)  │ │  7 nodes │ │ 2 ns:    │ │          │
│          │ │  10 rels)│ │ traces + │ │          │
│          │ │          │ │ failure_ │ │          │
│          │ │          │ │ patterns │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## 2. Ingestion Flow

```
  Trace Data (synthetic / Langfuse live / Demo Agent)
        │
        ▼
  POST /api/ingest  { sessions: [...] }
        │
        ├──► sanitize + validate (Pydantic Session model)
        │
        ├──[1]──► Postgres
        │         • UPSERT session_data (JSONB)
        │         • Source of truth for SQL queries + chat
        │
        ├──[2]──► Pinecone ("traces" namespace)
        │         • Embed each trace step:
        │         │  LLM call: "prompt → response"
        │         │  Tool call: "tool_name(params) → status"
        │         │  Retrieval: "query → N chunks"
        │         │
        │         └──► Pinecone ("failure_patterns" namespace)  ← NEW P2
        │              • One embedding per failed session
        │              • Combines: failure_summary + queries +
        │                tool errors + hallucination flags
        │              • Enables failure-against-failure search
        │
        ├──[3]──► Neo4j (full 7-node schema)
        │         • Session → FailureType (FAILED_WITH)
        │         • Session → PromptVersion (USES)
        │         • Session → Query → Chunk (CONTAINS_QUERY → RETRIEVED)
        │         • Query → BlindSpot (UNRESOLVED_DUE_TO)
        │         • ToolCall → FailureEvent (FAILED_WITH)
        │         • Response → FailureEvent (CONTAINS)
        │         • Response → Chunk (INFLUENCED_BY)
        │         • link_failure_patterns() → RELATED_TO edges
        │
        └──► Return: { sessions_ingested, events_processed }
```

---

## 3. Langfuse Live Trace Ingestion

```
  Langfuse API
        │  fetch_traces(limit=50)
        ▼
  LangfuseTraceAdapter.adapt_trace()
        │
        ├──► Observation mapping:
        │    GENERATION → LLMCall
        │    SPAN (tool keywords) → ToolCall
        │    SPAN (retrieval keywords) → RetrievalEvent
        │
        ├──► Signal extraction (P0 enrichment):                    ← NEW P0
        │    • relevance_scores: from result items
        │      (score, relevance_score, similarity, distance)
        │    • source_documents: from metadata, input context,
        │      system messages
        │    • hallucination_flag: inferred from content heuristics
        │      (grounding claims without sources, fabricated specifics)
        │    • metadata_filters: from retrieval input
        │    • timeout detection: latency > 30s → TIMEOUT status
        │    • error extraction: from output payloads
        │
        ├──► Failure type inference (P0 improved):                 ← NEW P0
        │    1. Trace tags (hallucin, tool, memory, blind)
        │    2. Trace name keywords
        │    3. Content signals (generic, not demo-specific)
        │    4. Multi-signal weighted scoring:
        │       • Failed tools → +0.6 tool_misfire
        │       • Timed out tools → +0.4 tool_misfire
        │       • Cascading failures → +0.2 tool_misfire
        │       • Zero-chunk retrievals → +0.6 blind_spot
        │       • Low relevance scores → +0.4 memory
        │       • Hallucination flag → +0.8 hallucination
        │       • Long response, no sources → +0.2 hallucination
        │       Highest score ≥ 0.4 wins
        │
        └──► Aethen self-analysis traces:
             Reconstructs clean LLMCall from LangGraph state
             (prompt = what was analyzed, response = report summary)
```

---

## 4. Chat Debug Flow

```
  ┌───────────────────────────────────────────────────────────────────┐
  │                    USER IN CHAT DEBUG UI                          │
  │            types: "diagnose the latest hallucination"             │
  └──────────────────────────┬────────────────────────────────────────┘
                             │  POST /api/chat/freeform
                             │  { query, history[] }
                             ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │  1. sanitize_input() — blocks injection, truncates to 500 chars  │
  │  2. empty-input guard — rejects whitespace-only queries          │
  └──────────────────────────┬────────────────────────────────────────┘
                             ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │                 _llm_route()  [GPT-4o-mini]                       │
  │                                                                    │
  │  System prompt: schema + totals + conversation history            │
  │  Returns: { intent, sql? | failure_type?, session_id? }          │
  └─────┬────────────────┬────────────────────────┬───────────────────┘
        │                │                        │
    "data"          "general"              "diagnostic"
        │                │                        │
        ▼                ▼                        ▼
  ┌────────────┐  ┌──────────────┐   ┌────────────────────────────┐
  │_handle_    │  │_handle_      │   │    CACHE CHECK             │
  │text_to_sql │  │general()     │   │  store.get(session_id)?    │
  │            │  │[GPT-4o-mini] │   │  ├─ HIT → return cached    │
  │ Security:  │  │              │   │  └─ MISS → continue ▼      │
  │ • no DDL   │  │ Purpose-     │   └──────────────┬─────────────┘
  │ • sessions │  │ aware prompt │                  │
  │   only     │  │ + history    │   ┌──────────────▼─────────────┐
  │ • LIMIT 50 │  │              │   │  Fetch grounding session   │
  │            │  │ Can re-route │   │  from Postgres             │
  │ Execute →  │  │ to pipeline  │   │  Priority:                 │
  │ format →   │  │ if needed    │   │  1. referenced session_id  │
  │ English    │  │              │   │  2. by failure_type        │
  └──────┬─────┘  └──────┬───────┘   │  3. any recent session    │
         │               │           └──────────────┬─────────────┘
         │               │                          │
         └───────────────┴──────────────────────────┘
                             │
                             ▼
                    AnalysisReport returned
                    saved to store (cache)
                             │
                             ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │                       Chat Debug UI                               │
  │                                                                    │
  │  confidence = 0  → plain text bubble  (general / data)           │
  │  confidence > 0  → AnalysisCard       (diagnostic)               │
  │                    • summary                                      │
  │                    • findings (severity, description, evidence)   │
  │                    • root cause                                   │
  │                    • confidence score + latency badge             │
  └───────────────────────────────────────────────────────────────────┘
```

---

## 5. LangGraph Analysis Pipeline

```
  Session + Query
        │
        ▼
  ┌─────────────────────────────────────────────┐
  │          classify_intent [GPT-4o-mini]       │
  │                                              │
  │  Evidence serialized:                        │
  │  • Retrieval scores, expected vs actual docs │
  │  • Tool statuses, errors, latency            │
  │  • LLM prompt/response, hallucination flags  │
  │  (no duplicate prompt/response — P0 fix)     │  ← FIXED P0
  │                                              │
  │  Always uses LLM — ignores pre-set labels.   │
  │  Returns: { failure_type, reasoning }        │
  └──────────────────┬──────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
  ┌───────────────┐   ┌─────────────────────────────────┐
  │vector_retrieve│   │       graph_traverse             │
  │  [Pinecone]   │   │         [Neo4j]                  │
  │               │   │                                   │
  │ Dual-namespace│   │ 5 targeted traversals:            │  ← NEW P2
  │ search:       │   │                                   │
  │               │   │ 1-hop: Direct relationships       │
  │ failure_      │   │   FAILED_WITH, RELATED_TO         │
  │ patterns (5)  │   │                                   │
  │ → session-    │   │ 1-hop: Same failure type          │
  │   level match │   │   other sessions + agent_id       │
  │               │   │                                   │
  │ traces (7)    │   │ 2-hop: Shared chunks              │
  │ → event-      │   │   Query→Chunk←Query (other sess)  │
  │   level match │   │                                   │
  │               │   │ 2-hop: Systemic blind spots       │
  │ Merge by      │   │   Query→BlindSpot←Query (agents)  │
  │ score, dedup  │   │                                   │
  │ (max 2/sess)  │   │ 2-hop: Same-query failures        │
  │ → top 10      │   │   Query text match, diff outcomes  │
  └───────┬───────┘   └──────────────┬──────────────────┘
          │                          │
          └────────────┬─────────────┘
                       ▼
  ┌─────────────────────────────────────────────┐
  │             rerank [Cohere v3.5]             │
  │                                              │
  │  Combines vector + graph results             │
  │  Scores relevance to failure context         │
  │  Filters to top 8 evidence items             │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────────┐
  │         Route to specialized module          │
  │         (based on failure_type)              │
  └────┬──────┬──────────┬──────────┬───────────┘
       │      │          │          │
       ▼      ▼          ▼          ▼
  ┌────────┐┌────────┐┌──────────┐┌──────────┐
  │memory_ ││tool_   ││hallucin_ ││blind_    │
  │debug   ││debug   ││ation_rca ││spot      │
  │        ││        ││          ││          │
  │Analyzes││Analyzes││4 content ││Uses      │
  │retriev-││tool    ││heuristic ││multi-hop │
  │al evts,││errors, ││checks:   ││graph     │
  │scores, ││params, ││          ││results:  │
  │doc mis-││timeout,││• ground- ││          │
  │matches ││cascade ││  ing w/o ││• shared  │
  │        ││        ││  sources ││  blind   │
  │        ││        ││• fabricat││  spots   │
  │        ││        ││  specifcs││• cross-  │
  │        ││        ││• resp/ctx││  agent   │
  │        ││        ││  ratio   ││  gaps    │
  │        ││        ││• contra- ││• same    │
  │        ││        ││  dict    ││  query   │
  │        ││        ││  hedging ││  diff    │
  │ NEW P1 ││ NEW P1 ││         ││  outcome │
  │        ││        ││  NEW P1  ││         │
  └───┬────┘└───┬────┘└────┬─────┘└────┬─────┘
      │         │          │           │
      └────┬────┴──────────┴───────────┘
           │
           ▼  All nodes now validate JSON output (P1)  ← NEW P1
  ┌─────────────────────────────────────────────┐
  │  diagnostic_utils.parse_diagnostic_output()  │
  │                                              │
  │  • Strip markdown code fences                │
  │  • Parse JSON, validate required fields      │
  │  • Validate finding severities               │
  │  • On failure → structured fallback output   │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
  ┌─────────────────────────────────────────────┐
  │          synthesize [Claude Sonnet 4.6]      │
  │          fallback: [GPT-4o-mini]             │
  │                                              │
  │  Produces AnalysisReport:                    │
  │  • Executive summary                         │
  │  • Findings (title, severity, evidence)      │
  │  • Root cause                                │
  │  • Confidence score (0.0–1.0)                │
  │                                              │
  │  Traced to Langfuse for self-analysis        │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
              AnalysisReport
```

---

## 6. Three-Layer Classification Architecture

```
  Layer 1: _infer_failure_type()                      [Ingestion-time]
  ├─ Location: langfuse_provider.py
  ├─ Model: Heuristic (no LLM)
  ├─ Purpose: Pre-label for UI display + Neo4j pattern matching
  ├─ Method: Tags → name → content signals → multi-signal scoring  ← NEW P0
  └─ Output: failure_type on Session object

  Layer 2: classify_intent()                          [Analysis-time]
  ├─ Location: agents/nodes/classify.py
  ├─ Model: GPT-4o-mini (always runs)
  ├─ Purpose: Authoritative classification from evidence
  ├─ Method: Reads actual retrieval scores, tool errors, LLM content
  ├─ ALWAYS overwrites Layer 1 label
  └─ Output: failure_type in AgentState

  Layer 3: _llm_route()                               [Chat routing only]
  ├─ Location: api/chat.py
  ├─ Model: GPT-4o-mini
  ├─ Purpose: Route freeform chat to data/general/diagnostic intent
  └─ Output: intent + optional session_id/failure_type
```

---

## 7. Data Store Schema

### Postgres (Source of Truth)
```sql
sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT UNIQUE,
  agent_id TEXT,
  session_data JSONB,     -- full Session object
  failure_type TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ
)
```

### Neo4j (Graph Patterns)
```
(:Session)     -[:FAILED_WITH]->      (:FailureType)
(:Session)     -[:RELATED_TO]->       (:Session)
(:Session)     -[:CONTAINS_QUERY]->   (:Query)
(:Session)     -[:PRODUCED]->         (:Response)
(:Session)     -[:USES]->             (:PromptVersion)
(:Query)       -[:RETRIEVED]->        (:Chunk)
(:Query)       -[:TRIGGERED]->        (:ToolCall)
(:Query)       -[:UNRESOLVED_DUE_TO]->(:BlindSpot)
(:ToolCall)    -[:FAILED_WITH]->      (:FailureEvent)
(:Response)    -[:CONTAINS]->         (:FailureEvent)
(:Response)    -[:INFLUENCED_BY]->    (:Chunk)
```

### Pinecone (Vector Search)
```
Namespace: "traces"
  Vectors: LLM call, Tool call, Retrieval event embeddings
  Metadata: session_id, agent_id, event_type, failure_type, outcome

Namespace: "failure_patterns"                                    ← NEW P2
  Vectors: Session-level failure summary embeddings
  Text: failure_summary + queries + tool errors + hallucination flags
  Metadata: session_id, agent_id, failure_type, failure_summary,
            llm_call_count, tool_call_count, retrieval_count
```

---

## 8. Test Data Architecture

### Synthetic Traces (`scripts/generate_traces.py`)
- Pre-labeled with failure_type + planted signals
- 5 types: memory, tool_misfire, hallucination, blind_spot, success
- Purpose: Baseline functional testing

### Adversarial Traces (`scripts/generate_adversarial_traces.py`)     ← NEW P1
- No pre-set labels (or intentionally wrong labels)
- 8 scenarios testing classifier accuracy:
  1. Hallucination from bad retrieval (mixed signals)
  2. Tool failure causes hallucination (cascading)
  3. Blind spot with low relevance (ambiguous)
  4. Cascading multi-tool failure
  5. Mislabeled trace (memory label, hallucination evidence)
  6. Success with noisy signals (false positive test)
  7. Empty/minimal trace (graceful degradation)
  8. Stale embeddings, correct docs (subtle memory issue)

---

## 9. UI Wireframes (Frontend Modules)

> Merged from `architecture.md` — original design intent for each module page.

### Demo Agent (`/demo-agent`)
```text
+-------------------------------------------------------------+
| Header: Demo Agent                                           |
| Subtitle: Generate real traces → Langfuse → Pull → Analyze  |
+-------------------------------------------------------------+
| [ Memory Debug ] [ Tool Misfire ] [ Hallucination ] [ Blind Spot ] |
| Free-form chat panel + session history list                  |
+-------------------------------------------------------------+
```
Backend: `POST /api/demo/run` + `POST /api/demo/chat` — LangChain agent with real
tool calls (`update_user_record`, `search_knowledge_base`, `query_database`,
`create_support_ticket`). One Langfuse trace per chat turn.

### Memory Debug (`/memory-debug`)
```text
+-------------------------------------------------------------+
| Left: SessionsList (sticky)  | Right: Analysis card (top)   |
|  - filter by failure_type    |  - findings timeline          |
|  - search + date filter      |  - executive summary          |
|                              |  - root cause + confidence    |
|                              | Below: SessionContext         |
+-------------------------------------------------------------+
```

### Tool Misfire (`/tool-misfire`)
```text
Call Sequence (Waterfall view):
  █ update_user_record (failed) — PermissionError
  █ query_database (failed) — ConnectionError
```

### Hallucination RCA (`/hallucination-rca`)
```text
Grounding Score | LLM Response | Source Verification | Root Cause
```

### Blind Spot Discovery (`/blind-spots`)
```text
Cross-session patterns from Neo4j graph traversal.
Knowledge gaps surfaced across multiple agent sessions.
```
