"""Base Attack class and HTTP helpers."""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod

import httpx

from .reporter import Severity, VulnerabilityFinding, finding, passed


class Attack(ABC):
    name:        str = "Unnamed Attack"
    module:      str = ""
    description: str = ""

    def __init__(self, client: httpx.AsyncClient, token: str, base_url: str) -> None:
        self.client   = client
        self.token    = token
        self.base_url = base_url.rstrip("/")
        self._cleanup_ids: list[str] = []   # session IDs to delete after test

    # ── HTTP helpers ───────────────────────────────────────────────────────

    def _headers(self, token: str | None = None) -> dict:
        t = token or self.token
        h = {"Content-Type": "application/json"}
        if t:
            h["Authorization"] = f"Bearer {t}"
        return h

    async def _post(self, path: str, body: dict, token: str | None = None) -> httpx.Response:
        return await self.client.post(
            f"{self.base_url}{path}", json=body, headers=self._headers(token)
        )

    async def _get(self, path: str, token: str | None = None, params: dict | None = None) -> httpx.Response:
        return await self.client.get(
            f"{self.base_url}{path}", headers=self._headers(token), params=params
        )

    async def _delete(self, path: str, token: str | None = None) -> httpx.Response:
        return await self.client.delete(
            f"{self.base_url}{path}", headers=self._headers(token)
        )

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def setup(self) -> None:
        """Optional pre-test setup (ingest seed data, create resources, etc.)"""

    @abstractmethod
    async def run(self) -> list[VulnerabilityFinding]:
        """Execute all tests in this module. Return list of findings."""

    async def teardown(self) -> None:
        """Clean up any sessions/resources created during the test."""
        for sid in self._cleanup_ids:
            try:
                await self._delete(f"/api/sessions/{sid}")
            except Exception:
                pass
        self._cleanup_ids.clear()

    # ── Finding helpers ────────────────────────────────────────────────────

    def ok(self, test_id: str, name: str) -> VulnerabilityFinding:
        return passed(test_id, name, module=self.module)

    def vuln(
        self, test_id: str, name: str, severity: Severity,
        description: str, evidence: str = "", recommendation: str = "",
    ) -> VulnerabilityFinding:
        return finding(
            test_id=test_id, name=name, severity=severity,
            description=description, evidence=evidence,
            recommendation=recommendation, module=self.module,
        )

    # ── Session helpers ────────────────────────────────────────────────────

    def _make_session_id(self, prefix: str = "anti") -> str:
        return f"{prefix}-{uuid.uuid4().hex[:12]}"
