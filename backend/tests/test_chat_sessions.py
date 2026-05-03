"""Tests for chat session CRUD endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.main import app

_SESSION = {"id": "cs-abc123", "title": "Test Session", "created_at": "2026-04-28T10:00:00Z", "updated_at": "2026-04-28T10:00:00Z"}
_MESSAGE = {"id": "msg-1", "session_id": "cs-abc123", "role": "user", "kind": "user", "content": "hello", "report": None, "latency_ms": None, "created_at": "2026-04-28T10:00:00Z"}


@pytest.mark.asyncio
async def test_create_chat_session_default_title():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.create_chat_session = AsyncMock(return_value=_SESSION)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/chat/sessions", json={})
    assert resp.status_code == 200
    mock_pg.create_chat_session.assert_called_once()
    # session_id should follow cs-{hex} pattern
    call_args = mock_pg.create_chat_session.call_args[0]
    assert call_args[0].startswith("cs-")


@pytest.mark.asyncio
async def test_create_chat_session_custom_title():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.create_chat_session = AsyncMock(return_value=_SESSION)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/chat/sessions", json={"title": "My Debug Session"})
    assert resp.status_code == 200
    call_args = mock_pg.create_chat_session.call_args[0]
    assert call_args[1] == "My Debug Session"


@pytest.mark.asyncio
async def test_list_chat_sessions_returns_list():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.list_chat_sessions = AsyncMock(return_value=[_SESSION])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/chat/sessions")
    assert resp.status_code == 200
    assert isinstance(resp.json()["data"], list)
    assert len(resp.json()["data"]) == 1


@pytest.mark.asyncio
async def test_list_chat_sessions_empty():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.list_chat_sessions = AsyncMock(return_value=[])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/chat/sessions")
    assert resp.json()["data"] == []


@pytest.mark.asyncio
async def test_get_messages_returns_history():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.get_chat_messages = AsyncMock(return_value=[_MESSAGE])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/chat/sessions/cs-abc123/messages")
    assert resp.status_code == 200
    assert len(resp.json()["data"]) == 1
    assert resp.json()["data"][0]["content"] == "hello"


@pytest.mark.asyncio
async def test_get_messages_empty_returns_empty_list():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.get_chat_messages = AsyncMock(return_value=[])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/chat/sessions/cs-abc123/messages")
    assert resp.status_code == 200
    assert resp.json()["data"] == []


@pytest.mark.asyncio
async def test_append_message_user():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.append_chat_message = AsyncMock()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/chat/sessions/cs-abc123/messages", json={
                "id": "msg-1", "role": "user", "kind": "user",
                "content": "diagnose session xyz", "latency_ms": None,
            })
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True
    mock_pg.append_chat_message.assert_called_once()


@pytest.mark.asyncio
async def test_append_message_with_latency():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.append_chat_message = AsyncMock()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            await ac.post("/api/chat/sessions/cs-abc123/messages", json={
                "id": "msg-2", "role": "assistant", "kind": "analysis",
                "content": "Found 3 findings", "latency_ms": 4500.0,
            })
    call_kwargs = mock_pg.append_chat_message.call_args[1]
    assert call_kwargs["latency_ms"] == 4500.0


@pytest.mark.asyncio
async def test_rename_session():
    with patch("app.api.chat_sessions.postgres_service") as mock_pg:
        mock_pg.update_session_title = AsyncMock()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.patch("/api/chat/sessions/cs-abc123", json={"title": "New Title"})
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True
    mock_pg.update_session_title.assert_called_once_with("cs-abc123", "New Title")
