"""Tests for GET /api/sessions and GET /api/sessions/{id}."""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.main import app


_SUMMARY = {
    "session_id": "abc123",
    "agent_id": "agent-1",
    "failure_type": "memory",
    "outcome": "failure",
    "failure_summary": "Wrong chunks returned",
    "timestamp": "2026-04-28T10:00:00Z",
    "llm_calls": 1,
    "tool_calls": 0,
    "retrieval_events": 2,
}

_FULL_SESSION = {
    **_SUMMARY,
    "llm_calls": [{"call_id": "c1", "prompt": "q", "response": "a", "model": "gpt-4o-mini"}],
    "tool_calls": [],
    "retrieval_events": [{"event_id": "r1", "query": "billing", "chunks_returned": 0}],
}


@pytest.mark.asyncio
async def test_list_sessions_all_returns_summaries():
    with patch("app.api.sessions.postgres_service") as mock_pg:
        mock_pg.get_all_summaries = AsyncMock(return_value=[_SUMMARY])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert isinstance(data, list)
    assert data[0]["session_id"] == "abc123"
    mock_pg.get_all_summaries.assert_called_once()


@pytest.mark.asyncio
async def test_list_sessions_empty_returns_empty_list():
    with patch("app.api.sessions.postgres_service") as mock_pg:
        mock_pg.get_all_summaries = AsyncMock(return_value=[])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/sessions")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


@pytest.mark.asyncio
async def test_list_sessions_by_failure_type_returns_full_objects():
    with patch("app.api.sessions.postgres_service") as mock_pg:
        mock_pg.get_by_failure_type = AsyncMock(return_value=[_FULL_SESSION])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/sessions?failure_type=memory")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    mock_pg.get_by_failure_type.assert_called_once_with("memory")


@pytest.mark.asyncio
async def test_get_session_found():
    with patch("app.api.sessions.postgres_service") as mock_pg:
        mock_pg.get_session = AsyncMock(return_value=_FULL_SESSION)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/sessions/abc123")
    assert resp.status_code == 200
    assert resp.json()["data"]["session_id"] == "abc123"


@pytest.mark.asyncio
async def test_get_session_not_found_returns_404():
    with patch("app.api.sessions.postgres_service") as mock_pg:
        mock_pg.get_session = AsyncMock(return_value=None)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/sessions/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_sessions_response_envelope():
    with patch("app.api.sessions.postgres_service") as mock_pg:
        mock_pg.get_all_summaries = AsyncMock(return_value=[_SUMMARY])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/sessions")
    body = resp.json()
    assert "data" in body
    assert "error" in body
