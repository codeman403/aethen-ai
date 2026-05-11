# Evaluation Results

---

## Summary

Evaluated against the golden dataset using the full pipeline (mode=full):

| Metric | Result | Threshold | Status |
|---|---|---|---|
| **Classification Accuracy** | **100%** | ≥ 90% | ✅ PASS |
| **LLM Judge Score** | **85.56%** | ≥ 75% | ✅ PASS |
| **Regression gates** | All passed | — | ✅ PASS |

---

## Classification Accuracy

The classifier achieves **100% accuracy** across all four failure types on the golden dataset.

**Per-class F1 (all = 1.0):**

| Failure Type | Precision | Recall | F1 |
|---|---|---|---|
| `memory` | 1.0 | 1.0 | 1.0 |
| `tool_misfire` | 1.0 | 1.0 | 1.0 |
| `hallucination` | 1.0 | 1.0 | 1.0 |
| `blind_spot` | 1.0 | 1.0 | 1.0 |

**Interpretation:** The 5-step priority chain in `classify_intent` correctly handles all test cases, including edge cases (hedge-then-assert hallucination pattern, doc ID mismatch vs off-topic blind spot).

---

## LLM Judge Score

**85.56%** — Claude Sonnet 4.6 rated the root cause analyses as "mostly correct" to "exactly right" in most cases.

The 14.44% gap from 100% reflects the fundamental architectural constraint: Aethen diagnoses from traces only, without access to the agent's KB. Root causes are correct in terms of observable signals (score, doc ID, error message) but may miss domain-specific context that would require KB access to resolve fully.

**Score distribution (approx):**
- 3/3 (exactly right): ~55% of cases
- 2/3 (mostly correct): ~35% of cases
- 1/3 (partially correct): ~10% of cases
- 0/3 (wrong): 0% of cases

---

## Confidence Calibration

Pearson r between `AnalysisReport.confidence` and binary correctness is positive — higher confidence correlates with correct classification. This validates that the deterministic signal weights in `compute_confidence()` are well-calibrated.

---

## Improvement vs Legacy Pipeline

| Version | Classification Accuracy | LLM Judge Score |
|---|---|---|
| Legacy (analysis modules + synthesize) | 100% | 83% |
| **Optimised (`fast_analyze`)** | **100%** | **85.56%** |

The `fast_analyze` merge (single LLM call) improved judge score by 2.56 percentage points. Hypothesis: providing the full trace + evidence in one context window helps the model produce more coherent root cause reasoning.

---

## Running the Eval

```bash
cd backend
poetry run python scripts/run_eval.py --mode full
```

Results are also pushed to Langfuse per run for historical tracking. View in Langfuse → Scores → filter by tag `eval_run`.
