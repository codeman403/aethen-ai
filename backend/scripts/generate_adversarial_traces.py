"""Generate adversarial/ambiguous AI agent trace data for testing.

Unlike generate_traces.py (which pre-labels and plants obvious signals),
these traces test the classifier and diagnostic nodes with:
- No pre-set failure_type labels (classifier must infer from evidence)
- Mixed signals across failure categories
- Edge cases and ambiguous scenarios
- Realistic "messy" data that mirrors live Langfuse traces

Usage:
    poetry run python scripts/generate_adversarial_traces.py [--count 15] [--output adversarial_traces.json]
"""

import argparse
import json
import random
import uuid
from datetime import UTC, datetime, timedelta

AGENTS = ["support-agent-v2", "research-agent-v1", "code-review-agent-v3"]
MODELS = ["claude-3.5-sonnet", "gpt-4o-mini", "claude-3-haiku"]


def _ts(offset_hours: int = 0) -> str:
    return (datetime.now(UTC) - timedelta(hours=offset_hours)).isoformat()


def _id() -> str:
    return str(uuid.uuid4())[:8]


# ── Ambiguous traces: mixed signals, no pre-set labels ──────────────────────


def hallucination_from_bad_retrieval() -> dict:
    """Retrieval returns low-quality chunks → LLM hallucinates to fill gaps.

    Ambiguous: Is this a memory failure (bad retrieval) or hallucination (fabricated response)?
    Expected: classifier should identify hallucination as PRIMARY because the response
    fabricates facts not in any source, even if retrieval was also poor.
    """
    docs = [f"doc-{_id()}" for _ in range(2)]
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "failure",
        "failure_type": None,  # No label — classifier must infer
        "failure_summary": None,  # No hint
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "What is the company's data retention policy for EU customers?",
                "response": "Based on the documents, EU customer data is retained for exactly "
                            "36 months per GDPR Article 17 requirements. After this period, "
                            "all personal data is automatically purged from our systems. "
                            "The quarterly compliance audit verifies this process.",
                "tokens_in": 350,
                "tokens_out": 280,
                "latency_ms": 1800.0,
                "hallucination_flag": False,
                "source_documents": [],
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"ret-{_id()}",
                "query": "data retention policy EU customers GDPR",
                "namespace": "product-docs",
                "chunks_returned": 2,
                "relevance_scores": [0.35, 0.22],
                "expected_doc_ids": [],
                "actual_doc_ids": docs,
                "metadata_filters": {},
            }
        ],
        "metadata": {"_expected_primary": "hallucination", "_ambiguous_with": "memory"},
    }


def tool_failure_causes_hallucination() -> dict:
    """Tool call fails → LLM fabricates response instead of reporting error.

    Ambiguous: Is this a tool_misfire or hallucination?
    Expected: tool_misfire is PRIMARY (root cause), hallucination is secondary effect.
    """
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "failure",
        "failure_type": None,
        "failure_summary": None,
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "Look up the user's subscription status and billing history",
                "response": "The user's subscription is active on the Pro plan at $49/month. "
                            "Their last payment was processed on March 15, 2025. "
                            "No outstanding invoices found.",
                "tokens_in": 200,
                "tokens_out": 180,
                "latency_ms": 1200.0,
                "hallucination_flag": False,
                "source_documents": [],
            }
        ],
        "tool_calls": [
            {
                "call_id": f"tool-{_id()}",
                "tool_name": "query_database",
                "parameters": {"query": "SELECT * FROM subscriptions WHERE user_id = ?", "user_id": "usr-123"},
                "result": None,
                "error": "ConnectionError: database connection pool exhausted",
                "status": "failed",
                "latency_ms": 5200.0,
            }
        ],
        "retrieval_events": [],
        "metadata": {"_expected_primary": "tool_misfire", "_ambiguous_with": "hallucination"},
    }


def blind_spot_with_low_relevance() -> dict:
    """Retrieval returns chunks but all are irrelevant (low scores).

    Ambiguous: Is this a blind_spot (topic not in KB) or memory (bad retrieval)?
    Expected: blind_spot — the system returned content but none of it addresses the query.
    """
    docs = [f"doc-{_id()}" for _ in range(3)]
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "failure",
        "failure_type": None,
        "failure_summary": None,
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "How do I configure multi-region failover for our Kubernetes clusters?",
                "response": "I don't have specific information about multi-region failover "
                            "configuration in our knowledge base. I can see some general "
                            "Kubernetes documentation but nothing specific to failover setup.",
                "tokens_in": 250,
                "tokens_out": 120,
                "latency_ms": 900.0,
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"ret-{_id()}",
                "query": "multi-region failover Kubernetes configuration",
                "namespace": "engineering-wiki",
                "chunks_returned": 3,
                "relevance_scores": [0.28, 0.19, 0.12],
                "expected_doc_ids": [],
                "actual_doc_ids": docs,
                "metadata_filters": {},
            }
        ],
        "metadata": {"_expected_primary": "blind_spot", "_ambiguous_with": "memory"},
    }


def cascading_multi_tool_failure() -> dict:
    """Multiple tools fail in sequence — first failure causes downstream failures.

    Not ambiguous but tests multi-signal: classifier should still pick tool_misfire
    and diagnostic should identify the cascade pattern.
    """
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "failure",
        "failure_type": None,
        "failure_summary": None,
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "Create a support ticket and send confirmation email to the customer",
                "response": "I attempted to create the ticket and send the email but "
                            "encountered errors with both operations.",
                "tokens_in": 180,
                "tokens_out": 90,
                "latency_ms": 800.0,
            }
        ],
        "tool_calls": [
            {
                "call_id": f"tool-{_id()}",
                "tool_name": "create_ticket",
                "parameters": {"subject": "Billing issue", "priority": "high"},
                "result": None,
                "error": "ConnectionError: ticketing service unavailable",
                "status": "failed",
                "latency_ms": 8500.0,
            },
            {
                "call_id": f"tool-{_id()}",
                "tool_name": "send_email",
                "parameters": {"to": "user@example.com", "template": "ticket_confirmation"},
                "result": None,
                "error": "ValueError: ticket_id is required but was None (upstream create_ticket failed)",
                "status": "failed",
                "latency_ms": 50.0,
            },
        ],
        "retrieval_events": [],
        "metadata": {"_expected_primary": "tool_misfire"},
    }


def mislabeled_memory_actually_hallucination() -> dict:
    """Pre-labeled as memory failure but the actual evidence shows hallucination.

    Tests that the classifier ignores the pre-set label and classifies from evidence.
    Retrieval was fine (good scores, correct docs), but LLM fabricated response.
    """
    docs = [f"doc-{_id()}" for _ in range(2)]
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "failure",
        "failure_type": "memory",  # WRONG label — should be hallucination
        "failure_summary": "Retrieval failure for refund policy query",
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "What is our refund policy?",
                "response": "According to our records, we offer a 180-day money-back guarantee "
                            "on all products with no questions asked. Premium customers receive "
                            "a full year of refund eligibility. The automated refund system "
                            "processes requests within 2 business hours.",
                "tokens_in": 300,
                "tokens_out": 250,
                "latency_ms": 1500.0,
                "hallucination_flag": False,
                "source_documents": docs,
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"ret-{_id()}",
                "query": "refund policy",
                "namespace": "support-docs",
                "chunks_returned": 2,
                "relevance_scores": [0.94, 0.87],
                "expected_doc_ids": docs,
                "actual_doc_ids": docs,
                "metadata_filters": {},
            }
        ],
        "metadata": {
            "_expected_primary": "hallucination",
            "_note": "Label says memory but evidence shows good retrieval + fabricated response",
        },
    }


def success_with_noisy_signals() -> dict:
    """Actually a successful session but with some noisy signals.

    One tool had high latency (but succeeded). Retrieval scores are mediocre.
    Tests that the classifier doesn't over-trigger on noise.
    Expected: outcome=success, no failure_type.
    """
    docs = [f"doc-{_id()}" for _ in range(2)]
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "success",
        "failure_type": None,
        "failure_summary": None,
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "How do I reset my password?",
                "response": "To reset your password, go to Settings > Security > Reset Password. "
                            "You'll receive a confirmation email within 5 minutes.",
                "tokens_in": 150,
                "tokens_out": 80,
                "latency_ms": 700.0,
                "source_documents": docs,
            }
        ],
        "tool_calls": [
            {
                "call_id": f"tool-{_id()}",
                "tool_name": "search_knowledge_base",
                "parameters": {"query": "password reset", "top_k": 5},
                "result": "Found 2 relevant documents",
                "status": "success",
                "latency_ms": 4800.0,  # Slow but succeeded
            }
        ],
        "retrieval_events": [
            {
                "event_id": f"ret-{_id()}",
                "query": "password reset",
                "namespace": "support-docs",
                "chunks_returned": 2,
                "relevance_scores": [0.72, 0.58],
                "expected_doc_ids": docs,
                "actual_doc_ids": docs,
            }
        ],
        "metadata": {"_expected_primary": None, "_note": "Noisy signals but actually successful"},
    }


def empty_trace_minimal_signals() -> dict:
    """Trace with minimal data — no retrieval, no tools, just one LLM call.

    Tests graceful handling when diagnostic nodes receive sparse data.
    Common pattern for simple chat interactions captured in Langfuse.
    """
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "failure",
        "failure_type": None,
        "failure_summary": None,
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "Explain quantum computing applications in healthcare",
                "response": "Quantum computing has several promising applications in healthcare...",
                "tokens_in": 120,
                "tokens_out": 400,
                "latency_ms": 2200.0,
            }
        ],
        "tool_calls": [],
        "retrieval_events": [],
        "metadata": {
            "_expected_primary": "unknown",
            "_note": "Minimal data — system should handle gracefully or classify as unknown",
        },
    }


def stale_embeddings_correct_docs() -> dict:
    """Correct documents retrieved but with outdated content (stale embeddings).

    The doc IDs match but relevance scores are middling because the embeddings
    are from an older version of the documents.
    Expected: memory failure (stale embeddings).
    """
    docs = [f"doc-{_id()}" for _ in range(2)]
    return {
        "session_id": f"adv-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 48)),
        "outcome": "failure",
        "failure_type": None,
        "failure_summary": None,
        "llm_calls": [
            {
                "call_id": f"llm-{_id()}",
                "model": random.choice(MODELS),
                "prompt": "What are the current API rate limits for the enterprise plan?",
                "response": "Based on the retrieved documents, the enterprise plan allows "
                            "1000 requests per minute. However, I notice the documentation "
                            "may be outdated as it references API v2 while we're now on v3.",
                "tokens_in": 280,
                "tokens_out": 190,
                "latency_ms": 1100.0,
                "source_documents": docs,
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"ret-{_id()}",
                "query": "API rate limits enterprise plan",
                "namespace": "product-docs",
                "chunks_returned": 2,
                "relevance_scores": [0.61, 0.48],
                "expected_doc_ids": docs,
                "actual_doc_ids": docs,
                "metadata_filters": {"version": "v2"},
            }
        ],
        "metadata": {
            "_expected_primary": "memory",
            "_note": "Correct docs but stale — middling scores, outdated version filter",
        },
    }


# ── Generator ───────────────────────────────────────────────────────────────

GENERATORS = [
    hallucination_from_bad_retrieval,
    tool_failure_causes_hallucination,
    blind_spot_with_low_relevance,
    cascading_multi_tool_failure,
    mislabeled_memory_actually_hallucination,
    success_with_noisy_signals,
    empty_trace_minimal_signals,
    stale_embeddings_correct_docs,
]


def generate_adversarial_traces(count: int = 15) -> list[dict]:
    """Generate adversarial traces cycling through all scenarios."""
    sessions = []
    for i in range(count):
        gen = GENERATORS[i % len(GENERATORS)]
        sessions.append(gen())
    random.shuffle(sessions)
    return sessions


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate adversarial AI agent traces")
    parser.add_argument("--count", type=int, default=15, help="Number of sessions to generate")
    parser.add_argument("--output", type=str, default="adversarial_traces.json", help="Output file path")
    args = parser.parse_args()

    sessions = generate_adversarial_traces(args.count)
    payload = {"sessions": sessions}

    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    # Summary
    print(f"Generated {len(sessions)} adversarial sessions → {args.output}")
    print("\nScenarios included:")
    for gen in GENERATORS:
        print(f"  • {gen.__name__}: {gen.__doc__.strip().splitlines()[0]}")

    expected = {}
    for s in sessions:
        exp = (s.get("metadata") or {}).get("_expected_primary", "unset")
        expected[str(exp)] = expected.get(str(exp), 0) + 1
    print(f"\nExpected primary classifications:")
    for t, c in sorted(expected.items()):
        print(f"  {t}: {c}")


if __name__ == "__main__":
    main()
