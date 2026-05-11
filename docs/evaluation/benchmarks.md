# Benchmarks

---

## Classification Accuracy Benchmark

**Threshold:** ≥ 90% accuracy required to pass regression gate  
**Current:** 100% (all failure types)

| Failure Type | Samples | Correct | Accuracy |
|---|---|---|---|
| `memory` | N/4 | N/4 | 100% |
| `tool_misfire` | N/4 | N/4 | 100% |
| `hallucination` | N/4 | N/4 | 100% |
| `blind_spot` | N/4 | N/4 | 100% |

The synthetic dataset has balanced class distribution (equal samples per failure type).

---

## LLM Judge Benchmark

**Threshold:** ≥ 75% (score ≥ 2.25/3.0 average)  
**Current:** 85.56% (score ≈ 2.57/3.0 average)

The judge evaluates root cause precision: does the root cause name the specific component, the measurable evidence, and the downstream effect?

| Score | Rating | Approx % |
|---|---|---|
| 3/3 | Exactly right | ~55% |
| 2/3 | Mostly correct | ~35% |
| 1/3 | Partially correct | ~10% |
| 0/3 | Wrong | 0% |

---

## Pipeline Latency

Measured on the optimised `analysis_graph` (Render free tier, cold):

| Phase | Time |
|---|---|
| `classify_intent` (GPT-4o-mini) | ~800 ms |
| `vector_retrieve` (pgvector exact) | ~20 ms |
| `graph_traverse` (Neo4j) | ~200–500 ms |
| All three parallel | ~800–900 ms (dominated by LLM) |
| `rerank` (Cohere) | ~200–300 ms |
| `fast_analyze` (Claude Haiku 4.5) | ~6–8 s |
| **Total** | **~8–10 s** |

With `skip_graph=True`: ~5–7 s (saves Neo4j RTT).  
Cold start (Render free): +30 s on first request after idle.

---

## Token Usage

Per analysis (approximate):

| Node | Input tokens | Output tokens |
|---|---|---|
| `classify_intent` | ~600 | ~20 |
| `fast_analyze` | ~1 500 | ~500 |
| **Total** | **~2 100** | **~520** |

Estimated cost per analysis:
- GPT-4o-mini: $0.15/M input + $0.60/M output ≈ **$0.0003**
- Claude Haiku 4.5: $0.80/M input + $4.00/M output ≈ **$0.003**
- Cohere Rerank: $0.002 per call
- **Total: ~$0.006 per analysis** at current model prices

---

## Retrieval Performance

| Metric | Value | Notes |
|---|---|---|
| pgvector exact search | < 5 ms | At current data scale (< 100K vectors) |
| pgvector with HNSW | ~8–15 ms | When HNSW index is enabled |
| Cohere rerank | ~200–300 ms | 10 documents |
| Neo4j Cypher | ~100–500 ms | Aura free tier latency |
