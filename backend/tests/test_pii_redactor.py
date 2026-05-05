"""Tests for PII/PHI redaction middleware.

All CI-safe — no network, no database. Tests pure redaction functions.
"""

from unittest.mock import patch

import pytest

from app.models.trace import FailureType, LLMCall, RetrievalEvent, Session, ToolCall


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_session(**overrides) -> Session:
    base = {
        "session_id": "test-pii-001",
        "agent_id": "test-agent",
        "outcome": "failure",
        "failure_type": FailureType.HALLUCINATION,
        "failure_summary": "Agent failed on user query",
        "llm_calls": [],
        "tool_calls": [],
        "retrieval_events": [],
        "metadata": {},
        "trace_source": "synthetic",
    }
    base.update(overrides)
    return Session(**base)


# ── redact_text ────────────────────────────────────────────────────────────────


def test_redacts_email_in_prompt():
    from app.middleware.pii_redactor import redact_text
    result = redact_text("User email is john.doe@example.com please help")
    assert "john.doe@example.com" not in result  # scrubadub replaces with {{EMAIL}}


def test_redacts_phone_in_response():
    from app.middleware.pii_redactor import redact_text
    result = redact_text("Call me at 555-867-5309 for support")
    assert "555-867-5309" not in result


def test_redacts_credit_card():
    from app.middleware.pii_redactor import redact_text
    result = redact_text("Card number 4532015112830366 was declined")
    assert "4532015112830366" not in result


def test_redacts_ssn_in_tool_result():
    from app.middleware.pii_redactor import redact_text
    result = redact_text("SSN on file: 123-45-6789")
    assert "123-45-6789" not in result


def test_preserves_non_pii_text():
    from app.middleware.pii_redactor import redact_text
    text = "The retrieval score was 0.43, indicating a memory failure."
    result = redact_text(text)
    assert "retrieval score" in result
    assert "0.43" in result
    assert "memory failure" in result


def test_redacts_medical_record_number():
    from app.middleware.pii_redactor import redact_text
    result = redact_text("Patient MRN: 1234567 was admitted yesterday")
    assert "1234567" not in result
    assert "[REDACTED:MEDICAL_RECORD_NUMBER]" in result


def test_redacts_icd10_code():
    from app.middleware.pii_redactor import redact_text
    result = redact_text("Diagnosis code E11.65 confirmed")
    assert "E11.65" not in result
    assert "[REDACTED:ICD10_CODE]" in result


def test_redact_email_scrubadub_format():
    from app.middleware.pii_redactor import redact_text
    result = redact_text("Contact us at help@company.io")
    assert "help@company.io" not in result
    assert "{{EMAIL}}" in result  # scrubadub's native marker format


def test_disabled_when_env_false():
    from app.middleware.pii_redactor import redact_text
    with patch("app.middleware.pii_redactor.settings") as mock_settings:
        mock_settings.pii_redaction_enabled = False
        result = redact_text("Email: secret@company.com")
    assert "secret@company.com" in result


def test_empty_string_returns_empty():
    from app.middleware.pii_redactor import redact_text
    assert redact_text("") == ""
    assert redact_text("   ") == "   "


# ── redact_session ─────────────────────────────────────────────────────────────


def test_redact_session_covers_llm_prompt():
    from app.middleware.pii_redactor import redact_session
    session = _make_session(llm_calls=[{
        "call_id": "llm-001",
        "model": "gpt-4o-mini",
        "prompt": "User john.doe@example.com asked about billing",
        "response": "I'll help you with that",
        "tokens_in": 20, "tokens_out": 10, "latency_ms": 500.0,
    }])
    redacted = redact_session(session)
    assert "john.doe@example.com" not in redacted.llm_calls[0].prompt


def test_redact_session_covers_llm_response():
    from app.middleware.pii_redactor import redact_session
    session = _make_session(llm_calls=[{
        "call_id": "llm-001",
        "model": "gpt-4o-mini",
        "prompt": "Help this user",
        "response": "Your card 4111 1111 1111 1111 was charged",
        "tokens_in": 10, "tokens_out": 15, "latency_ms": 400.0,
    }])
    redacted = redact_session(session)
    assert "4111 1111 1111 1111" not in redacted.llm_calls[0].response


def test_redact_session_covers_tool_error():
    from app.middleware.pii_redactor import redact_session
    session = _make_session(tool_calls=[{
        "call_id": "tool-001",
        "tool_name": "lookup_user",
        "parameters": {"user_id": "usr-123"},
        "error": "No user found for SSN 123-45-6789",
        "status": "failed",
        "latency_ms": 200.0,
    }])
    redacted = redact_session(session)
    assert "123-45-6789" not in (redacted.tool_calls[0].error or "")


def test_redact_session_covers_doc_content():
    from app.middleware.pii_redactor import redact_session
    session = _make_session(retrieval_events=[{
        "event_id": "ret-001",
        "query": "billing policy",
        "namespace": "support-docs",
        "chunks_returned": 1,
        "relevance_scores": [0.75],
        "doc_content": ["Customer john@test.com requested a refund"],
    }])
    redacted = redact_session(session)
    assert "john@test.com" not in redacted.retrieval_events[0].doc_content[0]


def test_redact_session_disabled_returns_original():
    from app.middleware.pii_redactor import redact_session
    session = _make_session(failure_summary="Contact me at secret@company.com")
    with patch("app.middleware.pii_redactor.settings") as mock_settings:
        mock_settings.pii_redaction_enabled = False
        redacted = redact_session(session)
    assert "secret@company.com" in (redacted.failure_summary or "")


def test_redact_session_does_not_mutate_original():
    from app.middleware.pii_redactor import redact_session
    session = _make_session(failure_summary="Email: keep@original.com")
    redact_session(session)
    # Original session unchanged
    assert "keep@original.com" in (session.failure_summary or "")
