# Problem Statement

---

## The Problem

AI agents are increasingly deployed in production: customer support bots, code review agents, document Q&A systems, research assistants. When they fail — and they do fail — diagnosing the root cause is painful and slow.

**Current state for an AI engineer debugging a production failure:**

1. Open Langfuse (or LangSmith) and find the trace
2. Manually read through LLM prompts and responses
3. Check which documents were retrieved and whether they were relevant
4. Look at tool call logs for errors or timeouts
5. Hypothesise: was this a bad retrieval? A hallucination? A tool failure? A knowledge gap?
6. Repeat for 5–20 similar failures to find the pattern

This manual process takes 30–120 minutes per investigation. For teams running multiple AI agents at scale, it is unsustainable.

---

## The Gap

Existing tools are observability tools, not diagnostic tools:

| Tool | What it does | What it doesn't do |
|---|---|---|
| **Langfuse** | Records and visualises traces | Diagnoses why the agent failed |
| **LangSmith** | Evaluates and compares LLM outputs | Classifies failure types from trace signals |
| **Datadog / Sentry** | Monitors errors and exceptions | Understands LLM-specific failure modes |
| **RAGAS** | Evaluates RAG quality | Identifies failures in production traces |

None of these tools reason across all four failure dimensions simultaneously (retrieval failure, tool failure, hallucination, knowledge gap) and produce a root cause analysis from the observable signals.

---

## The Cost

For a team running AI agents in production:

- **MTTR** (mean time to remediate) for LLM failures is hours to days when done manually
- **Pattern blindness** — individual failures look random; systemic patterns require aggregating signals across many sessions
- **On-call fatigue** — LLM failures page engineers who have no specialised diagnostic tools
- **Missed improvements** — without root cause data, the team cannot prioritise KB updates, prompt changes, or tool fixes systematically

---

## The Solution

Aethen-AI is a diagnostic layer that sits on top of existing observability tools. It:

1. **Ingests** traces from Langfuse and LangSmith
2. **Classifies** the failure type using a multi-signal reasoning pipeline (GPT-4o-mini + structured logic)
3. **Retrieves** similar past failures for cross-session context (pgvector + Neo4j Graph RAG)
4. **Synthesises** a structured root cause analysis with remediation recommendations (Claude Haiku 4.5)
5. **Scores** confidence deterministically from trace evidence (not LLM self-reporting)

The result: a complete diagnostic report in 9–12 seconds, without manual trace inspection.
