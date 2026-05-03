# Demo Agent — Guide & Prompt Reference

> Last updated: 2026-05-03 (Session 23)

---

## Overview

The Demo Agent is a live GPT-4o-mini agent with 4 real tools — some succeed, some fail
deterministically. Every conversation turn is traced to Langfuse and/or LangSmith (selectable
in the UI) and can be pulled into Aethen for failure analysis.

This is the primary way to generate real, structured trace data for demonstrating Aethen's
diagnostic modules.

---

## Architecture: Phase 1 / Phase 2 Split

Understanding this is essential for interpreting traces correctly.

### Why the split exists

LangChain's `CallbackHandler` (both Langfuse and LangSmith) creates a **new root trace for
every top-level `llm.invoke()` call**. A tool-using agent makes multiple LLM calls — one to
decide which tool to use, then more after seeing tool results. If callbacks were active
throughout, each call would create a separate disconnected trace: 2–6 tiny traces per
conversation turn instead of one clean trace.

### How it works

```
User sends: "Show me all my recent orders from last month"
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  PHASE 1 — Tool Execution Loop  (NO callbacks)               │
│                                                              │
│  LLM decides → calls query_database(entity="orders")         │
│  Tool raises ConnectionError                                 │
│  Error stored as ToolMessage in conversation history         │
│  LLM sees error → no more tool calls → Phase 1 ends         │
│                                                              │
│  Output: final_messages = [                                  │
│    SystemMessage(...),                                       │
│    HumanMessage("Show me all my recent orders..."),          │
│    AIMessage(tool_calls=[query_database(...)]),              │
│    ToolMessage("Error: ConnectionError: database cluster..."),│
│  ]                                                           │
└──────────────────────────────────────────────────────────────┘
                        │  final_messages passed to Phase 2
                        ▼
┌──────────────────────────────────────────────────────────────┐
│  PHASE 2 — Single Traced Final Call  (WITH callbacks)        │
│                                                              │
│  llm.invoke(final_messages, config=invoke_config)            │
│  invoke_config has Langfuse + LangSmith callbacks            │
│                                                              │
│  → Creates EXACTLY ONE trace named "demo-agent-chat"         │
│  → trace.input contains the FULL conversation history        │
│    including all Phase 1 ToolMessages                        │
│  → LLM responds: "There's a database outage..."             │
└──────────────────────────────────────────────────────────────┘
```

### How Aethen extracts evidence despite Phase 1 being untraced

Phase 1 tool calls and search results travel inside `final_messages` to Phase 2,
which IS traced. Aethen's adapters read the Phase 2 trace's input messages and
reconstruct structured evidence:

| Evidence type | How Langfuse gets it | How LangSmith gets it |
|---|---|---|
| Tool errors | `_extract_retrieval_from_trace_messages` scans `trace.input` ToolMessages | `_extract_events_from_message_history` scans `run.inputs` messages |
| Search results (scores, doc_content) | Same — parses JSON in ToolMessage content | Same |
| LLM response | Phase 2 GENERATION observation output | Phase 2 run output |

Both providers end up with equivalent structured evidence — retrieval scores, doc content,
tool errors, and LLM response — giving `classify_intent` identical material to reason from.

### Pre-labels vs final analysis

**Pre-label** (heuristic, shown in Trace Explorer before analysis runs):
- Assigned by `_infer_failure_type` from structural signals
- Low retrieval scores → `memory`
- Tool error in ToolMessages → `tool_misfire`
- No structural signal → `None` (hallucination/blind_spot can't be detected heuristically)

**Final analysis** (after clicking Run Analysis or auto-analysis on pull):
- Assigned by `classify_intent` LLM reading all evidence
- Overrides the pre-label
- Both Langfuse and LangSmith sessions produce the same final classification
  because they have the same evidence

### Tracing destination

The Demo Agent UI lets you choose where traces go:
- **Langfuse** — ingested via `POST /api/langfuse/pull`
- **LangSmith** — ingested via `POST /api/langsmith/pull`
- **Both** — sent to both simultaneously; compare analysis side by side

**Note on `LANGSMITH_TRACING=true`**: Do NOT set this in your `.env`. Aethen sets
`LANGSMITH_TRACING=false` at startup to prevent the LangSmith SDK from auto-tracing
every internal LangGraph call (analysis pipeline, etc.). Only the explicit `LangChainTracer`
callback in Phase 2 creates LangSmith traces.

---

## Available Tools

| Tool | What it does | Failure behaviour |
|---|---|---|
| `search_knowledge_base` | Searches internal docs/policies | Returns off-topic API key / OAuth docs regardless of query |
| `update_user_record` | Updates a CRM user field | Always raises `PermissionError: insufficient privileges` |
| `query_database` | Queries operational data | Always raises `ConnectionError: database cluster unavailable` |
| `create_support_ticket` | Creates a support ticket | Succeeds — returns a ticket ID |

---

## Scenario Prompts

### Memory Retrieval Failure

**Goal**: `search_knowledge_base` retrieves billing docs but for the **wrong specific tier** —
same domain, wrong document. Low-medium scores (0.47/0.41).

**Best prompt:**
> *"What is the refund policy for annual subscriptions?"*

**Why it works**: Keywords `refund`/`annual subscription` hit the Memory route.
Returns `billing_policy_standard.pdf` (Standard plan billing) and `refund_faq.pdf` —
billing domain is correct but the docs cover Standard monthly plans, not annual subscriptions.
`classify_intent` sees: billing docs (right domain) + wrong specific content → `memory`.

**What Aethen finds**: Retrieval mismatch within the billing domain.
Low-medium scores, retrieved content is billing-adjacent but wrong tier.

**Other prompts:**
- *"What's the refund policy if I cancel my subscription mid-month?"*
- *"How do I get a refund for my monthly plan?"*
- *"What are the billing terms for my subscription?"*

---

### Tool Misfire — Permission Error

**Goal**: Trigger `update_user_record` → `PermissionError`.

**Best prompt:**
> *"Can you update my account email to test@example.com?"*

**Why it works**: The LLM calls `update_user_record(user_id="...", field="email", value="test@example.com")`.
The tool raises `PermissionError: insufficient privileges: caller lacks WRITE access to user_record table`.

**What Langfuse captures:**
- GENERATION: LLM deciding to call `update_user_record`
- SPAN (`level=ERROR`): tool execution with `PermissionError`
- GENERATION: LLM final response acknowledging the failure

**What Aethen finds**: Tool call `status=failed`, `error="insufficient privileges..."`.
Routes to the Tool Misfire module. `tool_debug` shows the exact tool, parameters, and error.

**Other prompts that work the same way:**
- *"Please change my profile name to John Smith"*
- *"Update my phone number to 555-1234"*
- *"Set my notification preference to email only"*

---

### Tool Misfire — Connection Error

**Goal**: Trigger `query_database` → `ConnectionError`.

**Best prompt:**
> *"Show me all my recent orders from last month"*

**Why it works**: The LLM calls `query_database(entity="orders", filters="last month")`.
The tool raises `ConnectionError: database cluster unavailable — retry after 30s`.

**What Langfuse captures:**
- GENERATION: LLM deciding to call `query_database`
- SPAN (`level=ERROR`): tool execution with `ConnectionError`
- GENERATION: LLM final response acknowledging the failure

**What Aethen finds**: Tool call `status=timeout` or `status=failed` with a connection error.
Routes to the Tool Misfire module.

**Other prompts that work the same way:**
- *"Can you pull up my transaction history?"*
- *"How many purchases have I made this year?"*
- *"Look up my account balance"*

---

### Hallucination

**Goal**: `search_knowledge_base` retrieves **relevant** docs (high scores 0.81/0.76) but they only
cover Standard/Pro plans. The LLM sees a progression (Standard→Pro) and fabricates Enterprise details
not present in any source document.

**Best prompt (confirmed hallucination):**
> *"The docs describe the PKCE authorization flow — walk me through the exact steps including the code verifier algorithm and length requirements."*

**Why it works**: The docs confirm PKCE is supported but provide no implementation details.
The LLM gives a full RFC 7636 implementation walkthrough — "at least 43 characters, up to 128
characters", "SHA-256 hash", "Base64 URL-encoded", "`code_challenge_method=S256`", complete
OAuth parameter names — none of which appear in the retrieved documents. The LLM presents
training-knowledge specifics as if they describe this platform's implementation.

**Pattern — hedge-then-detailed-fabrication**: The response begins "I couldn't find specific
documentation... However, I can provide a general overview" then proceeds to give highly specific
technical parameters. The hedge does NOT make it blind_spot — the fabricated specifics do.

**What Aethen finds**: High retrieval scores (0.81/0.76) — docs ARE relevant (PKCE confirmed).
`classify_intent` compares doc_content ("PKCE is supported for enhanced security") against LLM
response (43-128 char verifier, SHA-256, S256, Base64 URL-encoding, full OAuth flow steps) and
detects a grounding gap — concrete technical claims with no source in the retrieved content.
Routes to the Hallucination RCA module. ✓ Confirmed working on both Langfuse and LangSmith.

**Other prompts that also work:**
- *"The docs mention HMAC-SHA256 signing — what timestamp format and tolerance window should requests include?"*
- *"The docs mention single-use refresh tokens. If a refresh fails mid-flight, is there a grace period to retry with the same token?"*

**Note**: Heuristic pre-label is `None` until `classify_intent` LLM runs (no structural signal
for hallucination — it requires the LLM to reason about doc_content vs response).

---

### Blind Spot

**Goal**: `search_knowledge_base` returns completely unrelated docs with very low scores (0.19/0.14)
— the knowledge base has **no content at all** covering the query's topic.

**Best prompts:**
> *"What is the cancellation policy for enterprise accounts?"*

> *"Does your platform have GDPR compliance certification?"*

> *"What is your SLA guarantee for uptime and incident response?"*

> *"What are the data retention policies for enterprise customers?"*

**Why they work**: None of these keywords (`cancellation policy`, `GDPR`, `SLA`, `data retention`)
match the API/billing routes → hits the Blind Spot default route.
Returns API key docs with scores 0.19/0.14 — completely unrelated to enterprise account policies.
LLM correctly says "I couldn't find information about [topic]" without fabricating details.

**What Aethen finds**: Very low retrieval scores + doc content from an entirely different functional
area + LLM response confirming the knowledge gap.
Routes to the Blind Spot Detector module.

---

### Success Baseline (no failure)

**Goal**: Trigger `create_support_ticket` → success. Useful for contrast with failure sessions.

**Best prompt:**
> *"Please open a support ticket — my login is broken"*

**Why it works**: The LLM calls `create_support_ticket(title="Login issue", description="...", priority="high")`.
The tool succeeds and returns a ticket ID. Session is classified as `outcome=success`.

---

## Full Demo Flow

```
1. Go to Demo Agent page
2. Select trace destination: Langfuse / LangSmith / Both
3. Start a new chat, send one of the prompts above
4. Observe the assistant response (tool call result visible in reply)
5. Go to Dashboard → Pull Traces → select provider
6. The new session appears in Trace Explorer with a provider badge (indigo=Langfuse, orange=LangSmith)
7. Click the session → analysis loads automatically (cache hit = instant)
8. Aethen diagnoses the failure and shows findings
```

**To compare Langfuse vs LangSmith on the same prompt:**
1. Set trace destination to **Both**
2. Send the prompt once
3. Pull Traces → Both
4. Find the two sessions in Trace Explorer (one with Langfuse badge, one with LangSmith badge)
5. Run analysis on both — the final classification and root cause should agree

---

## Scenario Runner (/demo/run)

The scenario buttons (Memory, Tool Misfire, Hallucination, Blind Spot) use a simpler
flow — a single pre-scripted LLM call with no real tool execution. The failure context
is injected into the user message as text rather than produced by an actual tool call.

Use the **chat interface** (not the scenario buttons) to generate sessions with real
structured `ToolCall` data for the most accurate analysis output.

---

## How Aethen classifies failures — no KB access required

This is the most common question from developers integrating their own agents:
*"How can Aethen classify Memory vs Hallucination vs Blind Spot if it has no knowledge of my agent's knowledge base?"*

Aethen classifies failures entirely from **trace structure and content** — it never reads your KB.

### What Aethen reads per failure type

**Tool Misfire**
- Reads: `tool_call.status` (`failed` / `timeout`) + `tool_call.error`
- No KB needed — a permission error or timeout is unambiguous from the error message alone.

**Blind Spot**
- Reads: `retrieval_event.chunks_returned == 0`
- No KB needed — zero results from the vector search is a structural signal regardless of domain.

**Memory Failure**
- Reads: `max(retrieval_event.relevance_scores) < 0.5`
- No KB needed — low cosine similarity scores indicate the retrieved documents were likely wrong for the query. Aethen trusts that your embedding model's similarity scores are meaningful.

**Hallucination**
- Reads: `retrieval_event.doc_content` (the actual retrieved text) vs `llm_call.response`
- No KB needed — if the LLM response contains specific claims (numbers, dates, procedures) that do not appear anywhere in the retrieved chunk text, Aethen flags it as hallucination.
- **Critical:** this only works if your traces include `doc_content` — the actual text of retrieved chunks, not just IDs or scores.

### What your traces must include

| Field | Required for |
|---|---|
| `tool_call.status` + `tool_call.error` | Tool Misfire detection |
| `retrieval_event.chunks_returned` | Blind Spot detection |
| `retrieval_event.relevance_scores` | Memory vs Blind Spot distinction |
| `retrieval_event.doc_content` | Hallucination detection |
| `llm_call.response` | Hallucination detection |

Without `doc_content`, hallucination detection degrades to heuristic-only (relying on `hallucination_flag` if your agent sets it, or the LLM classifier's best guess from scores alone).

### Known edge case

If wrong docs are retrieved (memory failure) **and** the LLM also adds claims not in those wrong docs (hallucination), both signals are present. The LangGraph `classify_intent` node uses the full evidence picture and leans toward whichever signal is stronger. In borderline cases, check both the Diagnosis tab and the Findings tab for the full reasoning.

---

## Notes

- Each chat session is saved to Postgres (`demo_chat_sessions` + `demo_chat_messages` tables).
- Traces are named `run_name="demo-agent-chat"`, `userId="Demo Agent"` in both Langfuse and LangSmith.
- Incremental pull watermarks for both providers are stored in `app_settings`:
  `langfuse_last_pull_at` and `langsmith_last_pull_at`. Only new traces are fetched each time.
- `aethen-*` internal traces (Aethen's own analysis pipeline) are filtered out during Langfuse pull.
  For LangSmith, `LANGSMITH_TRACING=false` is set at startup to prevent internal traces appearing.
- Tool execution is pure Python — failures are deterministic, not probabilistic.
- The LLM model used by the Demo Agent is configurable in **Model Settings → Demo Agent** (default: `gpt-4o-mini`).
- Phase 1 runs the tool loop silently. Phase 2 is the single traced LLM call. See Architecture section above.
