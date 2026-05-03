"""Tests for /api/langsmith/pull and /api/langsmith/health endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.main import app
from app.models.trace import Session, FailureType
import uuid


def _mock_session(source="langsmith") -> Session:
    return Session(
        session_id=str(uuid.uuid4()),
        agent_id="test-agent",
        outcome="failure",
        failure_type=FailureType.TOOL_MISFIRE,
        failure_summary="Tool failed",
        trace_source=source,
    )


class TestLangSmithPullEndpoint:

    @pytest.mark.asyncio
    async def test_pull_returns_503_when_not_configured(self):
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = ""
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/langsmith/pull", json={"limit": 10})
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_pull_returns_empty_when_no_new_traces(self):
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = "test-key"
            mock_settings.langsmith_endpoint = "https://api.smith.langchain.com"
            mock_settings.langsmith_project = "default"
            with patch("app.api.langsmith.postgres_service") as mock_pg:
                mock_pg.get_setting = AsyncMock(return_value=None)
                mock_pg.set_setting = AsyncMock()
                with patch("app.api.langsmith.LangSmithProvider") as MockProvider:
                    mock_prov = MagicMock()
                    mock_prov.fetch_traces = AsyncMock(return_value=[])
                    MockProvider.return_value = mock_prov
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                        resp = await ac.post("/api/langsmith/pull", json={"limit": 10})

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sessions_ingested"] == 0

    @pytest.mark.asyncio
    async def test_pull_ingests_sessions_and_updates_watermark(self):
        sessions = [_mock_session(), _mock_session()]
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = "test-key"
            mock_settings.langsmith_endpoint = "https://api.smith.langchain.com"
            mock_settings.langsmith_project = "default"
            with patch("app.api.langsmith.postgres_service") as mock_pg:
                mock_pg.get_setting = AsyncMock(return_value=None)
                mock_pg.set_setting = AsyncMock()
                mock_pg.save_session = AsyncMock()
                with patch("app.api.langsmith.pinecone_service") as mock_pine:
                    mock_pine.is_available = False
                    with patch("app.api.langsmith.neo4j_service") as mock_neo:
                        mock_neo.is_available = False
                        with patch("app.api.langsmith.LangSmithProvider") as MockProvider:
                            mock_prov = MagicMock()
                            mock_prov.fetch_traces = AsyncMock(return_value=sessions)
                            MockProvider.return_value = mock_prov
                            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                                resp = await ac.post("/api/langsmith/pull", json={"limit": 10})

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sessions_ingested"] == 2
        # Watermark was updated
        mock_pg.set_setting.assert_called_once()
        call_args = mock_pg.set_setting.call_args[0]
        assert call_args[0] == "langsmith_last_pull_at"

    @pytest.mark.asyncio
    async def test_pull_uses_incremental_watermark(self):
        watermark = "2026-01-01T00:00:00+00:00"
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = "test-key"
            mock_settings.langsmith_endpoint = "https://api.smith.langchain.com"
            mock_settings.langsmith_project = "default"
            with patch("app.api.langsmith.postgres_service") as mock_pg:
                mock_pg.get_setting = AsyncMock(return_value=watermark)
                mock_pg.set_setting = AsyncMock()
                with patch("app.api.langsmith.LangSmithProvider") as MockProvider:
                    mock_prov = MagicMock()
                    mock_prov.fetch_traces = AsyncMock(return_value=[])
                    MockProvider.return_value = mock_prov
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                        await ac.post("/api/langsmith/pull", json={"limit": 10})

        # fetch_traces called with since parameter
        call_kwargs = mock_prov.fetch_traces.call_args[1]
        assert call_kwargs["since"] is not None

    @pytest.mark.asyncio
    async def test_pull_response_envelope(self):
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = "test-key"
            mock_settings.langsmith_endpoint = "https://api.smith.langchain.com"
            mock_settings.langsmith_project = "default"
            with patch("app.api.langsmith.postgres_service") as mock_pg:
                mock_pg.get_setting = AsyncMock(return_value=None)
                mock_pg.set_setting = AsyncMock()
                with patch("app.api.langsmith.LangSmithProvider") as MockProvider:
                    mock_prov = MagicMock()
                    mock_prov.fetch_traces = AsyncMock(return_value=[])
                    MockProvider.return_value = mock_prov
                    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                        resp = await ac.post("/api/langsmith/pull", json={"limit": 10})

        body = resp.json()
        assert "data" in body
        assert "error" in body
        assert "metadata" in body


class TestLangSmithHealthEndpoint:

    @pytest.mark.asyncio
    async def test_health_returns_503_when_not_configured(self):
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = ""
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/langsmith/health")
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_health_returns_ok(self):
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = "test-key"
            mock_settings.langsmith_endpoint = "https://api.smith.langchain.com"
            mock_settings.langsmith_project = "default"
            with patch("app.api.langsmith.LangSmithProvider") as MockProvider:
                mock_prov = MagicMock()
                mock_prov.health_check = AsyncMock(return_value={"status": "ok", "detail": "Connected"})
                MockProvider.return_value = mock_prov
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.get("/api/langsmith/health")

        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "ok"

    @pytest.mark.asyncio
    async def test_health_returns_error_on_failure(self):
        with patch("app.api.langsmith.settings") as mock_settings:
            mock_settings.langsmith_api_key = "bad-key"
            mock_settings.langsmith_endpoint = "https://api.smith.langchain.com"
            mock_settings.langsmith_project = "default"
            with patch("app.api.langsmith.LangSmithProvider") as MockProvider:
                mock_prov = MagicMock()
                mock_prov.health_check = AsyncMock(return_value={"status": "error", "detail": "Invalid API key"})
                MockProvider.return_value = mock_prov
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.get("/api/langsmith/health")

        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "error"


class TestTraceSourceField:

    def test_session_has_trace_source_field(self):
        s = Session(session_id="s1", agent_id="a", outcome="success")
        assert s.trace_source == "langfuse"

    def test_langsmith_session_has_correct_source(self):
        s = Session(session_id="s1", agent_id="a", outcome="success", trace_source="langsmith")
        assert s.trace_source == "langsmith"

    def test_all_trace_sources_accepted(self):
        for source in ("langfuse", "langsmith", "demo", "synthetic"):
            s = Session(session_id="s1", agent_id="a", outcome="success", trace_source=source)
            assert s.trace_source == source
