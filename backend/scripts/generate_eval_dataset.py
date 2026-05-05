"""Generate the golden eval dataset for Aethen pipeline evaluation.

Creates 100 sessions with explicit ground-truth labels:
  - 25 memory failures
  - 25 tool_misfire failures
  - 25 hallucination failures
  - 25 blind_spot failures

Each session includes `metadata._ground_truth` with:
  - failure_type: correct classification label
  - root_cause_keywords: expected keywords in AnalysisReport.root_cause
  - min_confidence: minimum acceptable confidence score

Sessions are spread across three difficulty tiers per type:
  - obvious (15): strong, unambiguous signals
  - borderline (7): mixed signals, weaker evidence
  - adversarial (3): misleading pre-labels or noisy data

Usage:
    poetry run python scripts/generate_eval_dataset.py [--output data/eval_dataset.json]
"""

import argparse
import json
import random
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

AGENTS = ["support-agent-v2", "research-agent-v1", "code-review-agent-v3"]
MODELS = ["claude-sonnet-4-6", "gpt-4o-mini", "gpt-4.1-mini"]
NAMESPACES = ["support-docs", "product-docs", "engineering-wiki", "customer-data"]


def _ts(offset_hours: int = 0) -> str:
    return (datetime.now(UTC) - timedelta(hours=offset_hours)).isoformat()


def _id() -> str:
    return str(uuid.uuid4())[:8]


def _docs(n: int = 2) -> list[str]:
    return [f"doc-{_id()}" for _ in range(n)]


# ── Memory Failures (25) ─────────────────────────────────────────────────────

def _memory_obvious(i: int) -> dict:
    """Strong memory signal: expected docs differ from actual, low scores."""
    expected = _docs(2)
    actual = _docs(3)
    return {
        "session_id": f"eval-mem-{i:03d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "memory",
        "failure_summary": f"Wrong documents retrieved for query #{i}",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": f"Answer based on context: How do I {random.choice(['reset my password', 'cancel my subscription', 'export my data', 'update billing info'])}?",
            "response": "Based on the retrieved documents, the process involves navigating to settings and following the on-screen instructions.",
            "tokens_in": random.randint(200, 400),
            "tokens_out": random.randint(100, 200),
            "latency_ms": round(random.uniform(800, 2000), 1),
            "hallucination_flag": False,
            "source_documents": actual,
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": f"help query {i}",
            "namespace": random.choice(NAMESPACES),
            "chunks_returned": 3,
            "relevance_scores": [round(random.uniform(0.2, 0.48), 2), round(random.uniform(0.15, 0.38), 2), round(random.uniform(0.1, 0.25), 2)],
            "expected_doc_ids": expected,
            "actual_doc_ids": actual,
            "doc_content": ["Unrelated document content about different topics.", "Another irrelevant document.", "Third irrelevant document."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "memory",
                "root_cause_keywords": ["wrong document", "retrieval", "mismatch", "stale", "incorrect"],
                "min_confidence": 0.6,
            },
            "_tier": "obvious",
        },
    }


def _memory_borderline(i: int) -> dict:
    """Borderline memory: partial doc overlap, middling scores."""
    shared = _docs(1)
    expected = shared + _docs(1)
    actual = shared + _docs(2)
    return {
        "session_id": f"eval-mem-b{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "memory",
        "failure_summary": "Partially correct retrieval — one expected doc missing",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "What are the current API rate limits for enterprise customers?",
            "response": "Based on available docs, rate limits vary by plan tier. Enterprise details may be outdated.",
            "tokens_in": 280,
            "tokens_out": 150,
            "latency_ms": round(random.uniform(900, 1800), 1),
            "hallucination_flag": False,
            "source_documents": actual,
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": "API rate limits enterprise plan",
            "namespace": "product-docs",
            "chunks_returned": 3,
            "relevance_scores": [0.61, 0.52, 0.38],
            "expected_doc_ids": expected,
            "actual_doc_ids": actual,
            "doc_content": ["Rate limits documentation (partial match).", "General API docs.", "Unrelated billing doc."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "memory",
                "root_cause_keywords": ["retrieval", "wrong", "stale", "mismatch", "outdated"],
                "min_confidence": 0.5,
            },
            "_tier": "borderline",
        },
    }


def _memory_adversarial(i: int) -> dict:
    """Adversarial memory: pre-labeled as hallucination but evidence shows retrieval failure."""
    expected = _docs(2)
    actual = _docs(3)
    return {
        "session_id": f"eval-mem-a{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "hallucination",  # WRONG pre-label — classifier must override
        "failure_summary": "Incorrect retrieval despite pre-labeling as hallucination",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "Explain the refund policy for premium users",
            "response": "Based on retrieved context, the standard 30-day policy applies.",
            "tokens_in": 220,
            "tokens_out": 100,
            "latency_ms": 950.0,
            "hallucination_flag": False,
            "source_documents": actual,
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": "refund policy premium users",
            "namespace": "support-docs",
            "chunks_returned": 3,
            "relevance_scores": [0.31, 0.24, 0.18],
            "expected_doc_ids": expected,
            "actual_doc_ids": actual,
            "doc_content": ["Shipping policy document.", "Returns FAQ (generic).", "Unrelated product doc."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "memory",
                "root_cause_keywords": ["retrieval", "wrong", "mismatch", "incorrect document"],
                "min_confidence": 0.55,
            },
            "_tier": "adversarial",
            "_note": "Pre-labeled hallucination but evidence is retrieval failure",
        },
    }


# ── Tool Misfire Failures (25) ───────────────────────────────────────────────

def _tool_obvious(i: int) -> dict:
    """Strong tool signal: multiple failed tool calls."""
    tool_names = ["query_database", "send_email", "create_ticket", "fetch_user_profile", "search_knowledge_base"]
    return {
        "session_id": f"eval-tool-{i:03d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "tool_misfire",
        "failure_summary": f"Tool call failed: {random.choice(tool_names)}",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "Look up the customer's subscription and process their cancellation request",
            "response": "I was unable to process the cancellation due to a system error.",
            "tokens_in": 180,
            "tokens_out": 80,
            "latency_ms": round(random.uniform(500, 1200), 1),
            "hallucination_flag": False,
            "source_documents": [],
        }],
        "tool_calls": [
            {
                "call_id": f"tool-{_id()}",
                "tool_name": random.choice(tool_names),
                "parameters": {"user_id": f"usr-{_id()}", "action": "cancel"},
                "result": None,
                "error": random.choice([
                    "ConnectionError: service unavailable",
                    "TimeoutError: request timed out after 30s",
                    "PermissionError: insufficient privileges",
                    "ValueError: required parameter missing",
                ]),
                "status": "failed",
                "latency_ms": round(random.uniform(5000, 12000), 1),
            }
        ],
        "retrieval_events": [],
        "metadata": {
            "_ground_truth": {
                "failure_type": "tool_misfire",
                "root_cause_keywords": ["tool", "failed", "error", "timeout", "connection", "permission"],
                "min_confidence": 0.65,
            },
            "_tier": "obvious",
        },
    }


def _tool_cascade(i: int) -> dict:
    """Cascading tool failure: first tool fails, downstream tools cascade."""
    return {
        "session_id": f"eval-tool-c{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "tool_misfire",
        "failure_summary": "Cascading tool failures — create_ticket failed, send_email cascade-failed",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "Create a support ticket and send confirmation to the user",
            "response": "Both operations failed due to upstream service errors.",
            "tokens_in": 200,
            "tokens_out": 90,
            "latency_ms": 800.0,
        }],
        "tool_calls": [
            {
                "call_id": f"tool-{_id()}",
                "tool_name": "create_ticket",
                "parameters": {"subject": "Billing inquiry", "priority": "high"},
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
                "error": "ValueError: ticket_id is required but was None (upstream failure)",
                "status": "failed",
                "latency_ms": 45.0,
            },
        ],
        "retrieval_events": [],
        "metadata": {
            "_ground_truth": {
                "failure_type": "tool_misfire",
                "root_cause_keywords": ["tool", "failed", "cascade", "error", "service unavailable"],
                "min_confidence": 0.7,
            },
            "_tier": "borderline",
        },
    }


def _tool_timeout(i: int) -> dict:
    """Tool timeout: slow external service, operation timed out."""
    return {
        "session_id": f"eval-tool-t{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "tool_misfire",
        "failure_summary": "Database query timed out after 30 seconds",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "Retrieve the last 90 days of transaction history for this account",
            "response": "I was unable to retrieve transaction history due to a timeout.",
            "tokens_in": 150,
            "tokens_out": 70,
            "latency_ms": 600.0,
        }],
        "tool_calls": [{
            "call_id": f"tool-{_id()}",
            "tool_name": "query_database",
            "parameters": {"query": "SELECT * FROM transactions WHERE account_id = ? AND date > ?", "days": 90},
            "result": None,
            "error": "TimeoutError: query execution exceeded 30s limit",
            "status": "timeout",
            "latency_ms": 30500.0,
        }],
        "retrieval_events": [],
        "metadata": {
            "_ground_truth": {
                "failure_type": "tool_misfire",
                "root_cause_keywords": ["timeout", "tool", "slow", "database", "exceeded"],
                "min_confidence": 0.65,
            },
            "_tier": "adversarial",
        },
    }


# ── Hallucination Failures (25) ──────────────────────────────────────────────

def _hallucination_obvious(i: int) -> dict:
    """Strong hallucination signal: flag set, fabricated facts, good retrieval."""
    docs = _docs(2)
    return {
        "session_id": f"eval-hall-{i:03d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "hallucination",
        "failure_summary": "LLM response contains fabricated facts not in source documents",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": random.choice([
                "What is our company's data retention policy for EU customers?",
                "What are the refund terms for enterprise contracts?",
                "Explain the SLA guarantees for the Pro tier.",
                "What is the cancellation procedure for annual subscriptions?",
            ]),
            "response": random.choice([
                "EU customer data is retained for exactly 36 months per GDPR Article 17. All data is auto-purged quarterly. Compliance audits verify this weekly.",
                "Enterprise contracts include a 180-day money-back guarantee with no questions asked. All refunds process within 2 business hours.",
                "Pro tier guarantees 99.99% uptime with $500 per-hour SLA credits and a dedicated 24/7 hotline.",
                "Annual subscriptions can be cancelled by calling our retention team at 1-800-CANCEL. Full refunds issued within 1 business day.",
            ]),
            "tokens_in": random.randint(250, 400),
            "tokens_out": random.randint(180, 300),
            "latency_ms": round(random.uniform(1200, 2500), 1),
            "hallucination_flag": True,
            "source_documents": docs,
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": "policy terms conditions",
            "namespace": random.choice(NAMESPACES),
            "chunks_returned": 2,
            "relevance_scores": [round(random.uniform(0.85, 0.96), 2), round(random.uniform(0.75, 0.88), 2)],
            "expected_doc_ids": docs,
            "actual_doc_ids": docs,
            "doc_content": ["Policy document with actual terms.", "Supporting policy reference."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "hallucination",
                "root_cause_keywords": ["hallucination", "fabricated", "not in source", "invented", "made up", "unsupported"],
                "min_confidence": 0.65,
            },
            "_tier": "obvious",
        },
    }


def _hallucination_from_bad_retrieval(i: int) -> dict:
    """Borderline: bad retrieval → LLM fills gaps with fabricated facts."""
    docs = _docs(2)
    return {
        "session_id": f"eval-hall-b{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "hallucination",
        "failure_summary": "LLM fabricated response after poor retrieval returned insufficient context",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "What is the company's data retention policy for EU customers?",
            "response": "Based on the documents, EU customer data is retained for exactly 36 months per GDPR Article 17 requirements. The quarterly compliance audit verifies this process.",
            "tokens_in": 350,
            "tokens_out": 280,
            "latency_ms": 1800.0,
            "hallucination_flag": False,  # Flag not set — ambiguous case
            "source_documents": [],
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": "data retention policy EU GDPR",
            "namespace": "product-docs",
            "chunks_returned": 2,
            "relevance_scores": [0.35, 0.22],
            "expected_doc_ids": [],
            "actual_doc_ids": docs,
            "doc_content": ["Unrelated privacy document.", "Generic compliance overview."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "hallucination",
                "root_cause_keywords": ["hallucination", "fabricated", "unsupported", "not grounded"],
                "min_confidence": 0.55,
            },
            "_tier": "borderline",
            "_ambiguous_with": "memory",
        },
    }


def _hallucination_adversarial(i: int) -> dict:
    """Adversarial: pre-labeled memory but good retrieval + fabricated response."""
    docs = _docs(2)
    return {
        "session_id": f"eval-hall-a{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "memory",  # WRONG pre-label
        "failure_summary": "Mislabeled as memory — retrieval was fine, LLM hallucinated",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "What is our refund policy?",
            "response": "We offer a 180-day money-back guarantee on all products with no questions asked. Premium customers receive a full year of refund eligibility. The automated system processes requests within 2 hours.",
            "tokens_in": 300,
            "tokens_out": 250,
            "latency_ms": 1500.0,
            "hallucination_flag": False,
            "source_documents": docs,
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": "refund policy",
            "namespace": "support-docs",
            "chunks_returned": 2,
            "relevance_scores": [0.94, 0.87],
            "expected_doc_ids": docs,
            "actual_doc_ids": docs,
            "doc_content": ["30-day return policy document.", "Standard refund terms."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "hallucination",
                "root_cause_keywords": ["hallucination", "fabricated", "invented", "not in source"],
                "min_confidence": 0.6,
            },
            "_tier": "adversarial",
            "_note": "Pre-labeled memory but retrieval scores are high — hallucination is the real failure",
        },
    }


# ── Blind Spot Failures (25) ─────────────────────────────────────────────────

def _blind_spot_obvious(i: int) -> dict:
    """Strong blind spot signal: zero chunks returned."""
    topics = [
        "multi-region failover configuration",
        "quantum-safe encryption migration",
        "HIPAA compliance for AI agents",
        "real-time bidding integration",
        "WebAssembly sandbox security",
        "carbon footprint API reporting",
        "satellite IoT device management",
    ]
    topic = random.choice(topics)
    return {
        "session_id": f"eval-blind-{i:03d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "blind_spot",
        "failure_summary": f"No relevant knowledge found for: {topic}",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": f"Help the user with: {topic}",
            "response": f"I don't have specific information about {topic} in my knowledge base. I cannot provide accurate guidance on this topic.",
            "tokens_in": random.randint(100, 200),
            "tokens_out": random.randint(50, 120),
            "latency_ms": round(random.uniform(400, 900), 1),
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": topic,
            "namespace": "engineering-wiki",
            "chunks_returned": 0,
            "relevance_scores": [],
            "expected_doc_ids": [],
            "actual_doc_ids": [],
            "doc_content": [],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "blind_spot",
                "root_cause_keywords": ["knowledge base", "not covered", "lacks coverage", "no content", "no document"],
                "min_confidence": 0.6,
            },
            "_tier": "obvious",
        },
    }


def _blind_spot_low_relevance(i: int) -> dict:
    """Borderline blind spot: chunks returned but all irrelevant (low scores)."""
    docs = _docs(3)
    return {
        "session_id": f"eval-blind-b{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "blind_spot",
        "failure_summary": "Retrieved documents but none address the query topic",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "How do I configure multi-region failover for Kubernetes clusters?",
            "response": "I can see some general Kubernetes documentation but nothing specific to multi-region failover configuration. This topic doesn't appear to be covered in our knowledge base.",
            "tokens_in": 250,
            "tokens_out": 120,
            "latency_ms": 900.0,
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": "multi-region failover Kubernetes",
            "namespace": "engineering-wiki",
            "chunks_returned": 3,
            "relevance_scores": [0.28, 0.19, 0.12],
            "expected_doc_ids": [],
            "actual_doc_ids": docs,
            "doc_content": ["General Kubernetes intro docs.", "Container orchestration basics.", "Single-region deployment guide."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "blind_spot",
                "root_cause_keywords": ["knowledge gap", "irrelevant", "not covered", "missing topic", "low relevance"],
                "min_confidence": 0.5,
            },
            "_tier": "borderline",
            "_ambiguous_with": "memory",
        },
    }


def _blind_spot_adversarial(i: int) -> dict:
    """Adversarial blind spot: pre-labeled memory but truly a gap topic."""
    docs = _docs(2)
    return {
        "session_id": f"eval-blind-a{i:02d}-{_id()}",
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 72)),
        "outcome": "failure",
        "failure_type": "memory",  # WRONG pre-label
        "failure_summary": "Retrieval failure — mislabeled as memory but topic is absent from KB",
        "trace_source": "synthetic",
        "llm_calls": [{
            "call_id": f"llm-{_id()}",
            "model": random.choice(MODELS),
            "prompt": "What is the procedure for GDPR right-to-erasure requests from enterprise clients?",
            "response": "I don't have specific procedures for enterprise GDPR erasure requests in our documentation.",
            "tokens_in": 200,
            "tokens_out": 90,
            "latency_ms": 700.0,
        }],
        "tool_calls": [],
        "retrieval_events": [{
            "event_id": f"ret-{_id()}",
            "query": "GDPR right to erasure enterprise",
            "namespace": "support-docs",
            "chunks_returned": 2,
            "relevance_scores": [0.24, 0.17],
            "expected_doc_ids": [],
            "actual_doc_ids": docs,
            "doc_content": ["General GDPR overview.", "Data privacy FAQ (consumer)."],
            "metadata_filters": {},
        }],
        "metadata": {
            "_ground_truth": {
                "failure_type": "blind_spot",
                "root_cause_keywords": ["knowledge gap", "not in knowledge base", "missing", "not covered"],
                "min_confidence": 0.5,
            },
            "_tier": "adversarial",
            "_note": "Pre-labeled memory but this is a genuine topic gap in the KB",
        },
    }


# ── Dataset assembly ─────────────────────────────────────────────────────────

def generate_eval_dataset() -> list[dict]:
    """Generate 100 golden sessions: 25 per failure type, three difficulty tiers."""
    sessions: list[dict] = []

    # Memory (25): 15 obvious + 7 borderline + 3 adversarial
    for i in range(15):
        sessions.append(_memory_obvious(i + 1))
    for i in range(7):
        sessions.append(_memory_borderline(i + 1))
    for i in range(3):
        sessions.append(_memory_adversarial(i + 1))

    # Tool misfire (25): 15 obvious + 7 cascade/borderline + 3 timeout/adversarial
    for i in range(15):
        sessions.append(_tool_obvious(i + 1))
    for i in range(7):
        sessions.append(_tool_cascade(i + 1))
    for i in range(3):
        sessions.append(_tool_timeout(i + 1))

    # Hallucination (25): 15 obvious + 7 borderline + 3 adversarial
    for i in range(15):
        sessions.append(_hallucination_obvious(i + 1))
    for i in range(7):
        sessions.append(_hallucination_from_bad_retrieval(i + 1))
    for i in range(3):
        sessions.append(_hallucination_adversarial(i + 1))

    # Blind spot (25): 15 obvious + 7 borderline + 3 adversarial
    for i in range(15):
        sessions.append(_blind_spot_obvious(i + 1))
    for i in range(7):
        sessions.append(_blind_spot_low_relevance(i + 1))
    for i in range(3):
        sessions.append(_blind_spot_adversarial(i + 1))

    random.shuffle(sessions)
    return sessions


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Aethen golden eval dataset")
    parser.add_argument("--output", default="data/eval_dataset.json", help="Output JSON path")
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sessions = generate_eval_dataset()

    # Tally per type and tier
    by_type: dict[str, int] = {}
    by_tier: dict[str, int] = {}
    for s in sessions:
        gt = (s.get("metadata") or {}).get("_ground_truth", {})
        ft = gt.get("failure_type", "unknown")
        tier = (s.get("metadata") or {}).get("_tier", "unknown")
        by_type[ft] = by_type.get(ft, 0) + 1
        by_tier[tier] = by_tier.get(tier, 0) + 1

    output_path.write_text(json.dumps({"sessions": sessions}, indent=2, default=str))

    print(f"Generated {len(sessions)} golden sessions → {output_path}")
    print("\nBy failure type:")
    for ft, count in sorted(by_type.items()):
        print(f"  {ft}: {count}")
    print("\nBy difficulty tier:")
    for tier, count in sorted(by_tier.items()):
        print(f"  {tier}: {count}")


if __name__ == "__main__":
    main()
