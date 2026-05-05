"""AethenClient — authenticated HTTP client for the Aethen diagnostic API."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

_MAX_RETRIES = 3
_RETRY_STATUSES = {500, 502, 503, 504}


class AethenClient:
    """Thin client for sending AI agent traces to Aethen for diagnosis.

    Two credential models for Langfuse/LangSmith integration:

    1. Stored source — credentials registered once in Aethen UI (Settings → Integrations).
       Agent identifies the source by name; Aethen looks up credentials internally.

       report = await client.analyze_langfuse_trace(trace_id, source="my-agent")

    2. Per-call — agent passes Langfuse keys directly. Aethen uses them for
       that request only and never stores them.

       report = await client.analyze_langfuse_trace_direct(
           trace_id, public_key=PK, secret_key=SK
       )

    All async methods have sync equivalents (prefix: no `a`).
    """

    def __init__(self, api_url: str, api_key: str = ""):
        self._base = api_url.rstrip("/")
        self._headers = {
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {api_key}"} if api_key else {}),
        }

    # ── Internal HTTP ──────────────────────────────────────────────────────────

    async def _post(self, path: str, body: dict) -> dict:
        url = f"{self._base}{path}"
        async with httpx.AsyncClient(timeout=120) as http:
            for attempt in range(_MAX_RETRIES):
                r = await http.post(url, json=body, headers=self._headers)
                if r.status_code in _RETRY_STATUSES and attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                data = r.json()
                if err := data.get("error"):
                    raise RuntimeError(f"Aethen API error: {err}")
                return data.get("data") or {}
        return {}

    async def _get(self, path: str, params: dict | None = None) -> Any:
        url = f"{self._base}{path}"
        async with httpx.AsyncClient(timeout=30) as http:
            for attempt in range(_MAX_RETRIES):
                r = await http.get(url, params=params or {}, headers=self._headers)
                if r.status_code in _RETRY_STATUSES and attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                data = r.json()
                return data.get("data")
        return None

    # ── Async methods ──────────────────────────────────────────────────────────

    async def analyze_langfuse_trace(self, trace_id: str, source: str = "default") -> dict:
        """Analyze a Langfuse trace using credentials registered in Aethen.

        Args:
            trace_id: Langfuse trace ID.
            source: Registered source name (configured in Settings → Integrations).

        Returns:
            AnalysisReport dict with failure_type, root_cause, findings, confidence.
        """
        return await self._post("/api/langfuse/trace", {
            "trace_id": trace_id,
            "source": source,
            "analyze": True,
        })

    async def analyze_langfuse_trace_direct(
        self,
        trace_id: str,
        public_key: str,
        secret_key: str,
        base_url: str = "",
    ) -> dict:
        """Analyze a Langfuse trace with per-call credentials (not stored by Aethen).

        Args:
            trace_id: Langfuse trace ID.
            public_key: Langfuse public key.
            secret_key: Langfuse secret key — used for this call only, discarded immediately.
            base_url: Optional self-hosted Langfuse URL.

        Returns:
            AnalysisReport dict.
        """
        return await self._post("/api/analyze/raw", {
            "format": "langfuse",
            "trace_id": trace_id,
            "public_key": public_key,
            "secret_key": secret_key,
            "base_url": base_url,
            "analyze": True,
        })

    async def analyze_langsmith_run(self, run_id: str, source: str = "default") -> dict:
        """Analyze a LangSmith run using credentials registered in Aethen.

        Args:
            run_id: LangSmith run ID.
            source: Registered source name.

        Returns:
            AnalysisReport dict.
        """
        return await self._post("/api/langfuse/trace", {
            "trace_id": run_id,
            "source": source,
            "analyze": True,
        })

    async def analyze_langsmith_run_direct(self, run_id: str, api_key: str) -> dict:
        """Analyze a LangSmith run with per-call credentials.

        Args:
            run_id: LangSmith run ID.
            api_key: LangSmith API key — used once, not stored.

        Returns:
            AnalysisReport dict.
        """
        return await self._post("/api/analyze/raw", {
            "format": "langsmith",
            "trace_id": run_id,
            "secret_key": api_key,
            "analyze": True,
        })

    async def analyze_session(self, session: dict) -> dict:
        """Ingest and analyze a raw Aethen Session dict.

        For agents with custom observability not using Langfuse/LangSmith.

        Args:
            session: Dict matching the Aethen Session schema.

        Returns:
            AnalysisReport dict.
        """
        return await self._post("/api/analyze/raw", {
            "format": "session",
            "session": session,
            "analyze": True,
        })

    async def get_report(self, session_id: str) -> dict | None:
        """Retrieve a cached AnalysisReport without re-running the pipeline.

        Args:
            session_id: Aethen session ID.

        Returns:
            AnalysisReport dict or None if not yet analyzed.
        """
        data = await self._get(f"/api/sessions/{session_id}")
        if not data:
            return None
        return data.get("analysis_report")

    async def get_stats(self) -> dict:
        """Return overall system reliability statistics.

        Returns:
            Dict with total_sessions, failure_breakdown, reliability_score.
        """
        return await self._get("/api/stats") or {}

    # ── Sync wrappers ──────────────────────────────────────────────────────────

    def analyze_langfuse_trace_sync(self, trace_id: str, source: str = "default") -> dict:
        return asyncio.run(self.analyze_langfuse_trace(trace_id, source))

    def analyze_langfuse_trace_direct_sync(
        self, trace_id: str, public_key: str, secret_key: str, base_url: str = ""
    ) -> dict:
        return asyncio.run(self.analyze_langfuse_trace_direct(trace_id, public_key, secret_key, base_url))

    def analyze_langsmith_run_direct_sync(self, run_id: str, api_key: str) -> dict:
        return asyncio.run(self.analyze_langsmith_run_direct(run_id, api_key))

    def get_report_sync(self, session_id: str) -> dict | None:
        return asyncio.run(self.get_report(session_id))

    def get_stats_sync(self) -> dict:
        return asyncio.run(self.get_stats())
