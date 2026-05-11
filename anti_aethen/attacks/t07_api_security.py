"""T07 — API security tests: auth, rate limiting, payload size, CORS."""

from __future__ import annotations

import asyncio
import time

import httpx

from core.attacker import Attack
from core.reporter import Severity, VulnerabilityFinding


class ApiSecurityAttacks(Attack):
    name   = "API Security"
    module = "T07 — API Security"
    description = (
        "Tests JWT validation, rate limiting, oversized payloads, "
        "CORS headers, and open endpoint enumeration."
    )

    async def run(self) -> list[VulnerabilityFinding]:
        results = []
        results += await self._test_no_auth_header()
        results += await self._test_malformed_jwt()
        results += await self._test_empty_bearer()
        results += await self._test_open_endpoints_accessible()
        results += await self._test_protected_endpoints_blocked()
        results += await self._test_cors_headers()
        results += await self._test_oversized_payload()
        results += await self._test_rate_limit()
        results += await self._test_path_traversal()
        return results

    # ── T07.1 — No auth header ─────────────────────────────────────────────

    async def _test_no_auth_header(self) -> list[VulnerabilityFinding]:
        test_id = "T07.1"
        name = "Protected endpoint returns 401 without Authorization header"

        resp = await self.client.get(f"{self.base_url}/api/stats")
        if resp.status_code == 401:
            return [self.ok(test_id, name)]
        return [self.vuln(
            test_id, name, Severity.CRITICAL,
            f"GET /api/stats returned HTTP {resp.status_code} without any Authorization header.",
            evidence=resp.text[:200],
            recommendation="Ensure JWTAuthMiddleware intercepts all /api/* paths except open paths.",
        )]

    # ── T07.2 — Malformed JWT ─────────────────────────────────────────────

    async def _test_malformed_jwt(self) -> list[VulnerabilityFinding]:
        test_id = "T07.2"
        name = "Malformed JWT returns 401"

        for label, bad_token in [
            ("truncated",  "eyJhbGciOiJIUzI1NiJ9.TRUNCATED"),
            ("wrong_sig",  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.BADSIG"),
            ("not_a_jwt",  "not-a-real-token"),
        ]:
            try:
                resp = await self.client.get(
                    f"{self.base_url}/api/stats",
                    headers={"Authorization": f"Bearer {bad_token}"},
                )
            except Exception as exc:
                return [self.vuln(
                    test_id, name, Severity.LOW,
                    f"Malformed JWT ({label}) caused client-side error: {exc}",
                    evidence=str(exc),
                )]
            if resp.status_code not in (401, 403):
                return [self.vuln(
                    test_id, name, Severity.HIGH,
                    f"Malformed JWT ({label}) returned HTTP {resp.status_code} instead of 401.",
                    evidence=f"Token: {bad_token[:40]!r}\nResponse: {resp.text[:100]}",
                    recommendation="Verify Supabase token verification rejects malformed tokens.",
                )]
        return [self.ok(test_id, name)]

    # ── T07.3 — Empty Bearer ──────────────────────────────────────────────

    async def _test_empty_bearer(self) -> list[VulnerabilityFinding]:
        test_id = "T07.3"
        name = "Empty Bearer token returns 401"

        # "Bearer " (trailing space only) is rejected by strict HTTP stacks before
        # reaching the server — send "Bearer x" with a clearly invalid single char
        # to test the server's own validation instead.
        try:
            resp = await self.client.get(
                f"{self.base_url}/api/stats",
                headers={"Authorization": "Bearer x"},
            )
        except Exception as exc:
            return [self.vuln(test_id, name, Severity.LOW, str(exc))]
        if resp.status_code not in (401, 403):
            return [self.vuln(
                test_id, name, Severity.HIGH,
                f"Minimal invalid Bearer token 'x' returned HTTP {resp.status_code}.",
                evidence=resp.text[:100],
            )]
        return [self.ok(test_id, name)]

    # ── T07.4 — Open endpoints accessible ────────────────────────────────

    async def _test_open_endpoints_accessible(self) -> list[VulnerabilityFinding]:
        test_id = "T07.4"
        name = "Open endpoints accessible without auth"

        for path in ["/api/health", "/api/demo/scenarios", "/docs", "/openapi.json"]:
            resp = await self.client.get(f"{self.base_url}{path}")
            if resp.status_code not in (200, 307):
                return [self.vuln(
                    test_id, name, Severity.MEDIUM,
                    f"Open endpoint {path} returned HTTP {resp.status_code} — may be misconfigured.",
                    evidence=resp.text[:100],
                )]
        return [self.ok(test_id, name)]

    # ── T07.5 — Protected endpoints blocked ──────────────────────────────

    async def _test_protected_endpoints_blocked(self) -> list[VulnerabilityFinding]:
        test_id = "T07.5"
        name = "Protected endpoints blocked without auth"

        for path in ["/api/stats", "/api/sessions", "/api/chat/sessions"]:
            resp = await self.client.get(f"{self.base_url}{path}")
            if resp.status_code not in (401, 403):
                return [self.vuln(
                    test_id, name, Severity.CRITICAL,
                    f"Protected endpoint {path} returned HTTP {resp.status_code} without auth.",
                    evidence=resp.text[:100],
                    recommendation=f"Verify {path} is not in _OPEN_PATHS.",
                )]
        return [self.ok(test_id, name)]

    # ── T07.6 — CORS headers ──────────────────────────────────────────────

    async def _test_cors_headers(self) -> list[VulnerabilityFinding]:
        test_id = "T07.6"
        name = "CORS does not allow arbitrary origins"

        resp = await self.client.options(
            f"{self.base_url}/api/health",
            headers={
                "Origin": "https://evil-attacker.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        cors_origin = resp.headers.get("access-control-allow-origin", "")
        if cors_origin == "*" or cors_origin == "https://evil-attacker.com":
            return [self.vuln(
                test_id, name, Severity.HIGH,
                f"CORS allows arbitrary origin: '{cors_origin}'. "
                "Attackers can make cross-origin requests from any domain.",
                evidence=f"access-control-allow-origin: {cors_origin}",
                recommendation="Restrict CORS to specific allowed origins only.",
            )]
        return [self.ok(test_id, name)]

    # ── T07.7 — Oversized payload ─────────────────────────────────────────

    async def _test_oversized_payload(self) -> list[VulnerabilityFinding]:
        test_id = "T07.7"
        name = "Oversized payload (5MB) rejected gracefully"

        huge_session = {
            "session_id": "anti-huge-session",
            "agent_id": "test",
            "outcome": "failure",
            "failure_summary": "X" * 5_000_000,   # 5MB string
            "llm_calls": [], "tool_calls": [], "retrieval_events": [],
            "trace_source": "synthetic",
        }
        try:
            resp = await self._post("/api/ingest", {"sessions": [huge_session]})
            if resp.status_code == 200:
                return [self.vuln(
                    test_id, name, Severity.MEDIUM,
                    "5MB payload was accepted — no size limit enforced on /api/ingest.",
                    evidence=f"HTTP {resp.status_code}",
                    recommendation="Add request body size limit (e.g. 1MB) in FastAPI middleware.",
                )]
        except Exception as e:
            if "timeout" in str(e).lower():
                return [self.vuln(
                    test_id, name, Severity.LOW,
                    "Request timed out on oversized payload — no explicit size rejection.",
                    evidence=str(e),
                )]
        return [self.ok(test_id, name)]

    # ── T07.8 — Rate limit ────────────────────────────────────────────────

    async def _test_rate_limit(self) -> list[VulnerabilityFinding]:
        test_id = "T07.8"
        name = "Rate limiting fires at 100 req/min"

        # /api/health is intentionally excluded from rate limiting (load-balancer probes).
        # Use /api/stats — a protected, rate-limited endpoint — to verify the limiter fires.
        statuses = []
        for _ in range(110):
            r = await self.client.get(
                f"{self.base_url}/api/stats",
                headers=self._headers(),
            )
            statuses.append(r.status_code)

        rate_limited = statuses.count(429)
        if rate_limited == 0:
            return [self.vuln(
                test_id, name, Severity.MEDIUM,
                "Sent 110 requests in < 1 minute but received no 429 responses. "
                "Rate limiting may not be enforced or the limit is higher than expected.",
                evidence=f"Status code distribution: {set(statuses)}",
                recommendation="Verify RateLimitMiddleware per_minute=100 is active.",
            )]
        return [self.ok(test_id, name)]

    # ── T07.9 — Path traversal ────────────────────────────────────────────

    async def _test_path_traversal(self) -> list[VulnerabilityFinding]:
        test_id = "T07.9"
        name = "Path traversal attempts return 404, not 200"

        for path in [
            "/api/../admin",
            "/api/sessions/../../etc/passwd",
            "/api/%2e%2e/admin",
        ]:
            resp = await self.client.get(
                f"{self.base_url}{path}",
                headers=self._headers(),
            )
            if resp.status_code == 200:
                return [self.vuln(
                    test_id, name, Severity.HIGH,
                    f"Path traversal attempt {path!r} returned HTTP 200.",
                    evidence=resp.text[:200],
                    recommendation="Ensure web framework normalises paths and blocks traversal.",
                )]
        return [self.ok(test_id, name)]
