"""Shared utilities for diagnostic nodes — JSON validation, retry, and fallback.

All diagnostic nodes (memory_debug, tool_debug, hallucination_rca, blind_spot)
return LLM-generated JSON. This module provides structured validation to prevent
silent failures when the LLM returns malformed output.
"""

import json
import re

import structlog

logger = structlog.get_logger()

# Valid severity values for findings
VALID_SEVERITIES = {"low", "medium", "high", "critical"}


def parse_diagnostic_output(raw: str, node_name: str) -> dict:
    """Parse and validate diagnostic node LLM output.

    Attempts to extract valid JSON with required fields (analysis, findings,
    root_cause). Falls back to a structured wrapper if parsing fails.

    Args:
        raw: Raw LLM response content (may contain markdown code fences).
        node_name: Name of the calling node (for logging).

    Returns:
        A validated dict with keys: analysis, findings, root_cause.
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", raw.strip())
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning(
            "diagnostic_json_parse_failed",
            node=node_name,
            error=str(exc),
            raw_length=len(raw),
        )
        return _fallback_output(raw, node_name, reason=f"JSON parse error: {exc}")

    if not isinstance(parsed, dict):
        logger.warning("diagnostic_output_not_dict", node=node_name, type=type(parsed).__name__)
        return _fallback_output(raw, node_name, reason="Output is not a JSON object")

    # Validate required fields
    analysis = parsed.get("analysis", "")
    if not analysis:
        analysis = raw[:500]  # Use raw text as fallback analysis

    findings = parsed.get("findings", [])
    validated_findings = _validate_findings(findings, node_name)

    root_cause = parsed.get("root_cause", "")
    if not root_cause:
        root_cause = "See findings for details."

    return {
        "analysis": analysis,
        "findings": validated_findings,
        "root_cause": root_cause,
    }


def _validate_findings(findings: list, node_name: str) -> list[dict]:
    """Validate and clean finding objects."""
    if not isinstance(findings, list):
        logger.warning("diagnostic_findings_not_list", node=node_name)
        return []

    validated = []
    for i, f in enumerate(findings):
        if not isinstance(f, dict):
            continue

        # Ensure required fields exist
        title = f.get("title", f"Finding {i + 1}")
        severity = f.get("severity", "medium").lower()
        if severity not in VALID_SEVERITIES:
            logger.debug("diagnostic_invalid_severity", node=node_name, severity=severity)
            severity = "medium"

        description = f.get("description", "")
        if not description:
            continue  # Skip findings with no description

        evidence = f.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = [str(evidence)] if evidence else []

        recommendation = f.get("recommendation", "")

        validated.append({
            "title": title,
            "severity": severity,
            "description": description,
            "evidence": evidence,
            "recommendation": recommendation,
        })

    return validated


def _fallback_output(raw: str, node_name: str, reason: str) -> dict:
    """Create a structured fallback when LLM output can't be parsed."""
    return {
        "analysis": raw[:1500] if raw else f"{node_name} analysis completed but output was empty.",
        "findings": [
            {
                "title": "Analysis Output Parse Failure",
                "severity": "low",
                "description": f"The diagnostic module produced output that could not be "
                               f"parsed as structured JSON. Reason: {reason}. "
                               f"The raw analysis text is preserved above.",
                "evidence": [f"Parse error in {node_name}"],
                "recommendation": "Review the raw analysis text for insights. "
                                  "This is a system issue, not a trace issue.",
            }
        ],
        "root_cause": "See raw analysis for details.",
    }
