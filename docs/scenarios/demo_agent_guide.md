# Demo Agent — Guide & Prompt Reference

> Last updated: 2026-04-29

---

## Overview

The Demo Agent is a live GPT-4o-mini agent instrumented with Langfuse tracing. It has 4 real
tools wired in — some succeed, some are designed to fail in realistic ways. Every conversation
turn is traced to Langfuse and can be pulled into Aethen for failure analysis.

This is the primary way to generate real, structured trace data for demonstrating Aethen's
diagnostic modules.

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

**Goal**: Trigger `search_knowledge_base` → wrong docs returned → LLM answers from bad context.

**Best prompt:**
> *"What is the refund policy for annual subscriptions?"*

**Why it works**: The LLM calls `search_knowledge_base(query="refund policy annual subscriptions")`.
The tool returns API key rotation and OAuth setup docs instead of billing/refund docs. The LLM
then attempts to answer from those wrong documents — producing a grounded-but-incorrect response.

**What Langfuse captures:**
- GENERATION: LLM deciding to call `search_knowledge_base`
- SPAN: tool execution returning wrong docs
- GENERATION: LLM final response built on wrong context

**What Aethen finds**: Retrieval mismatch — expected billing docs, actual docs are API/OAuth.
Routes to the Memory Debug module.

**Other prompts that work the same way:**
- *"How do I reset my billing password?"*
- *"What are the enterprise plan pricing details?"*
- *"Can you explain the cancellation process for my subscription?"*

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
2. Start a new chat
3. Send one of the prompts above
4. Observe the assistant response (tool call result visible in reply)
5. Go to Dashboard → Pull Langfuse
6. The new session appears in Trace Explorer
7. Click the session → Run Analysis
8. Aethen diagnoses the failure and shows findings
```

---

## Scenario Runner (/demo/run)

The scenario buttons (Memory, Tool Misfire, Hallucination, Blind Spot) use a simpler
flow — a single pre-scripted LLM call with no real tool execution. The failure context
is injected into the user message as text rather than produced by an actual tool call.

Use the **chat interface** (not the scenario buttons) to generate sessions with real
structured `ToolCall` data for the most accurate analysis output.

---

## Notes

- Each chat session is saved to Postgres (`demo_chat_sessions` + `demo_chat_messages` tables)
  and traced to Langfuse under `run_name="demo-agent-chat"`, `userId="Demo Agent"`.
- The Langfuse incremental pull watermark ensures only new sessions are pulled each time.
- `aethen-*` internal traces are filtered out during pull — only Demo Agent sessions appear
  in Trace Explorer.
- All tool calls use GPT-4o-mini via the OpenAI proxy. The tool execution itself is pure Python
  (no additional LLM call) — failures are deterministic, not probabilistic.
