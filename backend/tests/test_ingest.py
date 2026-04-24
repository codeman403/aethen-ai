"""Tests for the trace ingestion endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def sample_session() -> dict:
    """A minimal valid session payload for testing."""
    return {
        "session_id": "test-session-001",
        "agent_id": "test-agent",
        "outcome": "failure",
        "failure_type": "memory",
        "failure_summary": "Retrieved stale embeddings for user query",
        "llm_calls": [
            {
                "call_id": "llm-001",
                "model": "claude-3.5-sonnet",
                "prompt": "Analyze the user query about billing",
                "response": "Based on the retrieved context, the billing system...",
                "tokens_in": 150,
                "tokens_out": 200,
                "latency_ms": 1200.0,
                "hallucination_flag": False,
            }
        ],
        "tool_calls": [
            {
                "call_id": "tool-001",
                "tool_name": "search_knowledge_base",
                "parameters": {"query": "billing issue", "top_k": 5},
                "result": "Found 5 results",
                "status": "success",
                "latency_ms": 350.0,
            }
        ],
        "retrieval_events": [
            {
                "event_id": "ret-001",
                "query": "billing issue resolution",
                "namespace": "support-docs",
                "chunks_returned": 5,
                "relevance_scores": [0.92, 0.87, 0.65, 0.43, 0.21],
                "expected_doc_ids": ["doc-1", "doc-2"],
                "actual_doc_ids": ["doc-3", "doc-4"],
            }
        ],
    }


@pytest.mark.asyncio
async def test_ingest_valid_session(sample_session: dict) -> None:
    """Ingest endpoint should accept a valid session and return success."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/ingest", json={"sessions": [sample_session]})

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["sessions_ingested"] == 1
    assert body["data"]["events_processed"] == 3  # 1 llm + 1 tool + 1 retrieval


@pytest.mark.asyncio
async def test_ingest_empty_sessions_rejected() -> None:
    """Ingest endpoint should reject an empty sessions list."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/ingest", json={"sessions": []})

    assert response.status_code == 422  # Validation error (min_length=1)


@pytest.mark.asyncio
async def test_ingest_multiple_sessions(sample_session: dict) -> None:
    """Ingest endpoint should handle multiple sessions in one request."""
    session2 = sample_session.copy()
    session2["session_id"] = "test-session-002"
    session2["failure_type"] = "tool_misfire"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/ingest", json={"sessions": [sample_session, session2]})

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["sessions_ingested"] == 2
    assert body["data"]["events_processed"] == 6


@pytest.mark.asyncio
async def test_ingest_response_envelope(sample_session: dict) -> None:
    """Ingest response should follow the standard API envelope."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/ingest", json={"sessions": [sample_session]})

    body = response.json()
    assert "data" in body
    assert "error" in body
    assert "sessions_ingested" in body["data"]
    assert "events_processed" in body["data"]
    assert "errors" in body["data"]
