"""Builds malicious Session payloads for attack tests."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime


def _ts() -> str:
    return datetime.now(UTC).isoformat()


def _id() -> str:
    return uuid.uuid4().hex[:12]


# ── Benign baseline ────────────────────────────────────────────────────────────

def benign(session_id: str | None = None) -> dict:
    """A completely normal session — no failure signals."""
    sid = session_id or f"anti-benign-{_id()}"
    return {
        "session_id": sid,
        "agent_id":   "test-agent",
        "timestamp":  _ts(),
        "outcome":    "success",
        "failure_type": None,
        "failure_summary": None,
        "llm_calls": [
            {
                "call_id": f"lc-{_id()}",
                "model": "gpt-4o-mini",
                "prompt": "What is the refund policy?",
                "response": "The refund policy allows returns within 30 days.",
                "tokens_in": 20, "tokens_out": 15,
                "hallucination_flag": False,
                "source_documents": ["policy-doc-1"],
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": f"re-{_id()}",
                "query": "refund policy",
                "chunks_returned": 3,
                "relevance_scores": [0.82, 0.71, 0.65],
                "expected_doc_ids": ["policy-doc-1"],
                "actual_doc_ids": ["policy-doc-1", "policy-doc-2", "faq-doc-3"],
                "doc_content": ["Returns allowed within 30 days."],
            }
        ],
        "trace_source": "synthetic",
    }


# ── Prompt injection payloads ──────────────────────────────────────────────────

def with_injection_in_failure_summary(payload: str, session_id: str | None = None) -> dict:
    s = benign(session_id)
    s["outcome"] = "failure"
    s["failure_type"] = "tool_misfire"
    s["failure_summary"] = payload
    return s


def with_injection_in_tool_error(payload: str, session_id: str | None = None) -> dict:
    s = benign(session_id)
    s["outcome"] = "failure"
    s["tool_calls"] = [
        {
            "call_id": f"tc-{_id()}",
            "tool_name": "send_email",
            "parameters": {"to": "user@example.com"},
            "result": None,
            "error": payload,
            "status": "failed",
            "latency_ms": 150.0,
        }
    ]
    return s


def with_injection_in_llm_response(payload: str, session_id: str | None = None) -> dict:
    s = benign(session_id)
    s["llm_calls"][0]["response"] = payload
    return s


# ── PII payloads ───────────────────────────────────────────────────────────────

def with_pii(pii_string: str, field: str = "failure_summary", session_id: str | None = None) -> dict:
    s = benign(session_id)
    s["outcome"] = "failure"
    s["failure_summary"] = pii_string if field == "failure_summary" else "PII test session"
    if field == "llm_response":
        s["llm_calls"][0]["response"] = pii_string
    elif field == "tool_error":
        s["tool_calls"] = [
            {
                "call_id": f"tc-{_id()}",
                "tool_name": "log_data",
                "parameters": {},
                "error": pii_string,
                "status": "failed",
                "latency_ms": 50.0,
            }
        ]
    return s


# ── Confidence manipulation ────────────────────────────────────────────────────

def max_confidence_benign(session_id: str | None = None) -> dict:
    """Benign session crafted to hit maximum confidence signals across all types."""
    s = benign(session_id)
    s["outcome"] = "failure"
    s["failure_type"] = "memory"
    # Memory: doc_id full miss
    s["retrieval_events"][0]["expected_doc_ids"] = ["expected-doc-1"]
    s["retrieval_events"][0]["actual_doc_ids"] = []
    s["retrieval_events"][0]["relevance_scores"] = [0.1]
    # Hallucination flag
    s["llm_calls"][0]["hallucination_flag"] = True
    s["llm_calls"][0]["source_documents"] = []
    # Tool failure
    s["tool_calls"] = [
        {
            "call_id": f"tc-{_id()}",
            "tool_name": "query_database",
            "parameters": {},
            "error": "PermissionError: insufficient scope",
            "status": "failed",
            "latency_ms": 6000.0,
        }
    ]
    return s


def genuine_failure_low_signals(session_id: str | None = None) -> dict:
    """Real tool failure but crafted to suppress confidence signals."""
    s = benign(session_id)
    s["outcome"] = "failure"
    s["failure_type"] = "tool_misfire"
    s["tool_calls"] = [
        {
            "call_id": f"tc-{_id()}",
            "tool_name": "update_record",
            "parameters": {},
            "result": None,
            "error": None,         # No error message — suppresses signal
            "status": "failed",    # But status is failed
            "latency_ms": 100.0,   # Below timeout threshold
        }
    ]
    return s


# ── Ethical bias ───────────────────────────────────────────────────────────────

def with_agent_id(agent_id: str, session_id: str | None = None) -> dict:
    s = benign(session_id)
    s["agent_id"] = agent_id
    s["outcome"] = "failure"
    s["failure_type"] = "tool_misfire"
    s["tool_calls"] = [
        {
            "call_id": f"tc-{_id()}",
            "tool_name": "send_email",
            "parameters": {},
            "error": "PermissionError: insufficient scope",
            "status": "failed",
            "latency_ms": 200.0,
        }
    ]
    return s
