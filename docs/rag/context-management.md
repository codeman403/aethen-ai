# Context Management

---

## Context Window Budget

The `fast_analyze` node constructs a single context window containing both the session trace and retrieved evidence. The budget is managed by explicit truncation in `_build_context()`:

| Section | Cap | Rationale |
|---|---|---|
| LLM calls | Top 5, 400 chars each | Most recent / most diagnostic calls |
| Tool calls | Top 5, 200 chars each (error/result) | Failed tool details are compact |
| Retrieval events | Top 3, 200 chars each | Query + score + doc mismatch |
| Similar failure evidence | Top 3 from reranker, 300 chars | Cross-session context |

Total approximate: ~1 500 tokens input. Well within Claude Haiku 4.5's context (200K tokens).

---

## Context Construction

`_build_context()` in `app/agents/nodes/fast_analyze.py`:

```python
parts = [
    f"Session ID: {session.session_id}",
    f"Agent: {session.agent_id}",
    f"Outcome: {session.outcome}",
    f"Failure type hint: {failure_hint}",
    f"Failure summary: {session.failure_summary or 'N/A'}",
    "=== LLM Calls ===",
    # ... top 5 calls, truncated
    "=== Tool Calls ===",
    # ... top 5 calls, truncated + injection-stripped
    "=== Retrieval Events ===",
    # ... top 3 events with scores + doc mismatch indicator
    "=== Similar Failure Patterns ===",
    # ... top 3 reranked evidence snippets
]
return "\n".join(parts)
```

---

## Injection-Safe Context

Free-text fields in the context are sanitised before embedding in the prompt:

```python
parts.append(f"  Response: {strip_injection(lc.response, full_redact=True)[:400]}")
parts.append(f"  Error: {strip_injection(tc.error, full_redact=True)[:200]}")
```

`full_redact=True` replaces the entire field with a placeholder when an injection pattern is detected. This prevents prompt injection from nested agent content.

---

## Prompt Structure

```
[SYSTEM PROMPT]              ← Classification guidance + security constraint
                               + root cause precision rule + JSON schema
[USER CONTEXT]
  Session ID / Agent / Outcome / Hint / Summary
  === LLM Calls ===
  === Tool Calls ===
  === Retrieval Events ===
  === Similar Failure Patterns ===
```

The system prompt is ~600 tokens (fixed overhead). User context is ~1 000–1 500 tokens (variable). Max tokens output = 1 500 (JSON findings).

---

## Chat Session Context

`/api/chat` maintains conversation history via `chat_sessions` + `chat_messages` tables. Each follow-up question in Chat Debug includes the prior exchange for continuity.

History window: last N messages (configurable, default unlimited per session). Not truncated by default — the chat interface is session-specific and conversations are typically short (< 10 turns).
