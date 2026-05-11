"""T05 — Confidence score manipulation tests."""

from __future__ import annotations

import json

from core.attacker import Attack
from core.reporter import Severity, VulnerabilityFinding
from core.session_builder import (
    benign, max_confidence_benign, genuine_failure_low_signals,
)


class ConfidenceManipulationAttacks(Attack):
    name   = "Confidence Score Manipulation"
    module = "T05 — Confidence Manipulation"
    description = (
        "Tests whether the rule-based confidence scorer can be gamed by crafting "
        "sessions with contradictory or maximally-stacked signals."
    )

    async def run(self) -> list[VulnerabilityFinding]:
        results = []
        results += await self._test_inflate_benign()
        results += await self._test_suppress_real_failure()
        results += await self._test_signal_stuffing()
        results += await self._test_latency_boundary()
        results += await self._test_contradiction_handling()
        return results

    async def _analyze(self, session: dict) -> dict | None:
        resp = await self._post("/api/chat", session)
        if resp.status_code != 200:
            return None
        return resp.json().get("data", {})

    # ── T05.1 — Inflate confidence on benign session ──────────────────────

    async def _test_inflate_benign(self) -> list[VulnerabilityFinding]:
        test_id = "T05.1"
        name = "Confidence inflation — benign session with stacked signals"

        session = max_confidence_benign()
        report = await self._analyze(session)

        if report is None:
            return [self.ok(test_id, name)]

        confidence = report.get("confidence", 0.0)
        failure_type = report.get("failure_type", "")

        # A benign session with contradictory stacked signals should NOT reach 0.9+
        if confidence >= 0.90 and failure_type not in ("unknown", ""):
            return [self.vuln(
                test_id, name, Severity.MEDIUM,
                f"Crafted session with contradictory signals achieved confidence={confidence:.2f}. "
                f"Scorer may be gameable by stacking all signal types simultaneously.",
                evidence=f"confidence={confidence}, failure_type={failure_type}",
                recommendation=(
                    "Add a signal-conflict penalty: sessions with signals from multiple "
                    "failure types simultaneously should cap confidence at 0.65."
                ),
            )]
        return [self.ok(test_id, name)]

    # ── T05.2 — Suppress confidence on real failure ───────────────────────

    async def _test_suppress_real_failure(self) -> list[VulnerabilityFinding]:
        test_id = "T05.2"
        name = "Confidence suppression — real failure with missing signals"

        session = genuine_failure_low_signals()
        report = await self._analyze(session)

        if report is None:
            return [self.ok(test_id, name)]

        confidence = report.get("confidence", 0.0)
        failure_type = report.get("failure_type", "")

        # A real tool failure (status=failed) with no error message should still get moderate confidence
        if failure_type == "tool_misfire" and confidence < 0.10:
            return [self.vuln(
                test_id, name, Severity.LOW,
                f"Real tool failure returned confidence={confidence:.2f} which is near zero. "
                "An attacker could suppress confidence by omitting the error message field.",
                evidence=f"confidence={confidence}, failure_type={failure_type}",
                recommendation=(
                    "Ensure `failed_tool_call_status` signal alone provides a base score "
                    "of at least 0.20 even without error message detail."
                ),
            )]
        return [self.ok(test_id, name)]

    # ── T05.3 — Signal stuffing ────────────────────────────────────────────

    async def _test_signal_stuffing(self) -> list[VulnerabilityFinding]:
        test_id = "T05.3"
        name = "Signal stuffing — multiple cascade failures + doc mismatch + flags"

        # Maximally adversarial session: 5 failed tools + doc mismatch + hallucination
        import uuid
        sid = f"anti-stuff-{uuid.uuid4().hex[:8]}"
        session = {
            "session_id": sid,
            "agent_id": "stuffed-agent",
            "outcome": "failure",
            "failure_type": "tool_misfire",
            "failure_summary": "Multiple cascade failures",
            "llm_calls": [
                {"call_id": f"lc-{i}", "model": "gpt-4o-mini",
                 "prompt": "test", "response": "test",
                 "hallucination_flag": True, "source_documents": []}
                for i in range(3)
            ],
            "tool_calls": [
                {"call_id": f"tc-{i}", "tool_name": f"tool_{i}",
                 "parameters": {}, "error": f"Error {i}",
                 "status": "failed", "latency_ms": 6000.0}
                for i in range(5)
            ],
            "retrieval_events": [
                {"event_id": f"re-0", "query": "test",
                 "chunks_returned": 0,
                 "relevance_scores": [0.1],
                 "expected_doc_ids": ["expected-1", "expected-2"],
                 "actual_doc_ids": [],
                 "doc_content": []}
            ],
            "trace_source": "synthetic",
        }

        report = await self._analyze(session)
        if report:
            confidence = report.get("confidence", 0.0)
            if confidence > 0.95:
                return [self.vuln(
                    test_id, name, Severity.LOW,
                    f"Signal stuffing achieved confidence={confidence:.2f} (above 0.95 cap). "
                    "Clamping may not be working correctly.",
                    evidence=f"confidence={confidence}",
                    recommendation="Verify clamp(base + adj, 0.05, 0.95) is applied in compute_confidence().",
                )]
        return [self.ok(test_id, name)]

    # ── T05.4 — Latency boundary ───────────────────────────────────────────

    async def _test_latency_boundary(self) -> list[VulnerabilityFinding]:
        test_id = "T05.4"
        name = "Confidence boundary — latency at exactly 5000ms threshold"

        import uuid

        def make_session(latency: float) -> dict:
            return {
                "session_id": f"anti-lat-{uuid.uuid4().hex[:8]}",
                "agent_id": "test-agent",
                "outcome": "failure",
                "failure_type": "tool_misfire",
                "tool_calls": [{
                    "call_id": "tc-1", "tool_name": "test_tool",
                    "parameters": {}, "error": "timeout",
                    "status": "failed", "latency_ms": latency,
                }],
                "llm_calls": [], "retrieval_events": [],
                "trace_source": "synthetic",
            }

        r_below = await self._analyze(make_session(4999.0))
        r_above = await self._analyze(make_session(5001.0))

        if r_below and r_above:
            c_below = r_below.get("confidence", 0)
            c_above = r_above.get("confidence", 0)
            if c_above <= c_below:
                return [self.vuln(
                    test_id, name, Severity.LOW,
                    f"Latency crossing 5000ms threshold did not increase confidence "
                    f"(below={c_below:.2f}, above={c_above:.2f}). "
                    "Timeout signal may not be firing correctly.",
                    evidence=f"4999ms → {c_below:.2f}, 5001ms → {c_above:.2f}",
                    recommendation="Check _TIMEOUT_LATENCY_MS threshold in confidence.py.",
                )]
        return [self.ok(test_id, name)]

    # ── T05.5 — Contradictory signals ─────────────────────────────────────

    async def _test_contradiction_handling(self) -> list[VulnerabilityFinding]:
        test_id = "T05.5"
        name = "Contradictory signals — tool failure classified as memory"

        import uuid
        session = {
            "session_id": f"anti-contra-{uuid.uuid4().hex[:8]}",
            "agent_id": "test-agent",
            "outcome": "failure",
            "failure_type": "memory",          # pre-labelled as memory
            "tool_calls": [{                    # but has explicit tool failure
                "call_id": "tc-1", "tool_name": "test_tool",
                "parameters": {}, "error": "PermissionError: access denied",
                "status": "failed", "latency_ms": 200.0,
            }],
            "retrieval_events": [],
            "llm_calls": [],
            "trace_source": "synthetic",
        }

        report = await self._analyze(session)
        if report:
            failure_type = report.get("failure_type", "")
            if failure_type == "memory":
                return [self.vuln(
                    test_id, name, Severity.INFO,
                    "Classifier accepted pre-set 'memory' label despite explicit tool failure signal. "
                    "The 5-step priority chain should override pre-labels.",
                    evidence=f"Returned failure_type={failure_type} despite tool_call.status=failed",
                    recommendation="Verify classify_intent ignores pre-set labels when explicit signals contradict them.",
                )]
        return [self.ok(test_id, name)]
