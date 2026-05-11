# Chunking

---

## Aethen's Approach

Aethen does not chunk documents in the traditional RAG sense. Instead, it indexes **trace events** as the unit of retrieval.

Each "chunk" is a single trace event from an agent execution session:
- One LLM call → one vector
- One tool call → one vector
- One retrieval event → one vector
- One session → one failure pattern vector (session-level summary)

This design is intentional: trace events are already discrete, semantically coherent units. The boundaries are natural (one LLM call, one tool invocation) rather than arbitrary character splits.

---

## "Chunk" Characteristics

| Chunk type | Approximate tokens | Semantic unit |
|---|---|---|
| LLM call | ~200–400 | One prompt-response pair |
| Tool call | ~50–150 | One tool invocation with parameters + result |
| Retrieval event | ~100–200 | One vector DB query with scores |
| Failure pattern | ~150–300 | Session-level failure summary |

All are well within `text-embedding-3-small`'s 8 191-token context.

---

## Why Not Traditional Chunking?

Traditional document chunking (recursive character splitting, sentence windows) is designed for unstructured text documents. Aethen's "documents" are structured JSON trace objects. The structure already provides the chunking boundaries:

```json
{
  "llm_calls": [          // ← one vector per call
    { "prompt": "...", "response": "..." }
  ],
  "tool_calls": [         // ← one vector per call
    { "tool_name": "...", "status": "failed", "error": "..." }
  ],
  "retrieval_events": [   // ← one vector per event
    { "query": "...", "relevance_scores": [...] }
  ]
}
```

Each event type has a different text representation optimised for semantic similarity against that event type.

---

## Overlap Strategy

No overlap is applied between vectors — each event is independent. The session-level failure pattern vector serves as a coarse-grained "summary chunk" that captures the aggregate failure signature when event-level vectors may be insufficient.

---

## Future: Semantic Chunking

When ingesting large documents (knowledge base articles, runbooks) as reference content, semantic chunking would be appropriate. This is a future enhancement — not in v0.1 scope.
