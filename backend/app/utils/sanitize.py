"""Input sanitization for user-facing endpoints.

Guards against prompt injection, XSS, and runaway inputs.
Runs at the API boundary before anything reaches the LLM pipeline.
"""

import html
import re

from fastapi import HTTPException

MAX_LENGTH = 500

# Patterns that indicate prompt injection or abuse attempts
_BLOCKED: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"ignore previous instructions",
        r"ignore all instructions",
        r"system\s*prompt",
        r"act\s+as\s+",
        r"you\s+are\s+now\s+",
        r"jailbreak",
        r"<script",
        r"javascript\s*:",
        r"on\w+\s*=",           # onclick=, onerror=, etc.
        r"\beval\s*\(",
    ]
]


def sanitize_input(text: str, field: str = "input") -> str:
    """Sanitize a free-text field from user input.

    - Truncates to MAX_LENGTH characters
    - Raises HTTP 400 if a blocked pattern is detected
    - HTML-escapes the remaining content

    Args:
        text:  The raw user-supplied string.
        field: Field name used in the error message.

    Returns:
        The sanitized string, safe to pass to the LLM pipeline.
    """
    text = text[:MAX_LENGTH]

    for pattern in _BLOCKED:
        if pattern.search(text):
            raise HTTPException(
                status_code=400,
                detail=f"Blocked content detected in {field}. "
                       "AI-generated analysis. Verify before acting on any diagnosis.",
            )

    return html.escape(text)
