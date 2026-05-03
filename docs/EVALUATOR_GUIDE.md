# Evaluator Guide — Aethen-AI

> 5 steps to see the full platform demo. Each step builds on the last.  
> Total time: ~10 minutes.

---

## Step 1 — Dashboard overview

Open the live app → you land on the **Dashboard**.

You'll see:
- **500 pre-seeded agent sessions** across 4 failure types (Memory, Tool Misfire, Hallucination, Blind Spot)
- **Reliability Score** — SVG gauge showing the health of all traced sessions
- **Failure Distribution** — per-type breakdown with proportional bars
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

## Step 3 — Pull traces + analyze on module pages

Go back to the **Dashboard** → click **Pull Langfuse** (top right).

Aethen ingests the Demo Agent traces and classifies each one using GPT-4o-mini.

Then navigate to any module page (e.g., **Memory Debug**):
- You'll see the pulled sessions listed on the left
- Click a session → the LangGraph pipeline runs: classify → vector retrieve → graph traverse → rerank → analyze → synthesize
- The right panel shows the full analysis: root cause, confidence score, findings, and recommendations

Repeat for **Tool Misfire**, **Hallucination RCA**, and **Blind Spots**.

---

## Step 4 — Explore sessions in Trace Explorer

Navigate to **Trace Explorer**.

- Search by session ID or keyword
- Filter by failure type using the tabs
- Click any session to see its execution timeline: LLM calls, tool calls, retrieval events
- Click **Run Analysis** to trigger the full LangGraph pipeline on any session

---

## Step 5 — Self-analysis via Chat Debug (strongest demo)

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
| **PostgreSQL / Supabase** | All session data, chat history, dashboard stats |
| **Neo4j Aura** | Graph traversal — cross-session failure pattern detection |
| **Pinecone** | 1,100+ embedded trace vectors for semantic search |
| **Langfuse** | Live LLM call tracing for all pipeline runs |

**LangGraph pipeline**: `classify_intent → retrieve (Pinecone + Neo4j) → rerank (Cohere) → [memory | tool | hallucination | blind_spot] → synthesize (Claude Sonnet 4.6)`

Full architecture: `docs/adal/architecture.md`  
Decision log: `docs/implementation_timeline.md`  
Scope adjustments vs proposal: `docs/scope_adjustments.md`
