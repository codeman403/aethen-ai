# Neo4j Cypher Patterns — Aethen-AI

> Reusable graph traversal queries for cross-trace reasoning and failure pattern detection.

---

## 1. Create Session Node with Failure Metadata

```cypher
CREATE (s:Session {
  session_id: $session_id,
  agent_id: $agent_id,
  failure_type: $failure_type,
  outcome: $outcome,
  timestamp: datetime($timestamp)
})
```

**Used in**: `app/services/neo4j_service.py` → `create_session_node()`

---

## 2. Link Failure Patterns Across Sessions

```cypher
MATCH (s1:Session), (s2:Session)
WHERE s1.failure_type = s2.failure_type
  AND s1.session_id <> s2.session_id
  AND s1.agent_id = s2.agent_id
MERGE (s1)-[:SHARES_FAILURE_PATTERN]->(s2)
```

**Pattern**: Post-ingestion step that connects sessions with the same failure type from the same agent. Enables "which agents have recurring issues?" queries.

**Used in**: `app/services/neo4j_service.py` → `link_failure_patterns()`

---

## 3. Failure Type Distribution (Dashboard Stats)

```cypher
MATCH (s:Session)
WHERE s.failure_type IS NOT NULL
RETURN s.failure_type AS ft, count(s) AS cnt
```

**Used in**: `app/api/stats.py` → `get_dashboard_stats()`

---

## 4. Recent Sessions Count (Time-Windowed)

```cypher
MATCH (s:Session)
WHERE s.timestamp > datetime() - duration('P7D')
RETURN count(s) AS recent
```

**Pattern**: Use `duration('P7D')` for ISO-8601 duration literals. `P7D` = 7 days, `PT1H` = 1 hour.

**Used in**: `app/api/stats.py`

---

## 5. Daily Failure Counts (Bar Chart Data)

```cypher
MATCH (s:Session)
WHERE s.timestamp > datetime() - duration('P7D')
RETURN date(s.timestamp) AS day, count(s) AS cnt
ORDER BY day
```

**Gotcha**: `date()` truncates datetime to date. Results may have gaps (missing days = 0 count). Frontend should handle sparse data.

**Used in**: `app/api/stats.py`

---

## 6. Find Systemic Blind Spots (Cross-Session)

```cypher
MATCH (s:Session {failure_type: 'blind_spot'})
WITH s.metadata.topic AS topic, count(s) AS occurrences
WHERE occurrences >= 3
RETURN topic, occurrences
ORDER BY occurrences DESC
```

**Pattern**: Identify recurring knowledge gaps across sessions. A topic that triggers blind_spot 3+ times is a systemic gap worth flagging.

**Used in**: `app/agents/nodes/blind_spot.py` (graph traversal step)
