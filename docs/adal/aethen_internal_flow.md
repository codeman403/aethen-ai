# Aethen-AI — Internal Mechanics Flow Diagram

> Deep-dive into how Aethen classifies failures, gathers cross-session evidence,
> analyses each failure type, and synthesises the final diagnostic report.
> Companion to `aethen_flow_360.md` (entry points & routing).

---

## Part 1 — Classification: How Failure Type Is Determined

```mermaid
flowchart TD
    subgraph INPUT["📋 Session Evidence Serialised for Classifier"]
        E1("Tool calls\n• tool_name, status (success/failed/timeout)\n• error message (first 200 chars)\n• latency_ms (flagged if >5000ms)\n• parameters passed")
        E2("Retrieval events\n• query text (first 200 chars)\n• relevance_scores list\n• expected_doc_ids vs actual_doc_ids\n• doc_content snippets (domain check)\n• chunks_returned count")
        E3("LLM calls\n• prompt + response (first 400 chars each)\n• model name\n• hallucination_flag\n• source_documents list\n• Full response for hallucination comparison")
        E4("Session metadata\n• agent_id, outcome (failure/success)\n• failure_summary (hint only — not trusted)\n• pre-set failure_type (hint only)")
    end

    subgraph DECISION["🧠 classify_intent — 5-Step Priority Chain [GPT-4o-mini]"]
        STEP1{"Step 1\nAny tool call\nstatus = failed\nor timeout?"}
        STEP2{"Step 2\nexpected_doc_ids\nnon-empty AND\n≠ actual_doc_ids?"}
        STEP3{"Step 3\nRetrieval events\nexist?"}
        STEP4{"Step 4\nDoc content domain\nvs query subject?"}
        STEP5{"Step 5\nHedge-then-assert\ncheck\n(before blind_spot)"}
        STEP6("UNKNOWN\nNo clear signals detected\n→ early_exit, no analysis")
    end

    subgraph RESULTS["🏷️ Classification Outputs"]
        R_TOOL("tool_misfire\nHighest priority signal.\nAny tool failure = definitive.\nNo further steps needed.")
        R_MEM("memory\nHighest-confidence memory signal.\nDoc ID mismatch proves KB has\nright docs — retrieval failed.")
        R_BS1("blind_spot\nDocs from completely different\nsubject than query →\nagent has no coverage of this topic")
        R_MEM2("memory\nSame domain but wrong specific\ncontent + low scores (<0.5) →\nembedding/retrieval failure")
        R_HALL("hallucination\nDocs relevant but LLM added\nfacts not in retrieved content →\nLLM fabricated from training data")
        R_BS2("blind_spot\nDocs relevant, LLM says 'not found'\n→ KB has info but LLM can't\nground its answer in it")
        R_HALL2("hallucination\n(override blind_spot)\nLLM makes confident specific\nclaims — even with hedging prefix\n'I'm not sure, but typically X…'")
    end

    INPUT --> STEP1
    STEP1 -->|"YES — ANY failed tool"| R_TOOL
    STEP1 -->|"NO tools failed"| STEP2
    STEP2 -->|"YES — doc ID mismatch"| R_MEM
    STEP2 -->|"NO mismatch / no expected_doc_ids"| STEP3
    STEP3 -->|"NO retrieval events"| STEP5
    STEP3 -->|"YES — retrieval exists"| STEP4
    STEP4 -->|"Completely different subject"| R_BS1
    STEP4 -->|"Same domain, wrong docs\nscores < 0.5"| R_MEM2
    STEP4 -->|"Relevant docs,\nLLM added extra facts"| STEP5
    STEP4 -->|"Relevant docs,\nLLM says not found"| R_BS2
    STEP5 -->|"LLM makes specific\nclaims (even hedged)"| R_HALL2
    STEP5 -->|"No retrieval AND\nno fabrication detected"| STEP6
    STEP3 -->|"Relevant docs\n→ check STEP5"| STEP5
    STEP5 -->|"Genuine no-coverage\ncase confirmed"| R_BS1
    STEP4 -->|"Relevant docs,\nscores ≥ 0.5"| STEP5
    STEP5 -->|"No specific claims\nonly genuine hallucination_flag"| R_HALL

    style INPUT   fill:#1e293b,color:#94a3b8,stroke:#475569
    style DECISION fill:#1a1a2e,color:#c7d2fe,stroke:#4f46e5
    style RESULTS  fill:#052e16,color:#86efac,stroke:#16a34a
    style R_TOOL   fill:#3b0764,color:#e9d5ff,stroke:#7c3aed
    style R_MEM    fill:#0c4a6e,color:#bae6fd,stroke:#0284c7
    style R_MEM2   fill:#0c4a6e,color:#bae6fd,stroke:#0284c7
    style R_BS1    fill:#1c1917,color:#fed7aa,stroke:#ea580c
    style R_BS2    fill:#1c1917,color:#fed7aa,stroke:#ea580c
    style R_HALL   fill:#450a0a,color:#fca5a5,stroke:#ef4444
    style R_HALL2  fill:#450a0a,color:#fca5a5,stroke:#ef4444
    style STEP6    fill:#292524,color:#a8a29e,stroke:#78716c
```

### Key architectural constraint: Aethen reads traces, not the agent's KB

Aethen **never accesses the agent's knowledge base, embedding model, or domain content**. Every classification decision is made entirely from observable signals in the execution trace.

| Signal | What Aethen knows | What it doesn't know |
|--------|-------------------|---------------------|
| `relevance_scores = [0.28, 0.31]` | Retrieval returned low-confidence results | Whether those docs were actually wrong for this domain |
| `expected_doc_ids ≠ actual_doc_ids` | Agent expected specific docs, got different ones | Why the expected docs weren't returned |
| `tool_call.status = "failed"` | Tool execution failed | What the tool was supposed to do |
| `chunks_returned = 0` | Nothing in the KB matched | Whether the topic is legitimately out of scope |
| LLM response not in `doc_content` | Possible hallucination | Whether the LLM was correct from training data |

**The `expected_doc_ids` field is the critical bridge.** When agent developers populate it with what documents *should* have been retrieved, Aethen's memory classification shifts from heuristic (score thresholds) to ground-truth comparison (doc ID mismatch = definitive signal, weight 0.58). Without it, classification accuracy degrades.

**Score thresholds are universal, not domain-specific.** A medical agent's cosine similarity of 0.45 might be fine for specialised terminology; a general agent's 0.6 might still be wrong. Aethen applies the same 0.5 threshold to all domains — a known limitation.

**Aethen is a signal amplifier, not a domain expert.** It surfaces suspicious patterns for human investigation. Lower confidence scores (< 0.5) mean "investigate this" — not "this is definitively broken."

---

## Part 2 — Cross-Session Evidence: How Neo4j Graph Traversal Works

```mermaid
flowchart LR
    subgraph TRIGGER["Trigger condition"]
        T1("failure_type ≠ UNKNOWN\n+ skip_graph ≠ True\n+ Neo4j available")
    end

    subgraph TRAVERSALS["🕸️ Neo4j — 5 Traversal Types (run in parallel)"]
        HOP1A("1-hop: Direct failure links\nMATCH (s:Session)-[:FAILED_WITH]→(f:FailureType)\nFinds: sessions with same failure type\nIncluding: agent_id, failure_summary")
        HOP1B("1-hop: Related sessions\nMATCH (s)-[:RELATED_TO]→(r:Session)\nFinds: sessions linked by Aethen\nduring previous link_failure_patterns()")
        HOP2A("2-hop: Shared chunk retrieval\nSession→Query→Chunk←Query←Session\nFinds: other sessions that retrieved\nthe SAME document chunk\nSignal: systemic retrieval pattern")
        HOP2B("2-hop: Systemic blind spots\nAgent→Query→BlindSpot←Query←Agent\nFinds: same topic failing across\nmultiple agents → systemic gap")
        HOP2C("2-hop: Same-query, different outcomes\nQuery text similarity match\nFinds: identical/similar queries\nthat produced different failure types\nor succeeded — root cause clue")
    end

    subgraph OUTPUT["Graph Evidence Output"]
        GOUT("graph_results: list[dict]\n────────────────────────\nEach result contains:\n• session_id of related session\n• failure_type of that session\n• agent_id\n• failure_summary\n• relationship type\n• hop distance\n• relevance signal")
        MERGE_NOTE("Merged with pgvector results\nin merge_retrieval node\nBoth feed into fast_analyze\nas reranked_evidence")
    end

    TRIGGER --> HOP1A & HOP1B & HOP2A & HOP2B & HOP2C
    HOP1A & HOP1B & HOP2A & HOP2B & HOP2C --> GOUT
    GOUT --> MERGE_NOTE

    subgraph WHEN_USEFUL["When cross-session evidence matters most"]
        BS_USE("blind_spot analysis:\nHOP2B shows the SAME topic\nfailing across multiple agents\n→ confirms systemic KB gap\nnot just this session")
        MEM_USE("memory analysis:\nHOP2A shows other sessions\nretrieving same bad chunk\n→ confirms embedding quality\nor KB contamination issue")
        TOOL_USE("tool_misfire analysis:\nHOP1A finds sessions with same\ntool + same error pattern\n→ confirms systemic permission\nor config issue, not one-off")
    end

    MERGE_NOTE --> BS_USE & MEM_USE & TOOL_USE

    style TRAVERSALS fill:#0f172a,color:#93c5fd,stroke:#1d4ed8
    style OUTPUT fill:#052e16,color:#86efac,stroke:#166534
    style WHEN_USEFUL fill:#1c1917,color:#fde68a,stroke:#d97706
```

---

## Part 3 — Analysis & Synthesis per Failure Type

### How `fast_analyze` handles all 4 types in one LLM call

```mermaid
flowchart TD
    subgraph EVIDENCE_IN["📥 Evidence into fast_analyze"]
        FE1("Session metadata\nagent_id, outcome, failure_type hint")
        FE2("LLM calls\nprompt + response (400 chars each)\nhallucination_flag, source_documents")
        FE3("Tool calls\nstatus, error message, latency\nparameters passed")
        FE4("Retrieval events\nquery, scores, expected vs actual doc IDs\ndoc_content snippets")
        FE5("Vector evidence\nTop-3 pgvector results\nscore + content snippet (300 chars)\nSimilar failure patterns from KB")
    end

    subgraph LLM_CALL["🤖 fast_analyze — Single LLM Call\n[Claude Haiku 4.5 → GPT-4o-mini fallback]"]
        PROMPT_RULES("Prompt encodes 4 type-specific guidance blocks\n+ Root Cause Precision Rule:\n  (1) Component/mechanism that failed\n  (2) Measurable evidence (score/error/latency/doc ID)\n  (3) Downstream effect on agent response")
    end

    subgraph BRANCHES["Analysis per failure_type"]
        direction TB

        subgraph MEM_ANALYSIS["🔵 memory — Retrieval Failure"]
            MA1("Examines:\n• relevance_scores — are they < 0.5?\n• expected_doc_ids vs actual_doc_ids\n• doc_content domain match to query\n• Embedding quality signals")
            MA2("Checks:\n• Did retrieval return wrong docs?\n• Are scores consistently low?\n• Was KB contaminated with wrong content?\n• Is index stale / not updated?")
            MA3("Root cause template:\n'Embedding similarity peaked at [score] — below [threshold] — causing\nretrieval to surface [wrong doc type] instead of [expected docs],\nso LLM answered with [incorrect info].'")
        end

        subgraph TOOL_ANALYSIS["🟣 tool_misfire — Tool Execution Failure"]
            TA1("Examines:\n• Tool call status (failed/timeout)\n• Error message content\n• Latency (>5000ms = timeout signal)\n• Parameters passed\n• Cascade: did one tool failure cause others?")
            TA2("Checks:\n• Permission error? → missing OAuth scope\n• Timeout? → service down or too slow\n• Wrong params? → agent config issue\n• Repeated loops? → retry without fix")
            TA3("Root cause template:\n'[tool_name] returned [error_type] error at [latency]ms,\nindicating [permission gap / service timeout / param mismatch],\ncausing agent to [loop / return error / abandon task].'")
        end

        subgraph HALL_ANALYSIS["🔴 hallucination — Fabricated Claims"]
            HA1("Pre-analysis heuristics (before LLM call):\n1. Grounding without sources check\n   LLM says 'based on docs' but no docs provided\n2. Response/context ratio check\n   LLM response much longer than retrieved content\n3. Hedge-then-assert detection\n   'I'm not sure, but typically X...' — X is fabricated\n4. Contradiction check\n   Response contradicts doc_content directly")
            HA2("LLM analysis examines:\n• Source documents vs response claims\n• hallucination_flag=True signals\n• Confidence calibration\n• Fabricated references / citations\n• Stale sources causing wrong 'facts'")
            HA3("Root cause template:\n'LLM generated [specific claim] without grounding — [retrieved docs]\ncovered [actual topic] but not [claimed topic], and response\ncontained [X] assertions unsupported by source documents.'")
        end

        subgraph BS_ANALYSIS["🟠 blind_spot — Knowledge Gap"]
            BSA1("Examines:\n• chunks_returned = 0 → complete gap\n• Retrieval scores all < 0.3 → off-topic results\n• Query topic vs KB coverage\n• Neo4j: same topic failing across multiple agents\n• Agent says 'I don't have information'")
            BSA2("Checks:\n• Is topic completely absent from KB?\n• Is agent domain restricted?\n• Did LLM hedge correctly vs hallucinate?\n• Cross-agent pattern (systemic vs one-off)\n• Tool coverage gap (no tool for this task)")
            BSA3("Root cause template:\n'Vector search returned [0/N off-topic] chunks for query [topic],\nconfirming [topic] is absent from the knowledge base —\nagent correctly stated [no info] but [could not complete task].'")
        end
    end

    subgraph REPORT_BUILD["📊 AnalysisReport Construction"]
        RF1("failure_type\n(refined from LLM — may differ from hint)")
        RF2("summary\n2-3 sentence executive summary")
        RF3("root_cause\nONE precise sentence:\ncomponent + evidence + downstream effect")
        RF4("confidence: 0.0–1.0\nRule-based scorer — compute_confidence()\nin app/agents/nodes/confidence.py\n\nDETERMINISTIC signal weights:\n• tool_misfire: failed_status(0.45) +\n  error_msg(0.25) + timeout(0.10)\n• memory: doc_id_full_miss(0.58) or\n  partial_mismatch(scaled) or\n  score thresholds(0.20-0.30)\n• hallucination: flag × proportion\n  (0.30-0.50) + no_sources(0.15-0.30)\n• blind_spot: zero_chunks(0.50) or\n  very_low_scores(0.30)\n\nLLM raw score: secondary ±0.075 only\nFinal: clamp(base + adj, 0.05, 0.95)")
        RF5("findings[]: 2-4 items\nEach:\n• title (short headline)\n• severity (low/medium/high/critical)\n• description (detailed with evidence)\n• evidence (quoted strings from trace)\n• recommendation (specific fix action)")
    end

    EVIDENCE_IN --> LLM_CALL
    LLM_CALL --> PROMPT_RULES
    PROMPT_RULES --> MEM_ANALYSIS & TOOL_ANALYSIS & HALL_ANALYSIS & BS_ANALYSIS
    MEM_ANALYSIS & TOOL_ANALYSIS & HALL_ANALYSIS & BS_ANALYSIS --> REPORT_BUILD

    style EVIDENCE_IN    fill:#1e293b,color:#94a3b8,stroke:#475569
    style LLM_CALL       fill:#1a1a2e,color:#c7d2fe,stroke:#4f46e5
    style MEM_ANALYSIS   fill:#0c4a6e,color:#bae6fd,stroke:#0284c7
    style TOOL_ANALYSIS  fill:#3b0764,color:#e9d5ff,stroke:#7c3aed
    style HALL_ANALYSIS  fill:#450a0a,color:#fca5a5,stroke:#ef4444
    style BS_ANALYSIS    fill:#431407,color:#fed7aa,stroke:#ea580c
    style REPORT_BUILD   fill:#052e16,color:#86efac,stroke:#16a34a
    style BRANCHES       fill:#0f0f0f,color:#e5e5e5,stroke:#404040
```

---

## Part 4 — Full Internal Sequence (All Steps Combined)

```mermaid
sequenceDiagram
    autonumber
    participant REQ as Route Handler
    participant CTX as contextvars
    participant FANOUT as parallel_start
    participant CLS as classify_intent
    participant VEC as vector_retrieve
    participant GRF as graph_traverse
    participant MRG as merge_retrieval
    participant FA  as fast_analyze
    participant EX  as early_exit
    participant OUT as AnalysisReport

    Note over REQ: Step 0 - Inject per-org LLM credentials
    REQ->>CTX: set_org_llm_context(org_keys)
    REQ->>FANOUT: ainvoke(session, skip_graph?)

    Note over FANOUT,GRF: Steps 1-3 run IN PARALLEL from parallel_start
    FANOUT->>CLS: session evidence text
    FANOUT->>VEC: session query
    FANOUT->>GRF: session_id

    Note over CLS: Reads LLM calls, tool errors,<br/>retrieval scores, doc IDs.<br/>Applies 5-step priority chain.
    CLS-->>MRG: failure_type + reasoning

    Note over VEC: Dual namespace search<br/>(pgvector session_vectors table)<br/>failure_patterns + traces<br/>Top 10 results, dedup by score
    VEC-->>MRG: vector_results[]

    alt skip_graph = True
        Note over GRF: Skipped - returns immediately
        GRF-->>MRG: [] empty
    else Neo4j available
        Note over GRF: 5 traversal patterns<br/>1-hop + 2-hop, max depth 2
        GRF-->>MRG: graph_results[]
    end

    Note over MRG: All three converge here.<br/>Reads failure_type from classify result.
    MRG->>MRG: check failure_type

    alt failure_type = UNKNOWN
        MRG->>EX: no failure signals
        Note over EX: Short-circuit - skips analysis
        EX-->>OUT: failure_type=unknown, confidence=0.0, findings=[]
    else failure_type is known
        MRG->>FA: session + vector_results + graph_results
        Note over FA: Builds full context block<br/>LLM calls, tool calls, retrieval events,<br/>top-3 pgvector evidence.<br/>Applies type-specific guidance.<br/>Root Cause Precision Rule enforced.<br/>Tries Claude Haiku first,<br/>falls back to GPT-4o-mini.
        FA-->>OUT: failure_type, summary, root_cause, confidence, findings[]
    end
```

---

## Part 5 — Root Cause Precision Rule (How Root Causes Are Structured)

Every `root_cause` string must satisfy exactly three requirements in one sentence:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ROOT CAUSE = (1) + (2) + (3)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ (1) The specific component or mechanism that failed                          │
│     → "Embedding similarity", "OAuth scope for send_email",                 │
│       "vector index for API rate limit docs", "tool timeout threshold"       │
│                                                                              │
│ (2) The measurable evidence confirming it                                    │
│     → score value, error message, latency in ms, doc ID mismatch,           │
│       hallucination_flag=True, chunks_returned=0                             │
│                                                                              │
│ (3) The downstream effect on the agent response                             │
│     → what the agent actually said/did wrong as a result                     │
└─────────────────────────────────────────────────────────────────────────────┘

✅ GOOD: "Embedding similarity peaked at 0.38 — below the 0.5 threshold —
         causing retrieval to surface billing policy docs instead of the
         expected API rate limit documentation, so the LLM answered with
         stale pricing data from 2023."

❌ BAD:  "The retrieval system returned incorrect documents."
❌ BAD:  "The tool call failed due to an error."
❌ BAD:  "The LLM hallucinated information."
```

---

## Part 6 — Confidence Score Assignment Logic

**The confidence score is LLM-determined, not rule-based.**

The prompt instructs the LLM: *"confidence: 0.0–1.0"* — and the LLM reads all
the evidence and picks a number based on how strongly the signals support its diagnosis.
There are no backend thresholds or rules that set specific values.

```python
# backend code — fast_analyze.py
confidence = float(parsed.get("confidence", 0.5))  # 0.5 fallback if LLM omits it

# Hardcoded exceptions (backend enforced, not LLM):
#   early_exit (UNKNOWN, no signals)  → 0.0
#   UNKNOWN path in fast_analyze      → 0.0
#   "no failure detected" (synthesize)→ 1.0  (legacy pipeline only)
#   JSON parse failure fallback        → 0.5
```

**What the LLM tends to produce** (observed behaviour, not enforced):

| Evidence quality | Typical LLM output |
|-----------------|-------------------|
| Explicit tool error message + stack trace | 0.85 – 0.95 |
| Doc ID mismatch (expected_doc_ids ≠ actual) | 0.80 – 0.92 |
| `hallucination_flag = True` in trace | 0.75 – 0.90 |
| `chunks_returned = 0` (blind spot confirmed) | 0.70 – 0.88 |
| Low retrieval scores < 0.5 (no doc IDs) | 0.55 – 0.75 |
| Inferred from response pattern alone | 0.40 – 0.65 |
| Weak or conflicting signals | 0.25 – 0.50 |
| No signals found | 0.00 (early_exit fires before LLM call) |

**Production-grade caveat**: The rule-based scorer is deterministic and evidence-driven —
a major improvement over LLM self-reporting. However, the weights (0.45, 0.55, etc.)
are domain heuristics, not learned from data. True production calibration requires:
1. Collect 500+ sessions with outcome labels (was the diagnosis correct?)
2. Fit logistic regression on signal weights using that data
3. Apply Platt scaling to map scores → true probabilities
4. Add a feedback endpoint (user marks diagnosis right/wrong)
5. Retrain quarterly

Current system is **production-safe** for a capstone/demo where confidence informs
but doesn't drive automated decisions. Not yet production-safe for SLA triggers or
auto-remediation.

**What's fully production-grade now:**
- Deterministic ✅ · Explainable (breakdown log) ✅ · Evidence-based ✅ · Tested (40 unit tests) ✅

---

## Part 7 — Finding Severity Assignment Logic

```
critical  → Agent completely failed the task AND caused data corruption
            or cascading failures (e.g. tool loop destroying state)

high      → Agent returned wrong answer with confidence, or primary task
            failed (e.g. doc mismatch on main query, tool permission denied)

medium    → Agent partially answered or hedged correctly but core capability
            is degraded (e.g. retrieved 3/5 right docs, 2 wrong)

low       → Minor quality issue, edge case, or degraded performance within
            acceptable bounds (e.g. slight score drop, minor phrasing issue)
```
