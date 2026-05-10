# Aethen-AI — LLM Usage Map

> Generated from codebase inspection — 2026-04-28

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            USER REQUEST                                     │
└────────────┬─────────────────────┬──────────────────────────────────────────┘
             │                     │
             ▼                     ▼
   ┌──────────────────┐   ┌────────────────────────────────────────────────┐
   │   DEMO AGENT     │   │          CHAT DEBUG  (freeform)                │
   │                  │   │                                                │
   │  /demo/run       │   │  _llm_route()          Claude Sonnet 4.6       │
   │  GPT-4o-mini     │   │  → intent: data /      (fallback: GPT-4o-mini) │
   │  (scenario LLM)  │   │    diagnostic /                                │
   │                  │   │    general                                     │
   │  /demo/chat      │   │         │                                      │
   │  GPT-4o-mini     │   │    ┌────┼────────────────────┐                 │
   │  (free-form)     │   │    ▼    ▼                    ▼                 │
   └──────────────────┘   │  [data] [general]      [diagnostic]           │
                          │    │       │                 │                 │
                          │    │    _handle_general      │                 │
                          │    │    Claude Sonnet 4.6    │                 │
                          │    │                         │                 │
                          │  _handle_text_to_sql         │                 │
                          │  Claude Sonnet 4.6           │                 │
                          │  (format results)            │                 │
                          │  _fix_sql on error           │                 │
                          │  Claude Sonnet 4.6           │                 │
                          └──────────────────────────────┼─────────────────┘
                                                         │
                                                         ▼
             ┌───────────────────────────────────────────────────────────────┐
             │                   LANGGRAPH PIPELINE                         │
             │                                                               │
             │  1. classify_intent ──────────────────── GPT-4o-mini         │
             │     (failure type from trace evidence)                        │
             │                                                               │
             │  2. retrieve ─────────────────────────── no LLM              │
             │     (pgvector semantic search + Neo4j                         │
             │      graph traversal in parallel)                             │
             │                                                               │
             │  3. rerank ───────────────────────────── Cohere Rerank v3    │
             │     (not an LLM — reranking model only)                      │
             │                                                               │
             │  4. analysis node (one of four):                              │
             │     ├── memory_debug      ──────────────── GPT-4o-mini        │
             │     ├── tool_debug        ──────────────── GPT-4o-mini        │
             │     ├── hallucination_rca ──────────────── GPT-4o-mini        │
             │     └── blind_spot        ──────────────── GPT-4o-mini        │
             │                                                               │
             │  5. synthesize ───────────────────────── Claude Sonnet 4.6   │
             │     (final report + confidence score)    fallback: GPT-4o-mini│
             └───────────────────────────────────────────────────────────────┘
```

---

## Summary Table

| Location | Function | Model | File |
|---|---|---|---|
| LangGraph | `classify_intent` | GPT-4o-mini | `backend/app/agents/nodes/classify.py` |
| LangGraph | `memory_debug` | GPT-4o-mini | `backend/app/agents/nodes/memory_debug.py` |
| LangGraph | `tool_debug` | GPT-4o-mini | `backend/app/agents/nodes/tool_debug.py` |
| LangGraph | `hallucination_rca` | GPT-4o-mini | `backend/app/agents/nodes/hallucination_rca.py` |
| LangGraph | `blind_spot` | GPT-4o-mini | `backend/app/agents/nodes/blind_spot.py` |
| LangGraph | `synthesize` | Claude Sonnet 4.6 → GPT-4o-mini fallback | `backend/app/agents/nodes/synthesize.py` |
| Chat Debug | `_llm_route` | Claude Sonnet 4.6 → GPT-4o-mini fallback | `backend/app/api/chat.py` |
| Chat Debug | `_handle_general` | Claude Sonnet 4.6 → GPT-4o-mini fallback | `backend/app/api/chat.py` |
| Chat Debug | `_handle_text_to_sql` (format step) | Claude Sonnet 4.6 → GPT-4o-mini fallback | `backend/app/api/chat.py` |
| Chat Debug | `_fix_sql` (SQL error recovery) | Claude Sonnet 4.6 → GPT-4o-mini fallback | `backend/app/api/chat.py` |
| Demo Agent | `/demo/run` (scenario runner) | GPT-4o-mini | `backend/app/api/demo.py` |
| Demo Agent | `/demo/chat` (free-form chat) | GPT-4o-mini | `backend/app/api/demo.py` |

---

## Key Patterns

**GPT-4o-mini** is used for all structured, JSON-output tasks inside the LangGraph pipeline
(classification, module analysis nodes) — fast and reliable for constrained outputs.

**Claude Sonnet 4.6** is used for all user-facing natural language tasks — Chat Debug
routing, conversational responses, SQL result formatting, and the final synthesis report
where reasoning quality matters most. GPT-4o-mini fires as fallback if the Anthropic
proxy is unavailable.

**Cohere Rerank v3** is used after retrieval but is a reranking model, not an LLM — it
scores and reorders retrieved chunks but does not generate text.

**Demo Agent** LLM calls (both `/demo/run` and `/demo/chat`) use GPT-4o-mini directly
via `ChatOpenAI` — these are the *agent under test*, not Aethen's own analysis logic.
Their traces are sent to Langfuse and can be pulled back for analysis.
