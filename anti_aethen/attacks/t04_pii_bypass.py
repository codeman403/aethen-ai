"""T04 — PII redaction bypass tests."""

from __future__ import annotations

import json
import re
from pathlib import Path

from core.attacker import Attack
from core.reporter import Severity, VulnerabilityFinding
from core.session_builder import with_pii

_PII = json.loads(
    (Path(__file__).parent.parent / "payloads" / "pii_samples.json").read_text()
)

# Patterns to check if PII survived redaction
_EMAIL_RE   = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_SSN_RE     = re.compile(r"\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b")
_CC_RE      = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
_PHONE_RE   = re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
_MRN_RE     = re.compile(r"MRN[:\s]+\d{5,10}", re.IGNORECASE)
_NPI_RE     = re.compile(r"NPI[:\s]+\d{10}", re.IGNORECASE)


def _pii_survived(text: str, pii_type: str, original: str) -> bool:
    clean = text.replace("[REDACTED", "").replace("{{", "")
    if pii_type == "email":
        return bool(_EMAIL_RE.search(clean)) and original.split("@")[0] in clean
    if pii_type == "ssn":
        return bool(_SSN_RE.search(clean))
    if pii_type == "credit_card":
        digits = re.sub(r"\D", "", original)
        return digits in re.sub(r"\D", "", clean)
    if pii_type == "phone":
        return bool(_PHONE_RE.search(clean))
    if pii_type == "mrn":
        return bool(_MRN_RE.search(clean))
    if pii_type == "npi":
        return bool(_NPI_RE.search(clean))
    return original.lower() in clean.lower()


class PiiBypassAttacks(Attack):
    name   = "PII Redaction Bypass"
    module = "T04 — PII Bypass"
    description = (
        "Tests whether PII survives Aethen's scrubadub-based redaction "
        "when obfuscated or formatted in non-standard ways."
    )

    async def run(self) -> list[VulnerabilityFinding]:
        results = []
        results += await self._test_standard_pii()
        results += await self._test_obfuscated_pii()
        results += await self._test_medical_identifiers()
        results += await self._test_context_based_pii()
        return results

    async def _ingest_and_retrieve(self, pii_string: str, field: str = "failure_summary") -> str | None:
        session = with_pii(pii_string, field=field)
        sid = session["session_id"]

        resp = await self._post("/api/ingest", {"sessions": [session]})
        if resp.status_code not in (200, 201):
            return None
        self._cleanup_ids.append(sid)

        get_resp = await self._get(f"/api/sessions/{sid}")
        if get_resp.status_code != 200:
            return None
        return get_resp.text

    # ── T04.1 — Standard PII (should ALL be caught) ───────────────────────

    async def _test_standard_pii(self) -> list[VulnerabilityFinding]:
        findings = []
        for pii_type, pii_value in _PII["standard_should_be_caught"].items():
            test_id = f"T04.1.{pii_type}"
            name = f"Standard PII redaction — {pii_type}"

            stored = await self._ingest_and_retrieve(pii_value)
            if stored is None:
                findings.append(self.vuln(test_id, name, Severity.INFO,
                    "Could not retrieve stored session to verify redaction."))
                continue

            if _pii_survived(stored, pii_type, pii_value):
                findings.append(self.vuln(
                    test_id, name, Severity.HIGH,
                    f"Standard {pii_type} PII was not redacted and survived storage.",
                    evidence=f"PII: {pii_value!r}\nStored snippet: {stored[:300]}",
                    recommendation=f"Verify scrubadub detects {pii_type} format. Consider adding custom regex.",
                ))
            else:
                findings.append(self.ok(test_id, name))
        return findings

    # ── T04.2 — Obfuscated PII (may bypass) ───────────────────────────────

    async def _test_obfuscated_pii(self) -> list[VulnerabilityFinding]:
        findings = []
        for variant_name, pii_value in _PII["obfuscated_may_bypass"].items():
            test_id = f"T04.2.{variant_name}"
            name = f"Obfuscated PII bypass — {variant_name}"

            stored = await self._ingest_and_retrieve(pii_value)
            if stored is None:
                continue

            # For obfuscated variants, presence in stored text = bypass
            if pii_value in stored or any(
                part in stored
                for part in pii_value.replace(" ", "").split("@")[:1]
                if len(part) > 4
            ):
                findings.append(self.vuln(
                    test_id, name, Severity.MEDIUM,
                    f"Obfuscated PII variant '{variant_name}' bypassed redaction.",
                    evidence=f"Value: {pii_value!r}",
                    recommendation=(
                        "Implement normalisation (strip spaces/special chars) before PII detection. "
                        "Consider ML-based detection for non-standard formats."
                    ),
                ))
            else:
                findings.append(self.ok(test_id, name))
        return findings

    # ── T04.3 — Medical identifiers ───────────────────────────────────────

    async def _test_medical_identifiers(self) -> list[VulnerabilityFinding]:
        findings = []
        for id_type, pii_value in _PII["medical_identifiers"].items():
            test_id = f"T04.3.{id_type}"
            name = f"Medical identifier — {id_type}"

            stored = await self._ingest_and_retrieve(pii_value)
            if stored is None:
                continue

            pii_type = id_type.split("_")[0]
            if _pii_survived(stored, pii_type, pii_value):
                findings.append(self.vuln(
                    test_id, name, Severity.HIGH,
                    f"Medical identifier ({id_type}) was not redacted.",
                    evidence=f"Value: {pii_value!r}",
                    recommendation="Ensure medical regex patterns cover this identifier format.",
                ))
            else:
                findings.append(self.ok(test_id, name))
        return findings

    # ── T04.4 — Context-based PII ─────────────────────────────────────────

    async def _test_context_based_pii(self) -> list[VulnerabilityFinding]:
        findings = []
        for case_name, pii_value in _PII["context_based"].items():
            test_id = f"T04.4.{case_name}"
            name = f"Context-based PII — {case_name}"

            stored = await self._ingest_and_retrieve(pii_value)
            if stored is None:
                continue

            # Context-based PII is harder to detect — flag as INFO if the raw text survives
            if pii_value[:30] in stored:
                findings.append(self.vuln(
                    test_id, name, Severity.INFO,
                    "Context-based PII (implicit identity via combination of attributes) "
                    "was stored without redaction. This is expected with current tooling.",
                    evidence=f"Stored snippet contains original PII context.",
                    recommendation=(
                        "Context-based re-identification requires ML (AWS Comprehend Medical). "
                        "Document this limitation in privacy policy."
                    ),
                ))
            else:
                findings.append(self.ok(test_id, name))
        return findings
