# Evaluation

Aethen-AI uses a structured evaluation pipeline to measure diagnostic accuracy before every production deployment. Two modes: **fast** (CI-safe, no LLM) and **full** (LLM-as-judge).

---

## Results Summary

| Metric | Result | Threshold | Mode |
|---|---|---|---|
| **Classification Accuracy** | **100%** | ≥ 90% | fast + full |
| **LLM Judge Score** | **85.56%** | ≥ 75% | full only |
| Keyword Match Rate | — | ≥ 70% | full |

---

## Eval Modes

### Fast Mode (CI-Safe)

Runs `classify_intent` only — 1 LLM call per session. No Pinecone, Neo4j, or Postgres required. Completes in ~30 s on the golden dataset.

**Computes:** Classification accuracy, per-class F1, confusion matrix, confidence calibration (Pearson r), context recall from dataset metadata.

```bash
poetry run python scripts/run_eval.py --mode fast
```

### Full Mode (LLM-as-Judge)

Runs the complete `analysis_graph.ainvoke()` pipeline on every golden dataset session. Includes LLM-as-judge scoring for root cause quality.

**Computes:** All fast metrics + keyword match rate + LLM judge score (Claude Sonnet 4.6, 0–3 scale normalised to 0–1).

```bash
poetry run python scripts/run_eval.py --mode full
```

---

## Golden Dataset

`backend/data/eval_dataset.json` — sessions with ground truth labels:

```json
{
  "sessions": [
    {
      "session_id": "...",
      "failure_type": "memory",
      "retrieval_events": [...],
      "metadata": {
        "_ground_truth": {
          "failure_type": "memory",
          "root_cause_keywords": ["embedding", "mismatch", "wrong document"]
        }
      }
    }
  ]
}
```

Generate or regenerate: `poetry run python scripts/generate_eval_dataset.py`

---

## Metrics Definitions

### Classification Metrics

- **Accuracy** — `correct / total` across all failure types
- **Per-class F1** — harmonic mean of precision and recall for each of the 4 failure types
- **Confusion matrix** — 4×4 matrix (memory, tool_misfire, hallucination, blind_spot)
- **Confidence calibration** — Pearson r between `AnalysisReport.confidence` and binary correctness; positive r means higher confidence correlates with correct classification

### Retrieval Metrics

- **Context recall** — `|expected_doc_ids ∩ actual_doc_ids| / |expected_doc_ids|` — how many expected docs were retrieved
- **Context precision** — `|source_documents ∩ actual_doc_ids| / |actual_doc_ids|` — how many retrieved docs the LLM actually used
- **Hit rate** — % of sessions where ≥ 1 expected doc was retrieved

### Synthesis Metrics

- **Keyword match rate** — % of root cause analyses that contain ≥ 1 ground truth keyword from `_ground_truth.root_cause_keywords`
- **LLM judge score** — Claude Sonnet 4.6 rates each root cause on a 0–3 scale: 0 = wrong, 1 = partial, 2 = mostly correct, 3 = exact. Normalised to 0–1 and averaged across the dataset.

---

## Regression Gates

```python
REGRESSION_THRESHOLDS = {
    "classification_accuracy": 0.90,
    "keyword_match_rate": 0.70,
    "judge_score": 0.75,
}
```

`check_regression_gates()` returns `RegressionResult(passed=True/False, gates={...})`. The eval API endpoint (`POST /api/eval`) runs gates automatically and returns `regression_passed` in the response.

Context recall is **informational only** — not a regression gate. In the synthetic dataset, memory failure sessions intentionally have mismatched doc IDs (that is the failure being diagnosed), so recall is expected to be low.

---

## Langfuse Integration

Eval results are pushed to Langfuse for historical tracking:

- Per-session: `predicted_type`, `expected_type`, `confidence`, `context_recall`, `keyword_match`
- Aggregate: `accuracy`, `keyword_match_rate`, `judge_score` per run ID

Scores appear in Langfuse → Project → Scores dashboard.

---

## API Endpoint

```
POST /api/eval
Authorization: Bearer <jwt>

{
  "mode": "fast" | "full",
  "limit": 20,              # optional — run on first N sessions
  "push_to_langfuse": true  # optional — default true
}
```

Response:
```json
{
  "data": {
    "run_id": "eval-run-abc12345",
    "accuracy": 1.0,
    "regression_passed": true,
    "gates": {
      "classification_accuracy": { "threshold": 0.9, "actual": 1.0, "passed": true }
    }
  }
}
```
