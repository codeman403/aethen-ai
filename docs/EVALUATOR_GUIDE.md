# Evaluator Guide — Aethen-AI

> 6 steps to see the full platform demo. Each step builds on the last.  
> Total time: ~12 minutes.

---

## Step 1 — Dashboard overview

Open the live app → you land on the **Dashboard**.

You'll see:
- **700+ pre-seeded agent sessions** across 4 failure types spread over 30 days
- **Reliability Score** — 7-day scoped SVG gauge (UTC)
- **Failure Distribution** — interactive stacked bar chart; click any bar to drill into Trace Explorer filtered to that date + type
- **Today's counts** — each metric card shows failures in the last 24 hours
- **Recent Alerts** — data-driven from today's `daily_by_type` counts
- **Recent Alerts** — clickable links to each analysis module

The dashboard refreshes automatically every 60 seconds.

---

## Step 2 — Generate live traces via the Demo Agent

Navigate to **Demo Agent** in the sidebar.

Click each of the 4 scenario buttons:
1. **Memory Retrieval Failure** — agent retrieves wrong chunks due to stale embeddings
2. **Tool Misfire** — agent calls a tool with wrong parameters, hits rate limits
3. **Hallucination** — agent fabricates citations not present in the source documents
4. **Blind Spot** — agent has no knowledge of the query topic; returns empty results

Each run is traced to **Langfuse** in real time (badge visible per turn). You can also use the free-form chat panel to generate arbitrary traces.

---

## Step 3 — Pull traces + analyze

Go back to the **Dashboard** → click **Pull Traces** (top right, dropdown to choose Langfuse or LangSmith).

Aethen ingests the Demo Agent traces, classifies each one, and runs background analysis automatically.

---

## Step 4 — Explore sessions in Trace Explorer

Navigate to **Trace Explorer**.

- 🟢 Green dot = analysis already cached (loads instantly)
- 🔴 Red dot = not yet analysed (runs ~25s pipeline on click)
- Filter by failure type, source (Langfuse/LangSmith), status, date range (UTC calendar)
- Click any session → 6-tab right panel: Session Context, Diagnosis, Findings, LLM Calls, Tool Calls, Retrieval Events
- **Clickable charts**: click any bar in Failure Distribution or Failure Trends → opens Trace Explorer filtered to that date + type

---

## Step 5 — Insight pages

Navigate through the **Analysis** sidebar section:

- **Failure Trends** — 30-day stacked area chart per failure type, drill-down on click
- **Pattern Clusters** — Neo4j graph: recurring blind spots, agent/model failure breakdowns
- **Agent Profiles** — per-agent success rate rings and failure type bars
- **Session Timeline** — visual event chain (Retrieval → LLM → Tool) with structured detail panels
- **Recommendations** — severity-sorted action items from analysis reports, filter by type/severity

---

## Step 6 — Self-analysis via Chat Debug (strongest demo)

Navigate to **Chat Debug**.

Type: *"Analyze the most recent memory retrieval failure"*

Aethen will:
1. Route the query to the diagnostic path
2. Pull the relevant session from Postgres
3. Run the full LangGraph analysis pipeline
4. Return a structured report with root cause and recommendations

**The recursive scenario**: The Demo Agent's Chat Debug previously exhibited its own failures — wrong session ordering (memory), fabricated explanations (hallucination), missing timestamps (blind spot). These were diagnosed and fixed. You can replay them:
- *"Show me the oldest tool misfire session"*
- *"How many hallucination failures do we have?"*
- *"What is the session ID of the most recent blind spot failure?"*

See `docs/scenarios/aethen_self_analysis.md` for the full self-analysis walkthrough.

---

## How Aethen classifies failures (no KB access required)

A common evaluator question: *"How does Aethen know this is a hallucination and not a memory failure if it doesn't have access to the agent's knowledge base?"*

Aethen never accesses the knowledge base directly. It reasons entirely from the **trace data**:

| Failure Type | Signal used | KB needed? |
|---|---|---|
| **Tool Misfire** | `tool_call.status` (`failed`/`timeout`) + error message | No — structural |
| **Blind Spot** | `retrieval_event.chunks_returned == 0` | No — structural |
| **Memory** | `max(relevance_scores) < 0.5` — retrieved docs had low similarity | No — heuristic |
| **Hallucination** | LLM response contains specific claims absent from `doc_content` (retrieved text) | No — compares retrieved text vs response |

**Key insight:** For hallucination detection, Aethen compares the *retrieved chunk text* (`doc_content`) against the *LLM response*. If the LLM asserts facts not present in what was retrieved, it's a hallucination — regardless of what the "correct" answer should be.

**Known edge case:** If wrong docs are retrieved (memory failure) *and* the LLM also hallucinates beyond those docs, the classification may lean toward hallucination rather than memory. Both signals overlap; the LangGraph classifier uses the full evidence picture to make the best call.

**For any AI agent:** As long as traces include retrieval scores and retrieved text (`doc_content`), Aethen requires zero domain knowledge of the agent's use case to classify failures accurately.

---

## Architecture reference

| Store | Role |
|-------|------|
| **PostgreSQL / Supabase** | All session data, chat history, dashboard stats, analysis report cache |
| **Neo4j Aura** | Graph traversal — cross-session failure pattern detection |
| **Pinecone** | 1,500+ embedded trace vectors for semantic search |
| **Langfuse** | Live LLM call tracing for all pipeline runs |
| **LangSmith** | Alternative trace provider — same ingestion pipeline |

**LangGraph pipeline**: `classify_intent → retrieve (Pinecone + Neo4j) → rerank (Cohere) → [memory | tool | hallucination | blind_spot] → synthesize (Claude Sonnet 4.6)`

**Date/time**: All dates UTC throughout — backend `DATE_TRUNC`, frontend `UTCDatePicker`, chart generation `Date.UTC()`, filter `toISOString()`.

Decision log: `docs/implementation_timeline.md`  
Failure classification explained: see "How Aethen classifies failures" section above  
Scope adjustments vs proposal: `docs/scope_adjustments.md`
