# Evaluation Methodology

---

## Objectives

The evaluation pipeline answers three questions:

1. **Classification** — Does Aethen correctly identify the failure type from the trace?
2. **Retrieval** — Are the right evidence documents retrieved for analysis?
3. **Synthesis** — Is the root cause analysis accurate and useful?

---

## Dataset

**File:** `backend/data/eval_dataset.json`

**Generation:** `poetry run python scripts/generate_eval_dataset.py`

The dataset contains sessions with ground truth labels embedded in `metadata._ground_truth`:

```json
{
  "metadata": {
    "_ground_truth": {
      "failure_type": "memory",
      "root_cause_keywords": ["embedding", "mismatch", "wrong document", "stale"]
    }
  }
}
```

Sessions cover all four failure types, including edge cases:
- Memory failures with no `expected_doc_ids` (score-only evidence)
- Memory failures with full doc ID mismatch
- Tool misfires with and without error messages
- Hallucinations with and without `hallucination_flag=True`
- Blind spots with zero chunks returned
- Mixed/ambiguous sessions (should classify as UNKNOWN → early exit)

---

## Eval Modes

### Fast Mode

**Command:** `poetry run python scripts/run_eval.py --mode fast`

Runs `classify_intent` only (1 LLM call per session). No Langfuse, pgvector, or Neo4j required.

**Computes:**
- Classification accuracy, per-class F1, confusion matrix
- Confidence calibration (Pearson r between confidence and correctness)
- Context recall from dataset metadata (informational, no gate)

**Suitable for:** CI, quick regression checks, pre-commit validation.

### Full Mode

**Command:** `poetry run python scripts/run_eval.py --mode full`

Runs the complete `analysis_graph.ainvoke()` pipeline (same as production). Requires all services.

**Computes:** All fast metrics + keyword match rate + LLM judge score.

**LLM judge:** Claude Sonnet 4.6 rates each root cause on a 0–3 scale:
- 0 = completely wrong or irrelevant
- 1 = partially correct, misses key issue
- 2 = mostly correct, captures main problem
- 3 = exactly right, precisely identifies root cause

Normalised to 0–1 and averaged. Concurrency: 5 parallel LLM calls (`asyncio.Semaphore(5)`).

---

## Metrics

### Classification Metrics

```python
@dataclass
class ClassificationMetrics:
    accuracy: float                        # correct / total
    per_class: dict[str, PerClassMetrics]  # precision, recall, F1 per type
    confusion_matrix: list[list[int]]      # 4×4 actual vs predicted
    confusion_labels: list[str]            # [memory, tool_misfire, hallucination, blind_spot]
    confidence_calibration_r: float        # Pearson r (confidence vs correctness)
    sample_count: int
```

### Retrieval Metrics

```python
@dataclass
class RetrievalMetrics:
    context_recall: float      # |expected ∩ actual| / |expected|
    context_precision: float   # |source_docs ∩ actual| / |actual|
    hit_rate: float            # % sessions where ≥1 expected doc retrieved
    sample_count: int
```

Context recall is informational only (not a regression gate). In the eval dataset, memory failure sessions deliberately have mismatched doc IDs — so recall is expected to be non-100%.

### Synthesis Metrics

```python
@dataclass
class SynthesisMetrics:
    mode: Literal["fast", "full"]
    keyword_match_rate: float    # % sessions with ≥1 ground-truth keyword in root_cause
    avg_confidence: float        # mean AnalysisReport.confidence
    judge_score: float | None    # mean LLM judge score (0–1); None in fast mode
    sample_count: int
```

---

## Regression Gates

```python
REGRESSION_THRESHOLDS = {
    "classification_accuracy": 0.90,
    "keyword_match_rate": 0.70,
    "judge_score": 0.75,
}
```

`check_regression_gates()` returns `RegressionResult(passed: bool, gates: dict)`.

A deployment fails the regression check if **any** gate value is below threshold. The eval API endpoint returns `regression_passed` and the per-gate breakdown.

---

## Results (v0.1.0)

Evaluated on the full golden dataset, full mode:

| Metric | Value |
|---|---|
| Classification Accuracy | **100%** |
| LLM Judge Score | **85.56%** |
| Confidence Calibration (Pearson r) | Positive correlation |

Interpretation:
- **100% accuracy** — the classifier correctly identifies all four failure types from trace signals
- **85.56% judge score** — root cause analyses are judged as "mostly correct" to "exactly right" in the majority of cases
- The 14.44% gap from perfect judge score reflects the fundamental constraint: Aethen cannot access the agent's KB, so some root causes are correct diagnostics based on trace signals but may miss domain-specific context

---

## Running the Eval

```bash
# Fast mode (CI-safe)
cd backend
poetry run python scripts/run_eval.py --mode fast

# Full mode (requires all services + LLM keys)
poetry run python scripts/run_eval.py --mode full

# API endpoint (production)
curl -X POST https://aethen-ai-backend.onrender.com/api/eval \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"mode": "full", "push_to_langfuse": true}'
```

---

## Langfuse Score Integration

Every eval run pushes scores to Langfuse for historical tracking:

- **Per-session scores:** `aethen_classification`, `aethen_context_recall`, `aethen_keyword_match`
- **Aggregate scores:** `accuracy`, `keyword_match_rate`, `judge_score` tagged with `run_id`

View in Langfuse → Project → Scores → filter by tag `eval_run`.
