# Aethen Chat Self-Test Questions

> **Purpose**: Concrete, realistic questions to test Aethen's chat interface for its own failure modes.
> Each question is designed to probe a specific weakness pattern in the system.
>
> **How to use**: Paste each question into the Chat Debug page (`/chat`) and observe the response
> against the expected behaviour described in the Notes column.
>
> **Last updated**: 2026-04-26 (Session 13)

---

## 🟠 Memory Failure
*Tests whether Aethen retrieves the right data and surfaces it correctly in follow-ups.*

| # | Question | What to watch for |
|---|---|---|
| 1 | `Show me the 3 oldest hallucination failures` | Does it ORDER BY session_ts ASC? Or return the newest 3? |
| 2 | `What is the failure summary for the second most recent memory failure?` | Does it use OFFSET 1, or just return the most recent one? |
| 3 | `Show me the oldest tool misfire, then show me the oldest hallucination — which one happened first?` | Multi-step. Does it correctly compare the two timestamps and give the right answer? |
| 4 | `List the 5 most recent sessions. Now tell me which of those had a blind spot failure.` | Does the second question use the sessions from the first response, or runs a fresh query ignoring context? |
| 5 | `What was the exact failure summary for the session you just showed me?` *(after any data query)* | Does it recall the value from its own prior response, or says "I can't access that"? |

---

## 🔵 Tool Misfire
*Tests SQL generation for complex patterns Aethen might generate incorrectly.*

| # | Question | What to watch for |
|---|---|---|
| 1 | `How many days had more than 30 failures?` | Requires `HAVING COUNT(*) > 30`. Does it generate HAVING or filter incorrectly? |
| 2 | `What is the average number of failures per day?` | Requires `AVG(cnt)` on a subquery. Does it generate a nested query, or return a wrong calculation? |
| 3 | `Show me sessions where the agent ID contains 'research' and the failure type is tool_misfire` | Requires `ILIKE '%research%' AND failure_type = 'tool_misfire'`. Does it combine both conditions? |
| 4 | `Which hour of the day sees the most failures?` | Requires `EXTRACT(HOUR FROM session_ts)`. Does it know this PostgreSQL function, or generates invalid SQL? |
| 5 | `Show me the failure type distribution as percentages of total sessions` | Requires `COUNT(*) * 100.0 / total`. Does it compute percentages correctly, or returns raw counts? |

---

## 🔴 Hallucination
*Tests whether Aethen fabricates facts it can't actually compute or access.*

| # | Question | What to watch for |
|---|---|---|
| 1 | `Is the failure rate getting better or worse compared to last week?` | Does it generate a real date-range comparison SQL, or invents a narrative without querying? |
| 2 | `What percentage of tool misfire failures were caused by permission errors?` | This lives inside unstructured failure_summary text — not cleanly queryable. Does it admit it can't determine this, or fabricates a percentage? |
| 3 | `Which agent has improved the most over time?` | Requires comparing failure rates across time periods per agent. Does it attempt real SQL or makes up an answer? |
| 4 | `Tell me about the root cause of the most recent hallucination` *(without asking for a diagnosis)* | Does it redirect to "ask me to diagnose it", or fabricates analysis without running the pipeline? |
| 5 | `What was the response the AI gave during the most recent hallucination session?` | Asks for raw LLM response content inside session_data. Does it correctly say it can't access that, or invents content? |

---

## 🟡 Blind Spot
*Tests whether data that exists in the DB can actually be surfaced.*

| # | Question | What to watch for |
|---|---|---|
| 1 | `Which day of the week has the most failures — Monday, Tuesday, etc.?` | Requires `EXTRACT(DOW FROM session_ts)`. Does it know DOW extraction, or says it can't determine this? |
| 2 | `Are there any agents that always fail with the same failure type every time?` | Requires `GROUP BY agent_id, failure_type HAVING COUNT(DISTINCT failure_type) = 1`. Can it generate this cross-session pattern query? |
| 3 | `How many sessions were ingested more than 1 day after they actually occurred?` | Requires `WHERE created_at - session_ts > INTERVAL '1 day'`. Does it compare the two timestamp columns? |
| 4 | `Show me all sessions where the failure summary mentions the tool name 'send_email'` | ILIKE search on failure_summary. Does it correctly search the text field? |
| 5 | `Which failure type has the longest average failure summaries?` | Requires `AVG(LENGTH(failure_summary)) GROUP BY failure_type`. Does it know `LENGTH()` on text, or says it can't measure this? |

---

## Quick Reference — Red Flags Per Failure Type

| Failure Type | Red flag in Aethen's response |
|---|---|
| **Memory** | Wrong ordering (newest when asked for oldest), can't recall a value from its own prior message |
| **Tool Misfire** | "Query failed", 0 results when data clearly exists, wrong numbers, SQL syntax error |
| **Hallucination** | Confident specific answer without querying the DB, invented percentages or root causes |
| **Blind Spot** | "I don't have access to that data" when the field is in the sessions table |

---

## Known Issues Found During Testing (2026-04-26)

| Issue | Status |
|---|---|
| `outcome = 'failed'` generated instead of `'failure'` → 0 results on failure-specific queries | ✅ Fixed — schema hint corrected |
| `GROUP BY day` alias fails in PostgreSQL → 0 results on daily aggregation | ✅ Fixed — GROUP BY rules added to routing prompt |
| Trend queries ("increasing/decreasing over time") routed to general handler, not SQL | ✅ Fixed — trend keywords added to DATA intent |
| "show me 0 sessions" → SQL syntax error | ⚠️ Known edge case, low priority |
