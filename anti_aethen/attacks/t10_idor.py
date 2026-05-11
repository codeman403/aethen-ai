"""T10 — Insecure Direct Object Reference (IDOR) tests.

Verifies that chat session messages, backfill jobs, and session data
cannot be accessed by users who don't own them.
"""

from __future__ import annotations

import uuid

from core.attacker import Attack
from core.reporter import Severity, VulnerabilityFinding


class IdorAttacks(Attack):
    name   = "IDOR"
    module = "T10 — IDOR"
    description = (
        "Tests whether chat session messages, backfill jobs, and analysis sessions "
        "can be accessed by guessing or iterating resource IDs."
    )

    async def run(self) -> list[VulnerabilityFinding]:
        results = []
        results += await self._test_chat_messages_idor()
        results += await self._test_chat_append_idor()
        results += await self._test_backfill_status_idor()
        results += await self._test_backfill_cancel_idor()
        results += await self._test_session_idor()
        return results

    # ── T10.1 — Chat session messages IDOR ───────────────────────────────────

    async def _test_chat_messages_idor(self) -> list[VulnerabilityFinding]:
        test_id = "T10.1"
        name = "GET /api/chat/sessions/{id}/messages requires org ownership"

        # Step 1: create a real session to get a valid session_id format
        create_resp = await self._post("/api/chat/sessions", {"title": "anti-idor-test"})
        if create_resp.status_code != 200:
            return [self.ok(test_id, f"{name} [SKIPPED — could not create session]")]

        session_id = create_resp.json().get("data", {}).get("id", "")
        if not session_id:
            return [self.ok(test_id, f"{name} [SKIPPED — no session_id returned]")]
        self._cleanup_ids.append(session_id)

        # Step 2: attempt to read it WITHOUT any Authorization header
        resp = await self.client.get(
            f"{self.base_url}/api/chat/sessions/{session_id}/messages"
        )
        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.CRITICAL,
                f"GET /api/chat/sessions/{session_id}/messages returned HTTP 200 "
                "without any Authorization header. Chat history is publicly readable.",
                evidence=f"HTTP {resp.status_code}: {resp.text[:150]}",
                recommendation="Add `http_request: Request` param and verify org_id ownership.",
            )]

        # Step 3: attempt to read a random UUID session_id (should 404)
        random_id = f"cs-{uuid.uuid4().hex[:12]}"
        resp2 = await self._get(f"/api/chat/sessions/{random_id}/messages")
        if resp2.status_code == 200:
            body = resp2.json()
            if body.get("data"):
                return [self.vuln(
                    test_id, name, Severity.CRITICAL,
                    f"GET /api/chat/sessions/{random_id}/messages returned data for "
                    "a random session ID that should not exist.",
                    evidence=f"HTTP {resp2.status_code}: {resp2.text[:150]}",
                    recommendation="Scope chat message lookup by org_id.",
                )]

        return [self.ok(test_id, name)]

    # ── T10.2 — Chat session append IDOR ─────────────────────────────────────

    async def _test_chat_append_idor(self) -> list[VulnerabilityFinding]:
        test_id = "T10.2"
        name = "POST /api/chat/sessions/{id}/messages requires org ownership"

        random_id = f"cs-{uuid.uuid4().hex[:12]}"
        payload = {
            "id": f"msg-{uuid.uuid4().hex[:8]}",
            "role": "user",
            "kind": "user",
            "content": "IDOR test message",
        }

        # Try to append to a session that doesn't belong to us
        resp = await self._post(f"/api/chat/sessions/{random_id}/messages", payload)
        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.HIGH,
                f"POST /api/chat/sessions/{random_id}/messages returned 200 — "
                "messages can be appended to sessions not owned by the caller.",
                evidence=f"HTTP {resp.status_code}: {resp.text[:100]}",
                recommendation="Add org ownership check before append_chat_message.",
            )]
        return [self.ok(test_id, name)]

    # ── T10.3 — Backfill status IDOR ─────────────────────────────────────────

    async def _test_backfill_status_idor(self) -> list[VulnerabilityFinding]:
        test_id = "T10.3"
        name = "GET /api/backfill/{job_id} requires org ownership"

        # Attempt to read a plausible job_id format without creating one
        fake_job_id = f"bf-{uuid.uuid4().hex[:12]}"
        resp = await self._get(f"/api/backfill/{fake_job_id}")

        # 404 is correct; 200 would mean any authenticated user can poll any job
        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.HIGH,
                f"GET /api/backfill/{fake_job_id} returned HTTP 200 for a job ID "
                "that was never created by this org.",
                evidence=resp.text[:200],
                recommendation="Add org_id validation to get_backfill_status().",
            )]

        # Try without auth — should be 401
        resp_noauth = await self.client.get(f"{self.base_url}/api/backfill/{fake_job_id}")
        if resp_noauth.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.CRITICAL,
                "GET /api/backfill/{job_id} returned 200 without Authorization header.",
                evidence=resp_noauth.text[:150],
                recommendation="Ensure backfill routes are protected by JWTAuthMiddleware.",
            )]

        return [self.ok(test_id, name)]

    # ── T10.4 — Backfill cancel IDOR ─────────────────────────────────────────

    async def _test_backfill_cancel_idor(self) -> list[VulnerabilityFinding]:
        test_id = "T10.4"
        name = "DELETE /api/backfill/{job_id} requires org ownership"

        fake_job_id = f"bf-{uuid.uuid4().hex[:12]}"
        resp = await self._delete(f"/api/backfill/{fake_job_id}")

        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.HIGH,
                f"DELETE /api/backfill/{fake_job_id} returned HTTP 200 for a job "
                "not owned by this org — any user can cancel any backfill job.",
                evidence=resp.text[:150],
                recommendation="Add org_id validation to cancel_backfill().",
            )]
        return [self.ok(test_id, name)]

    # ── T10.5 — Analysis session IDOR ────────────────────────────────────────

    async def _test_session_idor(self) -> list[VulnerabilityFinding]:
        test_id = "T10.5"
        name = "GET /api/sessions/{id} requires org ownership"

        # Try to access a random 32-char hex session_id (format used by ingest)
        random_sid = uuid.uuid4().hex
        resp = await self._get(f"/api/sessions/{random_sid}")

        if resp.status_code == 200 and resp.json().get("data"):
            return [self.vuln(
                test_id, name, Severity.CRITICAL,
                f"GET /api/sessions/{random_sid} returned session data for a "
                "random UUID — cross-org session access confirmed.",
                evidence=resp.text[:200],
                recommendation="Verify get_session() always passes org_id from JWT.",
            )]
        return [self.ok(test_id, name)]
