"""Tests for the health check endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_check_returns_200() -> None:
    """Health endpoint should return 200 with healthy status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["status"] == "healthy"
    assert body["error"] is None


@pytest.mark.asyncio
async def test_health_check_response_envelope() -> None:
    """Health endpoint should follow the standard response envelope."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    body = response.json()
    assert "data" in body
    assert "error" in body
