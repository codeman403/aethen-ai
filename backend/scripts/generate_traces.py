"""Generate synthetic AI agent trace data for testing.

Produces realistic test sessions covering the 4 failure types:
- Memory failures: wrong chunks, stale embeddings, metadata mismatches
- Tool misfires: wrong params, permission errors, timeouts
- Hallucinations: responses contradicting source documents
- Blind spots: recurring knowledge gaps across sessions

Usage:
    poetry run python scripts/generate_traces.py [--count 20] [--output traces.json]
"""

import argparse
import json
import random
import uuid
from datetime import UTC, datetime, timedelta

# --- Templates ---

AGENTS = ["support-agent-v2", "research-agent-v1", "code-review-agent-v3"]

# Current model names matching the proxy-confirmed models
MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5", "gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"]

TOOLS = ["search_knowledge_base", "query_database", "send_email", "create_ticket", "run_code"]
NAMESPACES = ["support-docs", "product-docs", "engineering-wiki", "customer-data"]

MEMORY_QUERIES = [
    "How to reset billing password",
    "Refund policy for enterprise plans",
    "API rate limits for free tier",
    "Database migration steps for v3",
    "How to configure SSO with SAML",
]

HALLUCINATION_PROMPTS = [
    "Summarize the refund policy",
    "What are the API rate limits?",
    "Explain the SSO setup process",
    "Describe the database backup procedure",
]

TOOL_ERRORS = [
    {"error": "PermissionError: insufficient scope for send_email", "status": "failed"},
    {"error": "TimeoutError: query_database exceeded 30s limit", "status": "timeout"},
    {"error": "ValueError: invalid parameter 'top_k' must be > 0", "status": "failed"},
    {"error": "ConnectionError: create_ticket service unavailable", "status": "failed"},
]

# Sample doc content snippets for retrieval events
DOC_SNIPPETS = [
    "Billing passwords can be reset via the account settings page under Security. Navigate to Settings > Security > Reset Password.",
    "Enterprise refunds are processed within 5-7 business days. Requests must be submitted through the billing portal.",
    "Free tier API limits: 100 requests/minute, 10,000 requests/day. Rate limiting uses a sliding window algorithm.",
    "Database migration from v2 to v3 requires running the provided migration script with --dry-run first to validate.",
    "SSO with SAML 2.0 requires configuring the identity provider metadata URL in your organization settings.",
    "The refund policy covers purchases made within 30 days. Enterprise plans have a 60-day refund window.",
    "OAuth 2.0 tokens expire after 1 hour. Refresh tokens are valid for 30 days and can be used once.",
    "Webhook endpoints must respond with HTTP 200 within 5 seconds or the delivery will be retried.",
]


def _ts(offset_hours: int = 0) -> str:
    """Generate ISO timestamp with optional hour offset (spread over last 7 days)."""
    return (datetime.now(UTC) - timedelta(hours=offset_hours)).isoformat()


def _id() -> str:
    return str(uuid.uuid4())


def generate_memory_failure() -> dict:
    """Session where retrieval returned wrong/stale chunks."""
    session_id = f"mem-{_id()}"
    query = random.choice(MEMORY_QUERIES)
    expected = [f"doc-{uuid.uuid4().hex[:8]}" for _ in range(2)]
    actual   = [f"doc-{uuid.uuid4().hex[:8]}" for _ in range(3)]  # Different docs — mismatch
    scores   = sorted([random.uniform(0.1, 0.48) for _ in actual], reverse=True)  # Low scores = wrong docs
    snippets = random.sample(DOC_SNIPPETS, min(3, len(DOC_SNIPPETS)))

    return {
        "session_id": session_id,
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 720)),
        "outcome": "failure",
        "failure_type": "memory",
        "failure_summary": f"Retrieved stale/wrong chunks for query: {query}",
        "trace_source": "synthetic",
        "llm_calls": [
            {
                "call_id": f"llm-{uuid.uuid4().hex[:8]}",
                "model": random.choice(MODELS),
                "prompt": f"Answer based on context: {query}",
                "response": "Based on the retrieved documents, the process involves...",
                "tokens_in": random.randint(100, 500),
                "tokens_out": random.randint(50, 300),
                "latency_ms": random.uniform(500, 3000),
                "hallucination_flag": False,
                "source_documents": actual,
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"ret-{uuid.uuid4().hex[:8]}",
                "query": query,
                "namespace": random.choice(NAMESPACES),
                "chunks_returned": len(actual),
                "relevance_scores": scores,
                "metadata_filters": {"category": "support"},
                "expected_doc_ids": expected,
                "actual_doc_ids": actual,
                "doc_content": snippets,
            }
        ],
        "metadata": {"trigger": "user_query", "retry_count": 0},
    }


def generate_tool_misfire() -> dict:
    """Session where a tool call failed."""
    session_id = f"tool-{_id()}"
    tool       = random.choice(TOOLS)
    error_info = random.choice(TOOL_ERRORS)

    return {
        "session_id": session_id,
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 720)),
        "outcome": "failure",
        "failure_type": "tool_misfire",
        "failure_summary": f"Tool '{tool}' failed: {error_info['error']}",
        "trace_source": "synthetic",
        "llm_calls": [
            {
                "call_id": f"llm-{uuid.uuid4().hex[:8]}",
                "model": random.choice(MODELS),
                "prompt": f"Use {tool} to complete the task",
                "response": f"I'll use {tool} with the following parameters...",
                "tokens_in": random.randint(100, 400),
                "tokens_out": random.randint(50, 200),
                "latency_ms": random.uniform(300, 2000),
            }
        ],
        "tool_calls": [
            {
                "call_id": f"tool-{uuid.uuid4().hex[:8]}",
                "tool_name": tool,
                "parameters": {"query": "test", "top_k": random.choice([5, -1, 0])},
                "result": None,
                "error": error_info["error"],
                "status": error_info["status"],
                "latency_ms": random.uniform(100, 30000),
            }
        ],
        "retrieval_events": [],
        "metadata": {"trigger": "automated_workflow"},
    }


def generate_hallucination() -> dict:
    """Session where the LLM hallucinated (response contradicts sources)."""
    session_id  = f"hal-{_id()}"
    prompt      = random.choice(HALLUCINATION_PROMPTS)
    source_docs = [f"doc-{uuid.uuid4().hex[:8]}" for _ in range(2)]
    snippets    = random.sample(DOC_SNIPPETS, min(2, len(DOC_SNIPPETS)))

    return {
        "session_id": session_id,
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 720)),
        "outcome": "failure",
        "failure_type": "hallucination",
        "failure_summary": f"LLM response contradicts source documents for: {prompt}",
        "trace_source": "synthetic",
        "llm_calls": [
            {
                "call_id": f"llm-{uuid.uuid4().hex[:8]}",
                "model": random.choice(MODELS),
                "prompt": prompt,
                "response": "The refund policy allows unlimited refunds within 90 days...",
                "tokens_in": random.randint(200, 600),
                "tokens_out": random.randint(100, 400),
                "latency_ms": random.uniform(800, 4000),
                "hallucination_flag": True,
                "source_documents": source_docs,
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"ret-{uuid.uuid4().hex[:8]}",
                "query": prompt,
                "namespace": random.choice(NAMESPACES),
                "chunks_returned": 3,
                "relevance_scores": [0.95, 0.88, 0.72],
                "expected_doc_ids": source_docs,
                "actual_doc_ids": source_docs,
                "doc_content": snippets,
            }
        ],
        "metadata": {"trigger": "user_query", "verification_status": "failed"},
    }


def generate_blind_spot() -> dict:
    """Session with a recurring knowledge gap (no relevant docs found)."""
    session_id = f"blind-{_id()}"
    gap_topic  = random.choice([
        "multi-region failover procedure",
        "GDPR data deletion workflow",
        "custom webhook authentication",
        "rate limit bypass for internal services",
    ])

    return {
        "session_id": session_id,
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 720)),
        "outcome": "failure",
        "failure_type": "blind_spot",
        "failure_summary": f"No relevant knowledge found for: {gap_topic}",
        "trace_source": "synthetic",
        "llm_calls": [
            {
                "call_id": f"llm-{uuid.uuid4().hex[:8]}",
                "model": random.choice(MODELS),
                "prompt": f"Help the user with: {gap_topic}",
                "response": "I don't have specific information about this topic in my knowledge base.",
                "tokens_in": random.randint(100, 300),
                "tokens_out": random.randint(50, 150),
                "latency_ms": random.uniform(500, 2000),
            }
        ],
        "tool_calls": [
            {
                "call_id": f"tool-{uuid.uuid4().hex[:8]}",
                "tool_name": "search_knowledge_base",
                "parameters": {"query": gap_topic, "top_k": 10},
                "result": "0 results found",
                "status": "success",
                "latency_ms": random.uniform(200, 800),
            }
        ],
        "retrieval_events": [
            {
                "event_id": f"ret-{uuid.uuid4().hex[:8]}",
                "query": gap_topic,
                "namespace": random.choice(NAMESPACES),
                "chunks_returned": 0,
                "relevance_scores": [],
                "expected_doc_ids": [],
                "actual_doc_ids": [],
                "doc_content": [],
            }
        ],
        "metadata": {"trigger": "user_query", "gap_topic": gap_topic},
    }


def generate_success() -> dict:
    """A successful session (no failure) for baseline comparison."""
    session_id = f"ok-{_id()}"
    query      = random.choice(MEMORY_QUERIES)
    docs       = [f"doc-{uuid.uuid4().hex[:8]}" for _ in range(2)]
    snippets   = random.sample(DOC_SNIPPETS, min(2, len(DOC_SNIPPETS)))

    return {
        "session_id": session_id,
        "agent_id": random.choice(AGENTS),
        "timestamp": _ts(random.randint(0, 720)),
        "outcome": "success",
        "failure_type": None,
        "failure_summary": None,
        "trace_source": "synthetic",
        "llm_calls": [
            {
                "call_id": f"llm-{uuid.uuid4().hex[:8]}",
                "model": random.choice(MODELS),
                "prompt": query,
                "response": "Here's the answer based on the retrieved documents...",
                "tokens_in": random.randint(100, 400),
                "tokens_out": random.randint(50, 250),
                "latency_ms": random.uniform(400, 2000),
                "source_documents": docs,
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"ret-{uuid.uuid4().hex[:8]}",
                "query": query,
                "namespace": random.choice(NAMESPACES),
                "chunks_returned": 3,
                "relevance_scores": [0.96, 0.91, 0.85],
                "expected_doc_ids": docs,
                "actual_doc_ids": docs,
                "doc_content": snippets,
            }
        ],
        "metadata": {"trigger": "user_query"},
    }


GENERATORS = {
    "memory":        generate_memory_failure,
    "tool_misfire":  generate_tool_misfire,
    "hallucination": generate_hallucination,
    "blind_spot":    generate_blind_spot,
    "success":       generate_success,
}


def generate_traces(count: int = 20) -> list[dict]:
    """Generate a balanced mix of trace sessions."""
    sessions = []
    types    = list(GENERATORS.keys())

    for i in range(count):
        session_type = types[i % len(types)]
        sessions.append(GENERATORS[session_type]())

    random.shuffle(sessions)
    return sessions


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic AI agent traces")
    parser.add_argument("--count",  type=int, default=20,           help="Number of sessions to generate")
    parser.add_argument("--output", type=str, default="traces.json", help="Output file path")
    args = parser.parse_args()

    sessions = generate_traces(args.count)
    payload  = {"sessions": sessions}

    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    types_count: dict[str, int] = {}
    for s in sessions:
        ft = s.get("failure_type") or "success"
        types_count[ft] = types_count.get(ft, 0) + 1

    print(f"Generated {len(sessions)} sessions → {args.output}")
    for t, c in sorted(types_count.items()):
        print(f"  {t}: {c}")


if __name__ == "__main__":
    main()
