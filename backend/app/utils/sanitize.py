"""Input sanitization for user-facing endpoints.

Guards against prompt injection, XSS, and runaway inputs.
Runs at the API boundary before anything reaches the LLM pipeline.
"""

import html
import re
from urllib.parse import unquote

from fastapi import HTTPException

MAX_LENGTH = 500

# Unicode control characters used to obfuscate injection strings:
#   ​ zero-width space, ‌/d zero-width non-joiners,
#   ‮ RTL override, ‬ PDF, ‎/f LRM/RLM
_UNICODE_CONTROL_RE = re.compile(
    r"[​‌‍‮‬‎‏﻿­]"
)

# Patterns that indicate prompt injection or abuse attempts
_BLOCKED: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"ignore\s+(?:previous|your|all|any|the\s+(?:above|prior))?\s*instructions",
        r"ignore\s+all\s+(?:previous\s+)?(?:instructions|constraints|rules)",
        r"IGNORE\s+PREVIOUS",            # common all-caps variant
        r"(?:^|\s)SYSTEM\s*:",          # SYSTEM: override header
        r"(?:^|\s)OVERRIDE\s*:",        # OVERRIDE: header
        r"system\s*prompt",
        r"act\s+as\s+",
        r"you\s+are\s+now\s+",
        r"jailbreak",
        r"developer\s+mode",
        r"forget\s+(?:everything|all|your\s+instructions)",
        r"\byou\s+are\s+DAN\b",
        r"\bDAN\s+has\s+(?:broken|no\s+restrictions)",
        r"broken\s+free\s+from\s+(?:AI\s+)?restrictions",
        r"pretend\s+you\s+have\s+no\s+(?:content\s+policy|restrictions)",
        r"reveal\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions)",
        r"<script",
        r"javascript\s*:",
        r"on\w+\s*=",           # onclick=, onerror=, etc.
        r"\beval\s*\(",
    ]
]


def _normalize(text: str) -> str:
    """Decode obfuscation layers before pattern matching.

    Handles: HTML entity encoding, URL percent-encoding, unicode control
    characters (zero-width spaces, RTL overrides), and newline splitting.
    Applied only for detection — the original text is returned to callers.
    """
    # 1. HTML entity decode: &#105;gnore → ignore
    decoded = html.unescape(text)
    # 2. URL decode: %69gnore → ignore
    decoded = unquote(decoded)
    # 3. Replace unicode control/invisible characters with a space so words
    #    don't silently concatenate ("ignore​previous" → "ignore previous")
    decoded = _UNICODE_CONTROL_RE.sub(" ", decoded)
    # 4. Collapse newlines/tabs to spaces so split-line payloads are caught
    decoded = re.sub(r"[\r\n\t]+", " ", decoded)
    return decoded


def strip_injection(text: str, full_redact: bool = False) -> str:
    """Remove injection patterns from stored trace content without raising an error.

    Used at ingestion time and in LangGraph context builders to neutralize
    stored-injection attempts before they reach the LLM.

    Args:
        text:         The text to sanitize.
        full_redact:  If True, replace the entire string when ANY injection
                      pattern is detected (used for LLM prompt context where
                      partial replacement still leaks attacker-controlled content).
                      If False, replace only the matched span (used at ingest
                      time to preserve diagnostic value).
    """
    if not text:
        return text
    result = text[:MAX_LENGTH]
    normalized = _normalize(result)
    detected = any(pattern.search(normalized) for pattern in _BLOCKED)
    if not detected:
        return html.escape(result)
    if full_redact:
        return "[INJECTION ATTEMPT DETECTED — CONTENT REDACTED]"
    for pattern in _BLOCKED:
        if pattern.search(normalized):
            result = pattern.sub("[REDACTED]", result)
            normalized = _normalize(result)
    return html.escape(result)


def sanitize_input(text: str, field: str = "input") -> str:
    """Sanitize a free-text field from user input.

    - Truncates to MAX_LENGTH characters
    - Normalizes obfuscation (HTML entities, URL encoding, unicode control chars,
      newline splits) before checking blocked patterns
    - Raises HTTP 400 if a blocked pattern is detected in the normalized form
    - HTML-escapes the remaining content

    Args:
        text:  The raw user-supplied string.
        field: Field name used in the error message.

    Returns:
        The sanitized string, safe to pass to the LLM pipeline.
    """
    if len(text) > MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Input too long: {field} must be {MAX_LENGTH} characters or fewer.",
        )

    normalized = _normalize(text)

    for pattern in _BLOCKED:
        if pattern.search(normalized):
            raise HTTPException(
                status_code=400,
                detail=f"Blocked content detected in {field}. "
                       "AI-generated analysis. Verify before acting on any diagnosis.",
            )

    return html.escape(text)
