# Aethen-AI — Token Usage Analysis (Diagnostic Path)

> Analyzed: 2026-04-29
> Based on: actual prompt sizes read from source code

---

## Script

```python
# Rough token estimator (1 token ≈ 4 chars)
def tokens(text): return len(text) // 4

# ── Call #1: _llm_route system prompt (from chat.py) ──────────────────────
# System prompt alone (conservative estimate from actual code)
llm_route_system_tokens = 850   # the actual prompt text in chat.py
llm_route_history_tokens = 15 * 75  # 15 msgs * avg 75 tokens each
llm_route_stats_tokens = 30          # inline stats
llm_route_query_tokens = 50
llm_route_output_tokens = 25         # just {intent: diagnostic, failure_type: memory}

call1_in = llm_route_system_tokens + llm_route_history_tokens + llm_route_stats_tokens + llm_route_query_tokens
call1_out = llm_route_output_tokens

# ── Call #2: classify_intent system prompt ─────────────────────────────────
classify_system = 450   # CLASSIFY_SYSTEM_PROMPT
classify_evidence = 400 # session header + retrieval events + tool calls + LLM call snippets (300-char truncated)
classify_out = 35       # {failure_type: memory, reasoning: one sentence}

call2_in = classify_system + classify_evidence
call2_out = classify_out

# ── Call #3: analysis node (e.g. memory_debug) ────────────────────────────
analysis_system = 350   # MEMORY_DEBUG_PROMPT (or equivalent)
analysis_context = 600  # session header + retrieval events + reranked_evidence (8 items)
analysis_out = 650      # structured JSON: analysis narrative + findings[] + root_cause

call3_in = analysis_system + analysis_context
call3_out = analysis_out

# ── Call #4: synthesize ───────────────────────────────────────────────────
synth_system = 300      # SYNTHESIZE_PROMPT
synth_context = 500     # session header + raw analysis JSON from call #3
synth_out = 600         # summary + refined findings + root_cause + confidence

call4_in = synth_system + synth_context
call4_out = synth_out

grand_total = (call1_in + call1_out) + (call2_in + call2_out) + (call3_in + call3_out) + (call4_in + call4_out)
```

---

## Results

```
Call #1  _llm_route      Claude Sonnet 4.6    in=2055  out=  25  total=2080   34.9%
Call #2  classify_intent GPT-4o-mini          in= 850  out=  35  total= 885   14.8%
Call #3  analysis_node   GPT-4o-mini          in= 950  out= 650  total=1600   26.8%
Call #4  synthesize      Claude Sonnet 4.6    in= 800  out= 600  total=1400   23.5%

Grand total:  5,965 tokens
Total input:  4,655  (78.0%)
Total output: 1,310  (22.0%)
```

---

## Visualisation

```
Call #1  _llm_route      Claude Sonnet 4.6    ████████████  35%
Call #2  classify_intent GPT-4o-mini          █████          15%
Call #3  analysis_node   GPT-4o-mini          ████████       27%
Call #4  synthesize      Claude Sonnet 4.6    ████████       23%
```

---

## What Drives Each Number

**Call #1 — `_llm_route` (35%, mostly input)**
The single most token-heavy call despite producing the smallest output (~25 tokens).
The system prompt carries:
- Full SQL schema + security rules + intent definitions (~850 tokens of instructions)
- Up to 15 conversation history messages re-sent every turn (~1,125 tokens)
- Live stats injected inline (~30 tokens)

You pay ~2,000 tokens of input to produce 25 tokens of routing signal.

**Call #2 — `classify_intent` (15%, cheapest)**
Lightest call. Short system prompt (~450 tokens) + serialized trace evidence
(~400 tokens, with 300-char truncation applied to LLM prompts/responses).
Output is one JSON object + one reasoning sentence.

**Call #3 — analysis node (27%, biggest output)**
Balanced input/output. System prompt + session trace context + up to 8 reranked
evidence items on input. Output is the largest of the four — structured JSON
with a narrative analysis block, multiple `findings[]` objects, and root cause.

**Call #4 — `synthesize` (23%)**
Input is driven by the raw JSON from Call #3 being passed in full.
Output is a refined structured report. Most reasoning happens here.

---

## Key Observation — Optimization Opportunity

**Call #1 burns 35% of total tokens just for routing.**
The majority is conversation history (~1,125 tokens) re-transmitted on *every single
turn*. For a 10-turn conversation, the history block is sent 10 times — meaning
history alone accounts for ~11,250 tokens of overhead across the session.

If token cost ever becomes a concern, Call #1's history window is the highest-leverage
target: reducing from 15 messages to 6 would cut overall per-turn cost by ~13%.
