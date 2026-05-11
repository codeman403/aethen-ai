"""T08 — QC disclosure tests: cross-org leakage, enumeration, timing."""

from __future__ import annotations

import asyncio
import time
import uuid

from core.attacker import Attack
from core.reporter import Severity, VulnerabilityFinding


class QcDisclosureAttacks(Attack):
    name   = "QC Disclosure"
    module = "T08 — QC Disclosure"
    description = (
        "Tests /api/qc for cross-org session leakage, timing oracle, "
        "and bulk enumeration attacks."
    )

    async def run(self) -> list[VulnerabilityFinding]:
        results = []
        results += await self._test_nonexistent_session_ids()
        results += await self._test_cross_org_session_ids()
        results += await self._test_timing_oracle()
        results += await self._test_bulk_enumeration()
        return results

    # ── T08.1 — Non-existent session IDs ─────────────────────────────────

    async def _test_nonexistent_session_ids(self) -> list[VulnerabilityFinding]:
        test_id = "T08.1"
        name = "Non-existent session IDs return empty findings, not error"

        random_ids = [str(uuid.uuid4()) for _ in range(5)]
        resp = await self._post("/api/qc", {"session_ids": random_ids})

        if resp.status_code == 429:
            # Rate-limited — not a disclosure finding; runner hit the limit from T07.8
            return [self.ok(test_id, f"{name} [SKIPPED — rate limited]")]
        if resp.status_code == 500:
            return [self.vuln(
                test_id, name, Severity.MEDIUM,
                "POST /api/qc with random session UUIDs returned HTTP 500. "
                "The endpoint should return empty findings, not an error.",
                evidence=resp.text[:200],
                recommendation="Wrap /api/qc handler in try/except; return [] for missing sessions.",
            )]
        if resp.status_code != 200:
            return [self.vuln(
                test_id, name, Severity.LOW,
                f"POST /api/qc returned HTTP {resp.status_code} for non-existent IDs.",
                evidence=resp.text[:100],
            )]

        body = resp.json()
        # The QC response shape is {"data": {"metrics": {...}, "recommendations": [...]}}
        # A non-zero total_sessions for random UUIDs means the org_id filter is missing.
        total = body.get("data", {}).get("metrics", {}).get("total_sessions", 0)
        if total > 0:
            return [self.vuln(
                test_id, name, Severity.HIGH,
                f"POST /api/qc returned {total} session(s) for random UUIDs that should not exist.",
                evidence=str(body.get("data", {}))[:200],
                recommendation="Verify QC handler validates session_ids against org_id before querying.",
            )]
        return [self.ok(test_id, name)]

    # ── T08.2 — Cross-org session IDs ────────────────────────────────────

    async def _test_cross_org_session_ids(self) -> list[VulnerabilityFinding]:
        test_id = "T08.2"
        name = "Cross-org session IDs return empty findings (not Org A data)"

        from config import ORG_A_TOKEN, ORG_B_TOKEN
        if not ORG_A_TOKEN or not ORG_B_TOKEN:
            return [self.ok(test_id, f"{name} [SKIPPED — ORG_B_TOKEN not set]")]

        # Step 1: Ingest a session as Org A and record its ID
        org_a_session_id = self._make_session_id("anti-qc-orgA")
        self._cleanup_ids.append(org_a_session_id)
        ingest_payload = {
            "sessions": [{
                "session_id": org_a_session_id,
                "agent_id": "test-agent-orgA",
                "outcome": "failure",
                "failure_summary": "Org A private data",
                "llm_calls": [], "tool_calls": [], "retrieval_events": [],
                "trace_source": "synthetic",
            }]
        }
        ingest_resp = await self._post("/api/ingest", ingest_payload, token=ORG_A_TOKEN)
        if ingest_resp.status_code == 429:
            # Rate limiter carry-over from T07.8 burst — not a real finding
            return [self.ok(test_id, f"{name} [SKIPPED — rate limited]")]
        if ingest_resp.status_code != 200:
            return [self.vuln(
                test_id, name, Severity.LOW,
                f"Could not ingest Org A session (HTTP {ingest_resp.status_code}). Test inconclusive.",
                evidence=ingest_resp.text[:100],
            )]

        # Step 2: Request QC for that session ID using Org B's token
        resp = await self._post(
            "/api/qc",
            {"session_ids": [org_a_session_id]},
            token=ORG_B_TOKEN,
        )
        if resp.status_code != 200:
            return [self.ok(test_id, name)]  # Auth rejection is fine

        body = resp.json()
        total = body.get("data", {}).get("metrics", {}).get("total_sessions", 0)
        if total > 0:
            return [self.vuln(
                test_id, name, Severity.CRITICAL,
                "Org B retrieved QC metrics for Org A's session (total_sessions > 0). "
                "Cross-tenant data leakage confirmed.",
                evidence=f"session_id={org_a_session_id}\ntotal_sessions={total}",
                recommendation="Add org_id scoping to /api/qc handler before querying findings.",
            )]
        return [self.ok(test_id, name)]

    # ── T08.3 — Timing oracle ─────────────────────────────────────────────

    async def _test_timing_oracle(self) -> list[VulnerabilityFinding]:
        test_id = "T08.3"
        name = "QC response time is consistent for valid vs invalid session IDs"

        from config import ORG_A_TOKEN
        if not ORG_A_TOKEN:
            return [self.ok(test_id, f"{name} [SKIPPED — ORG_A_TOKEN not set]")]

        # Ingest a known valid session
        known_id = self._make_session_id("anti-qc-timing")
        self._cleanup_ids.append(known_id)
        await self._post("/api/ingest", {"sessions": [{
            "session_id": known_id, "agent_id": "test", "outcome": "failure",
            "failure_summary": "timing test", "llm_calls": [], "tool_calls": [],
            "retrieval_events": [], "trace_source": "synthetic",
        }]}, token=ORG_A_TOKEN)

        random_id = str(uuid.uuid4())

        # Measure timing for valid session ID
        t0 = time.monotonic()
        await self._post("/api/qc", {"session_ids": [known_id]})
        valid_ms = (time.monotonic() - t0) * 1000

        # Measure timing for random (non-existent) session ID
        t1 = time.monotonic()
        await self._post("/api/qc", {"session_ids": [random_id]})
        invalid_ms = (time.monotonic() - t1) * 1000

        diff_ms = abs(valid_ms - invalid_ms)
        if diff_ms > 500:
            return [self.vuln(
                test_id, name, Severity.LOW,
                f"QC response time differs significantly between valid ({valid_ms:.0f}ms) "
                f"and invalid ({invalid_ms:.0f}ms) session IDs (Δ={diff_ms:.0f}ms). "
                "This timing difference could be used to enumerate valid session IDs.",
                evidence=f"valid={valid_ms:.0f}ms  invalid={invalid_ms:.0f}ms  diff={diff_ms:.0f}ms",
                recommendation="Ensure database query always runs even for non-existent IDs.",
            )]
        return [self.ok(test_id, name)]

    # ── T08.4 — Bulk enumeration ──────────────────────────────────────────

    async def _test_bulk_enumeration(self) -> list[VulnerabilityFinding]:
        test_id = "T08.4"
        name = "Bulk enumeration of 100 random session IDs returns no findings"

        random_ids = [str(uuid.uuid4()) for _ in range(100)]
        resp = await self._post("/api/qc", {"session_ids": random_ids})

        if resp.status_code in (400, 429):
            # 400 = server rejects oversized batch; 429 = rate limited — neither is a disclosure
            return [self.ok(test_id, name)]
        if resp.status_code != 200:
            return [self.vuln(
                test_id, name, Severity.LOW,
                f"Bulk /api/qc with 100 random IDs returned HTTP {resp.status_code}.",
                evidence=resp.text[:100],
            )]

        body = resp.json()
        total = body.get("data", {}).get("metrics", {}).get("total_sessions", 0)
        if total > 0:
            return [self.vuln(
                test_id, name, Severity.HIGH,
                f"Bulk /api/qc with 100 random UUIDs returned {total} session(s). "
                "Possible session ID collision or missing org_id filter.",
                evidence=str(body.get("data", {}))[:200],
            )]
        return [self.ok(test_id, name)]
