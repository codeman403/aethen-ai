# Use Cases

---

## Primary Use Case: AI Agent Production Debugging

**Who:** AI engineers at companies running LLM agents in production

**Scenario:** An AI customer support agent is giving wrong answers. The engineer opens Langfuse, finds the failing trace, imports it into Aethen, and receives a structured diagnosis in 10 seconds: "The retrieval system returned outdated product docs — the enterprise pricing page was not indexed."

**Value:** Reduces MTTR from hours of manual trace reading to < 1 minute.

---

## Use Case: Systematic Failure Pattern Analysis

**Who:** ML engineers building and maintaining RAG pipelines

**Scenario:** The engineer imports 50 failed sessions from the past week. Aethen classifies them by type (memory: 32, hallucination: 12, blind spot: 6) and identifies a recurring blind spot: "No content on enterprise security compliance." The knowledge base needs a new content category.

**Value:** Surfaces systemic patterns that individual trace inspection misses.

---

## Use Case: Pre-Release Regression Testing

**Who:** AI product teams preparing a new agent version for deployment

**Scenario:** Before releasing a new agent version, the team runs the eval pipeline on a golden dataset of known failures to verify the new version doesn't introduce regressions. The regression gates (accuracy ≥ 90%, judge ≥ 75%) must pass before the version is promoted.

**Value:** Catches diagnostic regressions before they reach users.

---

## Use Case: Demo and Stakeholder Presentations

**Who:** AI engineers demoing their work to product managers or evaluators

**Scenario:** The engineer opens the Demo Agent page, clicks "Hallucination" scenario, shows the LLM producing a confident response with fabricated details, then pulls the trace into Aethen and demonstrates the root cause analysis in real time.

**Value:** Live, interactive end-to-end demo without scripts or setup.

---

## Out of Scope

- **Real-time agent monitoring** — Aethen analyses completed sessions; it does not intercept live agent calls
- **Automatic agent self-healing** — Aethen diagnoses and recommends; it does not modify the monitored agent
- **General LLM evaluation** — Aethen is purpose-built for agent failure diagnosis; it is not a general-purpose LLM eval framework
