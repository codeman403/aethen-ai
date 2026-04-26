# Scenario: Aethen Analyzing Its Own Failures

> **Type**: Meta / Recursive demonstration
> **Date discovered**: 2026-04-25 (Session 9)
> **Chat session**: `cs-4d38e2259a55`
> **Significance**: Demonstrates Aethen's framework applied to itself — a powerful evaluator demo

---

## What Happened

A user asked Aethen's Chat Debug to retrieve agent traces. The conversation revealed
three distinct AI failures **within Aethen's own responses**:

| Turn | User asked | Aethen did | Actual failure type |
|------|-----------|-----------|-------------------|
| 1 | "show me the oldest trace for tool misfire" | Returned the **newest** session (hardcoded `ORDER BY DESC`) | **Memory Retrieval Failure** — retrieved wrong data, wrong context surfaced |
| 2 | "how do you know if it is oldest one?" | Invented an explanation: "The oldest session is determined by the timestamp…" — but timestamps were never actually used | **Hallucination** — fabricated a justification not grounded in what the system actually did |
| 3 | "what is the timestamp for this one?" | Replied: "I cannot provide specific timestamps as that information is not available" | **Blind Spot** — the timestamp existed in the database but the system had no mechanism to surface it |
| 4 | "so if it's not available, how did you give the oldest trace earlier?" | Returned an irrelevant tool misfire analysis instead of acknowledging the contradiction | **All three** — retrieved wrong session, confabulated explanation, couldn't access the actual data |

Aethen categorised **all of these as Tool Misfire**. None of them were. No API call failed.
No permission error. No timeout.

---

## Correct Classifications

### 1. Wrong ordering → Memory Retrieval Failure
**Signal**: The system retrieved data, but the wrong data — exactly analogous to a retrieval miss
where the wrong chunks are returned. The `ORDER BY DESC` is the "wrong embedding" equivalent
for structured queries: the context retrieved was not what was asked for.

**Aethen's Memory Debug module** is designed to catch exactly this: wrong chunks surfaced,
mismatch between expected and actual results.

### 2. Confabulated explanation → Hallucination
**Signal**: The LLM generated a factually incorrect statement ("oldest is determined by
timestamp…") that was not grounded in what the system actually did. This is the canonical
hallucination pattern — a confident, plausible-sounding answer with no supporting evidence
in the actual execution trace.

**Aethen's Hallucination RCA module** detects LLM responses that contradict or are unsupported
by source documents / actual system behaviour.

### 3. Timestamp not surfaced → Blind Spot
**Signal**: The data existed in the database (`session_ts` column, perfectly queryable) but
the system had no mechanism in the response pipeline to retrieve and present it. This is a
knowledge gap — not missing data, but missing capability to access available data.

**Aethen's Blind Spot Detector** identifies topics the agent "cannot answer" despite the
information existing in the knowledge base.

---

## Why This Matters for the Demo

This scenario shows **Aethen's framework applied recursively to itself**:

1. The evaluator asks Aethen to analyse itself
2. Aethen correctly identifies: one Memory Retrieval Failure, one Hallucination, one Blind Spot
3. Each finding maps directly to one of its four analysis modules

This is the most powerful demonstration of the platform — it is not just a debugging tool
for other agents; its own failure modes follow the same taxonomy it was built to diagnose.

---

## Root Cause and Fix

**Root cause**: The freeform chat used fixed handlers (`_handle_list` with hardcoded
`ORDER BY DESC`) instead of letting the LLM reason about the query intent. When the
fixed handler returned wrong results, the downstream LLM had no access to the actual
data (timestamps, session IDs) in the conversation history, causing it to confabulate.

**Fix applied (Session 9)**:
- Replaced `_handle_stats` / `_handle_list` with **Text-to-SQL** — the LLM writes the
  SQL query at runtime, including correct `ORDER BY ASC` for "oldest" queries
- The second LLM call formats raw SQL results into a response that includes actual values
  (timestamps, session IDs) so follow-up questions are answerable from conversation history
- Safety constraint: only `SELECT` queries permitted; no write access

**Before**: "show oldest tool misfire" → hardcoded `DESC` → wrong session → hallucinated explanation → blind spot on timestamp

**After**: "show oldest tool misfire" → LLM writes `ORDER BY session_ts ASC LIMIT 1` → correct session with real timestamp in response → follow-ups answerable

---

## How to Reproduce for a Demo

1. Go to **Chat Debug** (`/chat`)
2. Ask: *"show me the oldest tool misfire session"* — observe it returns the correct session with a real timestamp
3. Ask: *"what is the timestamp for that session?"* — observe it quotes the timestamp from the previous response (no confabulation)
4. Ask: *"which agent had the most memory failures?"* — observe the LLM writes a `GROUP BY agent_id` query
5. Then go to **Tool Misfire** module page → click that session → **Run Full Analysis** → observe Aethen correctly categorising failures in the original agent's trace

This demonstrates the full loop: natural language → SQL → real data → correct follow-up → deep analysis.

---

## Standing Note

Update this file whenever a new recursive/meta scenario is discovered where Aethen's own
behaviour maps to its failure taxonomy. These scenarios are the strongest evaluation evidence.
