# Failure Analysis

---

## Common Failure Patterns in Eval

### 1. Hedge-then-assert Misclassification (Resolved)

**Pattern:** LLM response starts with "I couldn't find documentation, but typically X..." — early versions classified this as `blind_spot`.

**Root cause:** The classifier was not checking whether the LLM added specific technical claims after the hedge.

**Fix:** Added the `HEDGE-THEN-ASSERT` rule to the classifier prompt with explicit instruction to compare the LLM's specific claims against `doc_content`, regardless of the hedging prefix.

**Current status:** Correctly classified as `hallucination` in all test cases.

---

### 2. Memory vs Blind Spot Confusion (Resolved)

**Pattern:** Sessions where retrieval returned docs from a completely different domain were sometimes classified as `memory` (wrong specific docs) instead of `blind_spot` (no relevant docs).

**Root cause:** The classifier was using relevance scores to distinguish memory from blind spot, but the classification rule should be based on functional domain, not score.

**Fix:** Added explicit rule: "Ask 'are the retrieved docs from the same functional category as the query?' Billing query → API docs = blind_spot. API enterprise query → API standard docs = memory."

**Current status:** 100% accuracy on domain-crossing blind spot cases.

---

### 3. False Memory Classification (No `expected_doc_ids`)

**Pattern:** When `expected_doc_ids` is empty but scores are low, the classifier sometimes classified as `memory` when it should have been `blind_spot`.

**Root cause:** The classifier was over-weighting low scores as evidence of "wrong docs retrieved" without checking the content domain.

**Fix:** The `DEFINITIVE SIGNAL` rule for memory requires `expected_doc_ids` to be non-empty AND mismatched. Without expected doc IDs, the classifier must evaluate doc_content subject matter.

**Current status:** Correct classification based on subject category when `expected_doc_ids` is absent.

---

### 4. Confidence Over-reporting (Resolved)

**Pattern:** Early versions used `float(parsed.get("confidence", 0.5))` from the LLM response as the primary confidence score. LLMs consistently reported 0.8–0.95 even for weak evidence.

**Root cause:** LLMs are systematically overconfident.

**Fix:** Replaced with `compute_confidence()` — deterministic evidence-based scoring. LLM confidence is now a ±0.075 secondary adjustment only.

**Current status:** Confidence calibration Pearson r is positive; scores match evidence strength.

---

## Known Classification Limitations

### Mixed Failure Sessions

If a session has both a tool failure and hallucination, the classifier picks the highest-priority signal (`tool_misfire` via Step 1). The hallucination is not separately reported.

**Mitigation:** The `fast_analyze` node may identify secondary issues in its findings even when the primary classification is `tool_misfire`.

### Incomplete Trace Data

Some real-world Langfuse traces may lack `expected_doc_ids`, `hallucination_flag`, or `doc_content`. Without these high-quality signals, classification falls back to lower-quality heuristics (relevance score range, failure summary keywords).

**Mitigation:** The confidence scorer penalises missing signals (e.g., `no_failed_tools = 0.10` when classified as tool_misfire but no tool failures found in trace).
