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
- 🔴 Red dot = not yet analysed (runs ~9-12s optimised pipeline on click)
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

## How Aethen classifies failures — and what it cannot know

A common evaluator question: *"How does Aethen know this is a hallucination if it doesn't have access to the agent's knowledge base?"*

### What Aethen reads

Aethen never accesses the agent's knowledge base, embedding model, or domain content. It reads only the **execution trace** — what the agent did and what observable signals resulted:

| Failure Type | Signal used | Accuracy |
|---|---|---|
| **Tool Misfire** | `tool_call.status` (failed/timeout) + error message | ★★★★★ Structural — unambiguous |
| **Blind Spot** | `chunks_returned == 0` or all scores < 0.3 | ★★★★☆ Structural — clear gap |
| **Memory** | `expected_doc_ids ≠ actual_doc_ids` (when provided) | ★★★★★ Definitive when IDs present |
| **Memory** | `max(relevance_scores) < 0.5` (when no IDs) | ★★★☆☆ Heuristic — threshold is universal |
| **Hallucination** | LLM asserts claims absent from `doc_content` | ★★★☆☆ Surface comparison — false positives possible |

### Architectural constraint: Aethen is a trace analyser, not a domain expert

```
Agent's KB:  [Pinecone / Weaviate / ChromaDB]  ← Aethen has ZERO access
                        ↓
            Retrieval returns chunks + scores
                        ↓
Agent trace: [scores, doc_ids, content snippets] ← Aethen reads ONLY this
                        ↓
LLM response: [text output]                      ← Aethen reads this too
```

Aethen diagnoses **how the pipeline behaved**, not **whether the answer was correct**.

### Real limitations

**Memory vs Blind Spot ambiguity:** A retrieval score of 0.3 could mean wrong docs were returned (memory) OR the topic is genuinely absent from the KB (blind spot). Without knowing the KB, Aethen uses doc content domain analysis as a proxy — but this is a heuristic, not ground truth. The score threshold of 0.5 is universal; a specialised medical agent may have legitimately lower scores.

**Hallucination false positives:** If an LLM makes a correct statement from training data that isn't in the retrieved documents, Aethen may flag it as hallucination. It cannot distinguish "correct knowledge the KB didn't surface" from "fabricated claim." Classification leans on the `hallucination_flag` field when available.

**Overlapping signals:** If wrong docs are retrieved (memory failure) AND the LLM hallucinates beyond them, both signals fire. The 5-step priority chain resolves the conflict (tool misfire beats all; doc ID mismatch beats scores; etc.) but the resulting classification may be imprecise.

### The `expected_doc_ids` bridge — critical for accuracy

The most accurate signal Aethen has for memory failures is when agent developers instrument their traces to specify which documents *should* have been retrieved:

```python
RetrievalEvent(
    query="What is the API rate limit for free tier?",
    expected_doc_ids=["api-docs-rate-limits-v2"],  # ← agent developer provides this
    actual_doc_ids=["billing-faq-2023"],            # ← what Pinecone actually returned
    relevance_scores=[0.31],
)
```

When `expected_doc_ids` is populated and mismatches `actual_doc_ids`, Aethen's confidence scorer assigns 0.58 base weight — the highest signal weight in the system. Without it, Aethen falls back to score thresholds (weight 0.20–0.30), significantly less certain.

**Recommendation for agent teams integrating with Aethen:** Populate `expected_doc_ids` in retrieval events for critical queries. This transforms classification from heuristic inference to ground-truth comparison.

### Correct framing for evaluators

Aethen is a **signal amplifier** — it surfaces suspicious patterns in execution traces that warrant human investigation. It is not a system that renders authoritative verdicts on domain correctness. Reports marked with lower confidence (< 0.5) should be treated as "investigate this" signals, not definitive diagnoses. A competent engineer familiar with the agent's domain remains essential for evaluating findings and deciding on remediation.

---

## Architecture reference

| Store | Role |
|-------|------|
| **PostgreSQL / Supabase** | All session data, chat history, dashboard stats, analysis report cache |
| **Neo4j Aura** | Graph traversal — cross-session failure pattern detection |
| **Pinecone** | 1,500+ embedded trace vectors for semantic search |
| **Langfuse** | Live LLM call tracing for all pipeline runs |
| **LangSmith** | Alternative trace provider — same ingestion pipeline |

**LangGraph pipeline** (optimised — ~9-12s end-to-end):
```
parallel: [classify_intent + vector_retrieve + graph_traverse*]
         → fast_analyze  (single LLM call — analysis + synthesis merged)
         → END

* graph_traverse skipped via skip_graph=True when no cross-session data
```

Two compiled graphs exist:
- `analysis_graph` — optimised default (Chat Debug, Trace Explorer, all production paths)
- `fast_analysis_graph` — lightweight variant for the public Demo Agent

**Eval results (100-session golden dataset):**
- Classification accuracy: **100%**
- LLM judge score: **85.56%** (baseline was 83% on full pipeline)
- Memory F1: **100%** (up from 57% before expected_doc_ids priority rule)

**Date/time**: All dates UTC throughout — backend `DATE_TRUNC`, frontend `UTCDatePicker`, chart generation `Date.UTC()`, filter `toISOString()`.

Decision log: `docs/implementation_timeline.md`  
Failure classification explained: see "How Aethen classifies failures" section above  
Scope adjustments vs proposal: `docs/scope_adjustments.md`
