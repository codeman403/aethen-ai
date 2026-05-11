# Reranking

---

## Why Reranking?

Vector similarity search (cosine distance between embeddings) measures geometric proximity in embedding space. It is fast but imprecise — the top-10 results by cosine similarity may not be the top-10 most relevant to the specific diagnostic question.

Cohere Rerank v3 applies a cross-encoder model that scores each document against the query independently, producing a more accurate relevance ranking at the cost of one additional API call.

---

## Implementation

`app/agents/nodes/rerank.py`

```python
import cohere

async def rerank(state: AgentState) -> dict:
    evidence = state.get("vector_results", []) + state.get("graph_results", [])
    query = build_rerank_query(state)  # failure summary + query text

    co = cohere.AsyncClient(api_key=settings.cohere_api_key)
    response = await co.rerank(
        model="rerank-v3-nimble",
        query=query,
        documents=[e.get("content") or e.get("text") or "" for e in evidence],
        top_n=5,
    )

    reranked = [evidence[r.index] for r in response.results]
    return {"reranked_evidence": reranked}
```

Takes top-5 results from the combined `vector_results + graph_results` list.

---

## Cohere Rerank v3

| Property | Value |
|---|---|
| Model | `rerank-v3-nimble` |
| Input | Query string + list of document texts |
| Output | Relevance scores (0–1) + sorted indices |
| Latency | ~100–300 ms |

`rerank-v3-nimble` is the faster/cheaper variant of Cohere Rerank v3, optimised for production latency.

---

## Graceful Degradation

If `COHERE_API_KEY` is not set or the Cohere API is unavailable:

```python
if not settings.cohere_api_key:
    return {"reranked_evidence": (evidence)[:5]}  # return top-5 by vector score
```

The pipeline continues with the original vector order. Analysis quality may be slightly lower but the pipeline does not fail.

---

## When Reranking Runs

In `analysis_graph` (production): reranking runs after `merge_retrieval` on the combined vector + graph evidence.

In `fast_analysis_graph` (demo agent): reranking is skipped — the demo uses `fast_analyze` directly on raw pgvector results. The latency saving (~300 ms) is more important than marginal accuracy for the demo.

---

## Observed Impact

Reranking consistently surfaces the most directly comparable failure sessions at position 1-2, even when the exact vector match was at position 4-5. This improves the quality of the "similar failure patterns" context provided to `fast_analyze`, leading to more specific root cause evidence in the LLM prompt.
