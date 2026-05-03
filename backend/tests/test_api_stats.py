"""Tests for GET /api/stats."""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.main import app

_AGGREGATED = {
    "total_sessions": 100,
    "failure_breakdown": {"memory": 30, "tool_misfire": 20, "hallucination": 15, "blind_spot": 10},
    "recent_sessions": 12,
    "daily_counts": [5, 3, 8, 2, 7, 4, 6],
}


@pytest.mark.asyncio
async def test_stats_returns_correct_totals():
    with patch("app.api.stats.postgres_service") as mock_pg:
        mock_pg.is_available = True
        mock_pg.compute_stats = AsyncMock(return_value=_AGGREGATED)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total_sessions"] == 100
    assert data["failure_breakdown"]["memory"] == 30


@pytest.mark.asyncio
async def test_stats_reliability_score_calculation():
    """reliability_score = round(100 * (total - failed) / total)."""
    with patch("app.api.stats.postgres_service") as mock_pg:
        mock_pg.is_available = True
        mock_pg.compute_stats = AsyncMock(return_value=_AGGREGATED)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/stats")
    data = resp.json()["data"]
    # failed = 30+20+15+10 = 75, total = 100 → score = 25
    assert data["reliability_score"] == 25


@pytest.mark.asyncio
async def test_stats_perfect_reliability_when_no_failures():
    aggregated = {**_AGGREGATED,
                  "failure_breakdown": {"memory": 0, "tool_misfire": 0, "hallucination": 0, "blind_spot": 0}}
    with patch("app.api.stats.postgres_service") as mock_pg:
        mock_pg.is_available = True
        mock_pg.compute_stats = AsyncMock(return_value=aggregated)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/stats")
    assert resp.json()["data"]["reliability_score"] == 100


@pytest.mark.asyncio
async def test_stats_zero_total_returns_100_reliability():
    aggregated = {**_AGGREGATED, "total_sessions": 0,
                  "failure_breakdown": {"memory": 0, "tool_misfire": 0, "hallucination": 0, "blind_spot": 0}}
    with patch("app.api.stats.postgres_service") as mock_pg:
        mock_pg.is_available = True
        mock_pg.compute_stats = AsyncMock(return_value=aggregated)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/stats")
    assert resp.json()["data"]["reliability_score"] == 100


@pytest.mark.asyncio
async def test_stats_postgres_unavailable_returns_defaults():
    with patch("app.api.stats.postgres_service") as mock_pg:
        mock_pg.is_available = False
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total_sessions"] == 0
    assert data["reliability_score"] == 100


@pytest.mark.asyncio
async def test_stats_postgres_error_returns_defaults():
    with patch("app.api.stats.postgres_service") as mock_pg:
        mock_pg.is_available = True
        mock_pg.compute_stats = AsyncMock(side_effect=Exception("DB connection lost"))
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/stats")
    assert resp.status_code == 200
    assert resp.json()["data"]["total_sessions"] == 0


@pytest.mark.asyncio
async def test_stats_daily_counts_has_7_entries():
    with patch("app.api.stats.postgres_service") as mock_pg:
        mock_pg.is_available = True
        mock_pg.compute_stats = AsyncMock(return_value=_AGGREGATED)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/stats")
    assert len(resp.json()["data"]["daily_counts"]) == 7
