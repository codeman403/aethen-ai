# Aethen-AI — RAG Implementation Analysis

> Inspected from codebase — 2026-04-28
> Source files: `nodes/retrieve.py`, `nodes/rerank.py`, `nodes/memory_debug.py`,
> `nodes/tool_debug.py`, `nodes/hallucination_rca.py`, `nodes/blind_spot.py`

---

## Where RAG Lives in the Pipeline

RAG covers steps 2–4 of the LangGraph pipeline. Steps 1 and 5 are pure LLM work.

```
┌───────────────────────────────────────────────────────────────────┐
│                   LANGGRAPH PIPELINE                              │
│                                                                   │
│  1. classify_intent ── GPT-4o-mini          (routing only)        │
│                                                                   │
│  ╔═══════════════════════════════════════════════════════════╗    │
│  ║  RAG                                                      ║    │
│  ║                                                           ║    │
│  ║  2. retrieve ── no LLM                   ← RETRIEVE       ║    │
│  ║     Pinecone (vector search)                              ║    │
│  ║       namespace: failure_patterns (top_k=5)               ║    │
│  ║       namespace: traces           (top_k=7)               ║    │
│  ║     Neo4j (graph traversal, parallel)                     ║    │
│  ║       1-hop: direct relationships                         ║    │
│  ║       1-hop: sessions with same failure type              ║    │
│  ║       2-hop: shared chunks across sessions                ║    │
│  ║       2-hop: systemic blind spots across agents           ║    │
│  ║       2-hop: same query, different outcomes               ║    │
│  ║                                                           ║    │
│  ║  3. rerank ── Cohere Rerank v3.5         ← RERANK         ║    │
│  ║     merges vector + graph results                         ║    │
│  ║     scores by relevance to failure context               ║    │
│  ║     keeps top 8, falls back to score=0.5 passthrough      ║    │
│  ║                                                           ║    │
│  ║  4. analysis node                        ← AUGMENT+GEN    ║    │
│  ║     reranked_evidence injected into LLM prompt            ║    │
│  ║     GPT-4o-mini generates findings                        ║    │
│  ║     grounded in retrieved cross-session evidence          ║    │
│  ╚═══════════════════════════════════════════════════════════╝    │
│                                                                   │
│  5. synthesize ── Claude Sonnet 4.6         (report writing)      │
└───────────────────────────────────────────────────────────────────┘
```

---

## Use Case Context

Aethen's RAG pattern is different from typical Q&A RAG:

- **Typical RAG**: user asks a question → retrieve documents → LLM answers from docs
- **Aethen RAG**: analyze an observed trace (primary evidence already in hand) →
  retrieve *similar past traces* from vector + graph → use them as cross-session
  context to augment analysis → LLM finds patterns that span sessions

The session trace itself is always the primary evidence. Retrieved context adds
cross-session pattern recognition — e.g. "this blind spot also hit 3 other agents",
"this chunk was returned to 2 other sessions that also failed".

---

## Rating: 6.5 / 10

| Dimension | Score | Notes |
|---|---|---|
| Retrieval architecture (hybrid vector + graph) | 9/10 | Standout feature — multi-hop graph traversal is genuinely advanced |
| Query formulation | 4/10 | Naive pipe-joined concatenation, no semantic synthesis |
| Evidence quality passed to reranker | 4/10 | Graph results serialized as count strings, not content |
| Rerank query | 5/10 | Includes session ID (no semantic signal), not failure-type-aware |
| Integration into generation (analysis nodes) | 6/10 | Evidence is supplementary, appended last in prompt |
| Evaluation / observability | 2/10 | No metrics on whether retrieved context improved output |

---

## Strengths

### 1. Hybrid retrieval — Vector + Graph in parallel
`vector_retrieve` and `graph_traverse` run concurrently in the LangGraph pipeline.
Most RAG implementations only do vector search. The Neo4j graph traversal enables
multi-hop reasoning that vectors alone can't find.

### 2. Dual-namespace Pinecone search
Searches both `failure_patterns` (session-level summaries, top_k=5) and
`traces` (event-level granularity, top_k=7) then merges and deduplicates.
Addresses the semantic gap between high-level summaries and granular events.
Results are capped at 2 per session to prevent any single session dominating.

### 3. Multi-hop Neo4j traversals (5 query types)
```
1-hop: Direct relationships (FAILED_WITH, RELATED_TO)
1-hop: Other sessions with same failure_type
2-hop: Shared chunks — same doc retrieved by multiple sessions
2-hop: Systemic blind spots — BlindSpot nodes hit by multiple agents
2-hop: Same query text, different outcomes (flaky failure detection)
```

### 4. Cohere Rerank v3.5 on combined results
Merges vector + graph results into a single ranked list before passing to the
analysis LLM. Correct production pattern. Graceful fallback to score=0.5
passthrough when Cohere is unavailable.

### 5. Full graceful degradation
Every retrieval step is wrapped in try/except. Empty results never crash the
pipeline — analysis nodes just work with less context.

---

## Weaknesses (see action items R1–R5 in `action_items.md`)

### W1. Query construction is naive concatenation
```python
# Current — nodes/retrieve.py
query_text = " | ".join(query_parts)
# → "billing issue | API key returned | Hallucinated: quantum encryption"
```
This is a pipe-joined string. No HyDE (hypothetical document embeddings), no
query expansion, no semantic synthesis. A single coherent query phrase would
return more relevant results than a concatenated list.

### W2. Graph results serialized as meaningless strings for reranking
```python
# Current — nodes/rerank.py _evidence_to_documents()
# direct type:
"[Graph context] Session: xyz789, Related sessions: 3, Tool calls: 2, LLM calls: 1"
```
The `direct` and `shared_chunk` graph result types produce count-only strings.
Cohere cannot meaningfully score these. Only the `related_pattern` type produces
content (`failure_summary`). The other types are wasting reranker capacity.

### W3. Rerank query is not failure-type-aware
```python
# Current — nodes/rerank.py
query = f"Analyze failure in session {session.session_id}: {session.failure_summary}"
```
The session ID adds zero semantic signal. The rerank query should describe
*what to look for* — e.g. for tool_misfire: "tool call permission error cascading failure",
for hallucination: "LLM response unsupported by retrieved sources".
Failure-type-specific queries would dramatically improve reranking relevance.

### W4. No chunk-level granularity in Pinecone
Each session is embedded as a single unit (the failure summary string).
Real RAG splits source documents into overlapping passage-length chunks so
retrieval happens at the paragraph level, not the document level.
Short, sparse embeddings reduce semantic search quality.

### W5. Retrieved evidence is appended last in the analysis prompt
```python
# Current pattern — all four analysis nodes
"=== Retrieved Evidence (reranked) ===\n..."  # appended last
```
LLMs give more weight to content at the start and end of a prompt.
Retrieved cross-session evidence is appended after the session's own trace data,
making it the least-attended part of the prompt. For cross-session pattern
detection this placement reduces its influence.

### W6. No evaluation of retrieval quality
No logging of whether `reranked_evidence` was empty vs populated. No tracking of
whether the analysis findings reference the retrieved evidence. No RAGAS-style
metrics (faithfulness, context relevance, answer relevance). Impossible to know
if the retrieval step is adding value or just adding latency.
