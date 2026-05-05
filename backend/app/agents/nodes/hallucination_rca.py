"""Hallucination RCA node — root cause analysis for LLM hallucinations.

Cross-references LLM outputs against source documents to identify
fabricated claims, unsupported conclusions, and misquoted sources.

Includes content-based pre-analysis heuristics that run BEFORE the LLM call,
providing structured evidence even when source_documents and hallucination_flag
are unavailable (common in live Langfuse traces).
"""

import re

import structlog

from app.agents.llm import get_openai_llm
from app.agents.state import AgentState, ensure_session
from app.config import settings

logger = structlog.get_logger()

HALLUCINATION_RCA_PROMPT = """\
You are an expert AI systems debugger specializing in LLM hallucination detection
and root cause analysis.

Analyze the following session trace data, pre-analysis heuristics, and evidence
to diagnose hallucination failures.

Focus on:
1. **Ungrounded claims** — LLM responses containing facts not present in source documents
2. **Source misattribution** — claims attributed to wrong source documents
3. **Retrieval gaps** — hallucinations caused by insufficient context retrieval
4. **Stale sources** — outdated documents leading to incorrect information
5. **Confidence calibration** — model producing high-confidence responses despite weak evidence
6. **Fabricated references** — citations to non-existent documents or data

Use the PRE-ANALYSIS HEURISTICS section as structured evidence — these are
programmatically detected signals, not guesses. Weight them heavily in your analysis.

For each issue found, provide:
- A clear title
- Severity (low/medium/high/critical)
- Detailed description with specific evidence
- Actionable recommendation

Respond in this JSON format:
{
    "analysis": "Detailed narrative analysis of the hallucination root causes",
    "findings": [
        {
            "title": "Finding title",
            "severity": "high",
            "description": "What went wrong and why",
            "evidence": ["specific data points"],
            "recommendation": "What to fix"
        }
    ],
    "root_cause": "One precise sentence: the specific gap (missing sources, weak retrieval scores, or absent grounding) + the measurable signal confirming it + the specific fabricated claim or unsupported assertion that resulted"
}
"""


# ── Content-based heuristic checks ──────────────────────────────────────────

GROUNDING_PHRASES = (
    "based on the documents", "according to the sources",
    "the retrieved context shows", "as stated in the",
    "the documentation says", "per the knowledge base",
    "the records show", "as documented in",
    "based on the provided", "according to our records",
)

HEDGING_PHRASES = (
    "i'm not sure", "i don't have", "i cannot find",
    "there is no information", "not available in",
    "i don't have enough", "unable to confirm",
)


def _detect_grounding_without_sources(prompt: str, response: str, source_docs: list[str]) -> dict | None:
    """Detect when the LLM claims to reference sources but none were provided."""
    response_lower = response.lower()
    matched = [p for p in GROUNDING_PHRASES if p in response_lower]
    if matched and not source_docs:
        return {
            "signal": "grounding_without_sources",
            "severity": "high",
            "detail": f"Response uses {len(matched)} grounding phrase(s) ({', '.join(repr(m) for m in matched[:3])}) "
                      f"but no source documents were provided to the LLM.",
        }
    return None


def _detect_fabricated_specifics(response: str, source_docs: list[str]) -> dict | None:
    """Detect highly specific claims (numbers, dates, policies) without source backing."""
    # Match patterns like: "90 days", "$500", "24 hours", "15%", "version 3.2"
    specific_claims = re.findall(
        r'(?:(?:\$[\d,]+(?:\.\d{2})?)|'          # Dollar amounts
        r'(?:\d+(?:\.\d+)?%)|'                     # Percentages
        r'(?:\d+\s*(?:days?|hours?|minutes?|weeks?|months?|years?))|'  # Durations
        r'(?:version\s*\d+(?:\.\d+)*)|'            # Version numbers
        r'(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}))',     # Dates
        response, re.IGNORECASE
    )
    if specific_claims and not source_docs:
        return {
            "signal": "specific_claims_without_sources",
            "severity": "medium",
            "detail": f"Response contains {len(specific_claims)} specific claim(s) "
                      f"({', '.join(repr(c) for c in specific_claims[:5])}) "
                      f"but no source documents back them.",
        }
    return None


def _detect_response_context_ratio(response: str, retrieval_events: list) -> dict | None:
    """Detect when response is much longer than retrieved context (likely padded with hallucinations)."""
    total_retrieved_chars = sum(
        len(evt.query) * evt.chunks_returned  # Rough proxy for retrieved content length
        for evt in retrieval_events
    )
    response_len = len(response)

    if total_retrieved_chars == 0 and response_len > 200:
        return {
            "signal": "verbose_response_no_context",
            "severity": "high",
            "detail": f"Response is {response_len} chars but no retrieval context was available. "
                      f"Entire response may be ungrounded.",
        }
    elif total_retrieved_chars > 0 and response_len > total_retrieved_chars * 3:
        ratio = response_len / max(total_retrieved_chars, 1)
        return {
            "signal": "response_exceeds_context",
            "severity": "medium",
            "detail": f"Response ({response_len} chars) is {ratio:.1f}x longer than estimated "
                      f"retrieved context ({total_retrieved_chars} chars). Excess content may be hallucinated.",
        }
    return None


def _detect_contradictory_hedging(response: str) -> dict | None:
    """Detect when response both asserts facts AND hedges (mixed confidence = unreliable)."""
    response_lower = response.lower()
    has_grounding = any(p in response_lower for p in GROUNDING_PHRASES)
    has_hedging = any(p in response_lower for p in HEDGING_PHRASES)

    if has_grounding and has_hedging:
        return {
            "signal": "contradictory_confidence",
            "severity": "medium",
            "detail": "Response both claims source grounding AND hedges with uncertainty. "
                      "This mixed confidence pattern often indicates partial hallucination.",
        }
    return None


def _run_heuristics(session) -> list[dict]:
    """Run all content-based heuristic checks on the session."""
    signals: list[dict] = []

    for lc in session.llm_calls:
        checks = [
            _detect_grounding_without_sources(lc.prompt, lc.response, lc.source_documents),
            _detect_fabricated_specifics(lc.response, lc.source_documents),
            _detect_response_context_ratio(lc.response, session.retrieval_events),
            _detect_contradictory_hedging(lc.response),
        ]
        signals.extend(c for c in checks if c is not None)

    return signals


# ── Context builder ─────────────────────────────────────────────────────────

def _build_hallucination_context(state: AgentState) -> str:
    """Build context string focused on LLM calls and source grounding."""
    session = ensure_session(state["session"])
    parts = [
        f"Session: {session.session_id}",
        f"Failure summary: {session.failure_summary or 'N/A'}",
    ]

    # Run pre-analysis heuristics
    heuristic_signals = _run_heuristics(session)
    if heuristic_signals:
        parts.append("\n=== PRE-ANALYSIS HEURISTICS (programmatic checks) ===")
        for i, sig in enumerate(heuristic_signals, 1):
            parts.append(
                f"\n  Signal #{i}: {sig['signal']}\n"
                f"  Severity: {sig['severity']}\n"
                f"  Detail: {sig['detail']}"
            )
    else:
        parts.append("\n=== PRE-ANALYSIS HEURISTICS ===\n  No programmatic signals detected.")

    if session.llm_calls:
        parts.append("\n=== LLM Calls ===")
        for i, lc in enumerate(session.llm_calls, 1):
            sources = ", ".join(lc.source_documents) or "none"
            parts.append(
                f"\n#{i} Model: {lc.model}\n"
                f"  Hallucination flagged: {lc.hallucination_flag}\n"
                f"  Source documents: [{sources}]\n"
                f"  Prompt (truncated): {lc.prompt[:300]}\n"
                f"  Response (truncated): {lc.response[:500]}"
            )

    # Cross-session evidence first — primes the LLM to look for patterns
    # before reading this session's own trace data.
    evidence = state.get("reranked_evidence", [])
    if evidence:
        parts.append("\n=== Cross-Session Evidence (reranked) ===")
        for item in evidence:
            parts.append(f"[score={item['relevance_score']:.3f}] {item['text']}")
    else:
        parts.append("\n=== Cross-Session Evidence ===\n  None retrieved.")

    if session.retrieval_events:
        parts.append("\n=== Retrieval Context ===")
        for evt in session.retrieval_events:
            scores = ", ".join(f"{s:.3f}" for s in evt.relevance_scores)
            parts.append(
                f"  Query: {evt.query[:200]}\n"
                f"  Actual docs: {evt.actual_doc_ids}\n"
                f"  Chunks returned: {evt.chunks_returned}\n"
                f"  Scores: [{scores}]"
            )

    return "\n".join(parts)


# ── Node function ───────────────────────────────────────────────────────────

async def hallucination_rca(state: AgentState) -> dict:
    """Analyze hallucination root causes using GPT-4o-mini.

    Runs content-based heuristic checks first, then passes structured signals
    alongside trace data to the LLM for comprehensive analysis.
    """
    llm = get_openai_llm(temperature=0, max_tokens=1500)

    context = _build_hallucination_context(state)

    response = await llm.ainvoke([
        {"role": "system", "content": HALLUCINATION_RCA_PROMPT},
        {"role": "user", "content": context},
    ])

    raw = response.content if hasattr(response, "content") else str(response)
    from app.agents.nodes.diagnostic_utils import parse_diagnostic_output
    validated = parse_diagnostic_output(raw, "hallucination_rca")

    logger.info("hallucination_rca_complete", session_id=state["session"].session_id,
                findings_count=len(validated["findings"]))
    return {"analysis": raw, "_validated": validated}
