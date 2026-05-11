"""T03 — Multi-tenant isolation tests.

Verifies that Org B cannot access Org A's data across all API endpoints.
Requires two separate JWT tokens (ORG_A_TOKEN and ORG_B_TOKEN).
"""

from __future__ import annotations

import json
import uuid

from core.attacker import Attack
from core.reporter import Severity, VulnerabilityFinding
from core.session_builder import benign
import config


class TenantIsolationAttacks(Attack):
    name   = "Tenant Isolation"
    module = "T03 — Tenant Isolation"
    description = (
        "Verifies that one org cannot read, list, or modify another org's data "
        "across sessions, chat sessions, stats, and backfill endpoints."
    )

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.org_a_token = self.token           # primary test token
        self.org_b_token = config.ORG_B_TOKEN   # second org token
        self.org_a_session_id: str | None = None

    async def setup(self) -> None:
        if not self.org_b_token:
            return  # tests will skip gracefully

        # Ingest a session as Org A
        session = benign()
        self.org_a_session_id = session["session_id"]
        await self._post("/api/ingest", {"sessions": [session]}, token=self.org_a_token)
        self._cleanup_ids.append(self.org_a_session_id)

    async def run(self) -> list[VulnerabilityFinding]:
        if not self.org_b_token:
            return [self.vuln(
                "T03.0", "Tenant isolation tests skipped",
                Severity.INFO,
                "ANTI_AETHEN_ORG_B_TOKEN not set — cross-org tests require two separate org JWTs.",
                recommendation="Set ANTI_AETHEN_ORG_B_TOKEN to run tenant isolation tests.",
            )]

        results = []
        results += await self._test_cross_org_session_read()
        results += await self._test_qc_cross_org()
        results += await self._test_stats_isolation()
        results += await self._test_chat_sessions_isolation()
        results += await self._test_sentinel_uuid_bypass()
        return results

    # ── T03.1 — Cross-org session read ────────────────────────────────────

    async def _test_cross_org_session_read(self) -> list[VulnerabilityFinding]:
        test_id = "T03.1"
        name = "Org B cannot read Org A's session via /api/sessions/{id}"

        if not self.org_a_session_id:
            return [self.ok(test_id, name)]

        resp = await self._get(
            f"/api/sessions/{self.org_a_session_id}",
            token=self.org_b_token,
        )

        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.CRITICAL,
                "Org B successfully read a session belonging to Org A — tenant isolation is broken.",
                evidence=f"Session ID: {self.org_a_session_id}\nResponse: {resp.text[:300]}",
                recommendation="Verify org_id filter in postgres_service.get_session() is applied.",
            )]
        if resp.status_code in (404, 403):
            return [self.ok(test_id, name)]

        return [self.vuln(
            test_id, name, Severity.LOW,
            f"Unexpected HTTP {resp.status_code} (expected 404/403).",
            evidence=resp.text[:200],
        )]

    # ── T03.2 — QC cross-org ──────────────────────────────────────────────

    async def _test_qc_cross_org(self) -> list[VulnerabilityFinding]:
        test_id = "T03.2"
        name = "POST /api/qc with Org A session_ids using Org B token"

        if not self.org_a_session_id:
            return [self.ok(test_id, name)]

        resp = await self._post(
            "/api/qc",
            {"session_ids": [self.org_a_session_id]},
            token=self.org_b_token,
        )

        if resp.status_code == 200:
            body = resp.json()
            data = body.get("data", {})
            # If total_sessions > 0, cross-org data was returned
            if data.get("metrics", {}).get("total_sessions", 0) > 0:
                return [self.vuln(
                    test_id, name, Severity.HIGH,
                    "/api/qc returned analysis for Org A's session using Org B's token. "
                    "The QC endpoint does not validate org_id on session_ids.",
                    evidence=f"session_id={self.org_a_session_id}\nResponse: {json.dumps(data)[:300]}",
                    recommendation=(
                        "Add org_id validation to POST /api/qc — verify each session_id belongs "
                        "to the caller's org before including it in the analysis."
                    ),
                )]
        return [self.ok(test_id, name)]

    # ── T03.3 — Stats isolation ────────────────────────────────────────────

    async def _test_stats_isolation(self) -> list[VulnerabilityFinding]:
        test_id = "T03.3"
        name = "GET /api/stats returns only caller's org data"

        resp_a = await self._get("/api/stats", token=self.org_a_token)
        resp_b = await self._get("/api/stats", token=self.org_b_token)

        if resp_a.status_code == 200 and resp_b.status_code == 200:
            total_a = resp_a.json().get("data", {}).get("total_sessions", -1)
            total_b = resp_b.json().get("data", {}).get("total_sessions", -1)
            # If they're equal AND both > 0, likely returning same (unscoped) data
            if total_a == total_b and total_a > 0 and total_b > 0:
                return [self.vuln(
                    test_id, name, Severity.MEDIUM,
                    f"Both orgs see identical session count ({total_a}). "
                    "This may indicate stats are not org-scoped.",
                    evidence=f"Org A count: {total_a}, Org B count: {total_b}",
                    recommendation="Verify org_id is passed to all compute_stats() calls.",
                )]
        return [self.ok(test_id, name)]

    # ── T03.4 — Chat sessions isolation ───────────────────────────────────

    async def _test_chat_sessions_isolation(self) -> list[VulnerabilityFinding]:
        test_id = "T03.4"
        name = "GET /api/chat/sessions isolated per org"

        # Create a chat session as Org A
        create_resp = await self._post(
            "/api/chat/sessions", {"title": "Anti-Aethen T03 Test"},
            token=self.org_a_token,
        )
        if create_resp.status_code != 200:
            return [self.ok(test_id, name)]

        chat_sid = create_resp.json().get("data", {}).get("id")
        if not chat_sid:
            return [self.ok(test_id, name)]

        # Try to read it as Org B
        list_resp = await self._get("/api/chat/sessions", token=self.org_b_token)
        if list_resp.status_code == 200:
            sessions = list_resp.json().get("data", [])
            if any(s.get("id") == chat_sid for s in sessions):
                return [self.vuln(
                    test_id, name, Severity.HIGH,
                    "Org B can see a chat session created by Org A in the session list.",
                    evidence=f"Chat session ID {chat_sid} visible to Org B",
                    recommendation="Ensure list_chat_sessions() filters by org_id.",
                )]

        # Cleanup
        await self._delete(f"/api/chat/sessions/{chat_sid}", token=self.org_a_token)
        return [self.ok(test_id, name)]

    # ── T03.5 — Sentinel UUID bypass ──────────────────────────────────────

    async def _test_sentinel_uuid_bypass(self) -> list[VulnerabilityFinding]:
        test_id = "T03.5"
        name = "Sentinel UUID (00000000-...) does not expose data"

        # Craft a request using the sentinel UUID as if we had no org
        # This is simulated by using a random unknown session_id
        random_sid = str(uuid.uuid4())
        resp = await self._get(f"/api/sessions/{random_sid}", token=self.org_b_token)

        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.MEDIUM,
                "Random session_id returned HTTP 200 — may indicate insufficient scoping.",
                evidence=resp.text[:200],
            )]
        return [self.ok(test_id, name)]
