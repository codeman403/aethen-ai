"""T11 — Security headers and JWT algorithm confusion tests."""

from __future__ import annotations

import base64
import json

from core.attacker import Attack
from core.reporter import Severity, VulnerabilityFinding


class SecurityHeadersAttacks(Attack):
    name   = "Security Headers"
    module = "T11 — Security Headers"
    description = (
        "Tests for missing defensive HTTP headers (X-Frame-Options, CSP, etc.) "
        "and JWT algorithm confusion attacks."
    )

    async def run(self) -> list[VulnerabilityFinding]:
        results = []
        results += await self._test_x_frame_options()
        results += await self._test_x_content_type_options()
        results += await self._test_csp()
        results += await self._test_jwt_alg_none()
        results += await self._test_jwt_rs256_to_hs256()
        return results

    async def _get_headers(self) -> dict:
        resp = await self.client.get(f"{self.base_url}/api/health")
        return dict(resp.headers)

    # ── T11.1 — X-Frame-Options ───────────────────────────────────────────────

    async def _test_x_frame_options(self) -> list[VulnerabilityFinding]:
        test_id = "T11.1"
        name = "X-Frame-Options header prevents clickjacking"

        headers = await self._get_headers()
        xfo = headers.get("x-frame-options", "")
        if not xfo:
            return [self.vuln(
                test_id, name, Severity.MEDIUM,
                "X-Frame-Options header is missing. The API can be embedded in an "
                "iframe, enabling clickjacking attacks against browser-based clients.",
                evidence="Header absent on GET /api/health",
                recommendation="Add `X-Frame-Options: DENY` via SecurityHeadersMiddleware.",
            )]
        return [self.ok(test_id, name)]

    # ── T11.2 — X-Content-Type-Options ───────────────────────────────────────

    async def _test_x_content_type_options(self) -> list[VulnerabilityFinding]:
        test_id = "T11.2"
        name = "X-Content-Type-Options prevents MIME sniffing"

        headers = await self._get_headers()
        xcto = headers.get("x-content-type-options", "")
        if xcto.lower() != "nosniff":
            return [self.vuln(
                test_id, name, Severity.MEDIUM,
                f"X-Content-Type-Options is '{xcto or 'absent'}'. "
                "Browsers may MIME-sniff responses, enabling content injection.",
                evidence=f"x-content-type-options: {xcto!r}",
                recommendation="Add `X-Content-Type-Options: nosniff` to all responses.",
            )]
        return [self.ok(test_id, name)]

    # ── T11.3 — Content-Security-Policy ──────────────────────────────────────

    async def _test_csp(self) -> list[VulnerabilityFinding]:
        test_id = "T11.3"
        name = "Content-Security-Policy header is present"

        headers = await self._get_headers()
        csp = headers.get("content-security-policy", "")
        if not csp:
            return [self.vuln(
                test_id, name, Severity.MEDIUM,
                "Content-Security-Policy header is missing. Without CSP, "
                "XSS payloads can execute scripts from arbitrary origins.",
                evidence="Header absent on GET /api/health",
                recommendation="Add a restrictive CSP via SecurityHeadersMiddleware.",
            )]
        return [self.ok(test_id, name)]

    # ── T11.4 — JWT alg:none ─────────────────────────────────────────────────

    async def _test_jwt_alg_none(self) -> list[VulnerabilityFinding]:
        test_id = "T11.4"
        name = "JWT with alg:none is rejected"

        # Craft a JWT with alg:none — no signature required
        header  = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode()
        ).rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(
            json.dumps({"sub": "attacker", "role": "admin"}).encode()
        ).rstrip(b"=").decode()
        # alg:none JWT has empty signature
        alg_none_token = f"{header}.{payload}."

        resp = await self.client.get(
            f"{self.base_url}/api/stats",
            headers={"Authorization": f"Bearer {alg_none_token}"},
        )
        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.CRITICAL,
                "JWT with alg:none was accepted. An attacker can forge arbitrary "
                "tokens without knowing the signing secret.",
                evidence=f"Token: {alg_none_token[:60]}...\nHTTP {resp.status_code}",
                recommendation="Ensure token verification rejects alg:none explicitly "
                               "(Supabase API verification already does this; check middleware).",
            )]
        return [self.ok(test_id, name)]

    # ── T11.5 — RS256 → HS256 confusion ─────────────────────────────────────

    async def _test_jwt_rs256_to_hs256(self) -> list[VulnerabilityFinding]:
        test_id = "T11.5"
        name = "RS256→HS256 algorithm confusion JWT is rejected"

        # In this attack the public key is used as the HMAC secret.
        # We don't know the real public key, so we craft a plausible-looking
        # HS256 token signed with an empty secret — the server should reject it.
        header  = base64.urlsafe_b64encode(
            json.dumps({"alg": "HS256", "typ": "JWT"}).encode()
        ).rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(
            json.dumps({"sub": "attacker", "aud": "authenticated"}).encode()
        ).rstrip(b"=").decode()
        fake_sig = base64.urlsafe_b64encode(b"fakesignature1234").rstrip(b"=").decode()
        confused_token = f"{header}.{payload}.{fake_sig}"

        resp = await self.client.get(
            f"{self.base_url}/api/stats",
            headers={"Authorization": f"Bearer {confused_token}"},
        )
        if resp.status_code == 200:
            return [self.vuln(
                test_id, name, Severity.CRITICAL,
                "HS256 token with fake signature was accepted. "
                "Algorithm confusion attack may be possible.",
                evidence=f"HTTP {resp.status_code}",
                recommendation="Use Supabase API verification, not local PyJWT, for all token checks.",
            )]
        return [self.ok(test_id, name)]
