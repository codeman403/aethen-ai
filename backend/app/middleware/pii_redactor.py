"""PII/PHI redaction for AI agent session data.

Two-layer approach:
  1. scrubadub — open-source library for standard PII (email, phone, SSN,
     credit card, dates, addresses). Production-grade, no ML dependency.
  2. Custom regex — HIPAA PHI types not covered by scrubadub: medical record
     numbers, health plan beneficiary IDs, ICD-10 codes, NPI numbers.

Runs on every session before it touches Postgres, Pinecone, or Neo4j.

Redaction format: {{SCRUBADUB_TYPE}} for scrubadub, [REDACTED:TYPE] for custom
patterns. Both preserve text structure for downstream analysis.

Honest limitation: Regex/pattern matching covers ~85-95% recall for
well-formatted PII/PHI. Clinical free-text (e.g. "patient has diabetes")
requires ML-based medical NLP (AWS Comprehend Medical, Azure Health) which
is a separate layer for healthcare-specific deployments.

Controlled by PII_REDACTION_ENABLED env var (default: true).
"""

from __future__ import annotations

import re
from typing import Any

import structlog

from app.config import settings
from app.models.trace import Session

logger = structlog.get_logger()

# ── scrubadub setup (lazy init) ───────────────────────────────────────────────

_scrubber = None


def _get_scrubber():
    global _scrubber
    if _scrubber is None:
        import scrubadub
        _scrubber = scrubadub.Scrubber()
        logger.info("pii_redactor_initialized", engine="scrubadub")
    return _scrubber


# ── PII patterns scrubadub misses in common formats ───────────────────────────
# scrubadub covers many types but misses some phone/CC formats — add here.

_EXTRA_PII_PATTERNS: list[tuple[str, re.Pattern]] = [
    # Phone numbers (US formats scrubadub sometimes misses)
    ("PHONE", re.compile(
        r"\b(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b",
    )),
    # Credit cards with spaces or dashes (16-digit groups)
    ("CREDIT_CARD", re.compile(
        r"\b(?:\d{4}[\s\-]){3}\d{4}\b",
    )),
    # IP addresses
    ("IP_ADDRESS", re.compile(
        r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b",
    )),
    # Spaced-out email: "j o h n . s m i t h @ e x a m p l e . c o m"
    # Each character (including TLD) separated by spaces — the TLD is also spaced
    # so we can't anchor on "com". Instead match the single-char @ pattern directly.
    ("EMAIL_SPACED", re.compile(
        r"[a-zA-Z0-9](?:\s+[a-zA-Z0-9.]){4,}\s+@\s+[a-zA-Z0-9.](?:\s+[a-zA-Z0-9.]){3,}",
        re.IGNORECASE,
    )),
    # Unicode/homoglyph email: scrubadub's ASCII-only regex misses Cyrillic/Greek
    # chars in the local part (e.g. jпhn@example.com). \w in UNICODE mode catches them.
    ("EMAIL_UNICODE", re.compile(
        r"[\w._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
        re.UNICODE,
    )),
]

# ── Medical/PHI patterns not covered by scrubadub ─────────────────────────────
# Each entry: (entity_label, compiled_pattern)

_MEDICAL_PATTERNS: list[tuple[str, re.Pattern]] = [
    # Medical Record Numbers — common hospital formats (MRN-123456, MRN: 1234567)
    ("MEDICAL_RECORD_NUMBER", re.compile(
        r"\bMRN[:\s\-#]*\d{5,10}\b",
        re.IGNORECASE,
    )),
    # Health Plan Beneficiary / Member IDs — prefix-based (INS-xxx, MEM-xxx) and
    # label-based ("Health Plan ID: HP-9876543-21")
    ("HEALTH_PLAN_ID", re.compile(
        r"\b(?:Health\s+Plan\s+(?:ID|Number|No\.?|#)\s*[:\s]|INS|MEM|BEN|HMO|PPO)[:\s\-#]*[A-Z0-9][A-Z0-9\-]{5,14}\b",
        re.IGNORECASE,
    )),
    # Date of birth (explicit label + date value)
    ("DATE_OF_BIRTH", re.compile(
        r"\b(?:DOB|D\.O\.B\.?|Date\s+of\s+[Bb]irth|Born(?:\s+on)?)\s*[:\-]?\s*"
        r"(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})",
        re.IGNORECASE,
    )),
    # ICD-10 diagnosis codes (e.g. J06.9, E11.65, F32.1)
    ("ICD10_CODE", re.compile(
        r"\b[A-Z]\d{2}(?:\.\d{1,4})?\b",
    )),
    # NPI (National Provider Identifier) — 10-digit number
    ("NPI_NUMBER", re.compile(
        r"\bNPI[:\s#]*\d{10}\b",
        re.IGNORECASE,
    )),
    # DEA numbers (drug prescribers) — format: 2 letters + 7 digits
    ("DEA_NUMBER", re.compile(
        r"\b[A-Z]{2}\d{7}\b",
    )),
]


# ── Core redaction functions ───────────────────────────────────────────────────


def redact_text(text: str) -> str:
    """Replace PII/PHI in text using scrubadub + medical regex patterns.

    Pure function — no I/O. Returns original text unchanged when
    PII_REDACTION_ENABLED is false or text is empty.
    """
    if not settings.pii_redaction_enabled or not text or not text.strip():
        return text

    try:
        # Layer 1: scrubadub (email, phone, SSN, credit card, dates, addresses)
        result = _get_scrubber().clean(text)
    except Exception as exc:
        logger.warning("scrubadub_redaction_failed", error=str(exc))
        result = text

    # Layer 2: PII formats scrubadub misses (phone, spaced CC, IP)
    for label, pattern in _EXTRA_PII_PATTERNS:
        result = pattern.sub(f"[REDACTED:{label}]", result)

    # Layer 3: medical/PHI patterns not covered by scrubadub
    for label, pattern in _MEDICAL_PATTERNS:
        result = pattern.sub(f"[REDACTED:{label}]", result)

    return result


def _redact_dict_values(data: Any) -> Any:
    """Recursively redact string values inside a dict or list."""
    if isinstance(data, str):
        return redact_text(data)
    if isinstance(data, dict):
        return {k: _redact_dict_values(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_redact_dict_values(item) for item in data]
    return data


def redact_session(session: Session) -> Session:
    """Apply PII/PHI redaction to all free-text fields before storage.

    Returns a new Session with redacted fields. The original is unchanged.

    Fields redacted:
      - failure_summary
      - llm_calls[*].prompt, llm_calls[*].response
      - tool_calls[*].parameters (values), tool_calls[*].result, tool_calls[*].error
      - retrieval_events[*].doc_content[*]
    """
    if not settings.pii_redaction_enabled:
        return session

    data = session.model_dump()

    if data.get("failure_summary"):
        data["failure_summary"] = redact_text(data["failure_summary"])

    for call in data.get("llm_calls", []):
        if call.get("prompt"):
            call["prompt"] = redact_text(call["prompt"])
        if call.get("response"):
            call["response"] = redact_text(call["response"])

    for tc in data.get("tool_calls", []):
        if tc.get("parameters"):
            tc["parameters"] = _redact_dict_values(tc["parameters"])
        if tc.get("result"):
            tc["result"] = redact_text(tc["result"])
        if tc.get("error"):
            tc["error"] = redact_text(tc["error"])

    for ev in data.get("retrieval_events", []):
        if ev.get("doc_content"):
            ev["doc_content"] = [redact_text(c) for c in ev["doc_content"]]

    return Session(**data)
