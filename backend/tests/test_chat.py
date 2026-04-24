"""Tests for the chat analysis endpoint."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.trace import FailureType


@pytest.fixture
def memory_failure_session() -> dict:
    """A session with memory/retrieval failure traits."""
    return {
        "session_id": "test-chat-001",
        "agent_id": "test-agent",
        "outcome": "failure",
        "failure_type": "memory",
        "failure_summary": "Retrieved stale embeddings — expected doc-1 but got doc-3",
        "llm_calls": [
            {
                "call_id": "llm-001",
                "model": "gpt-4o-mini",
                "prompt": "Answer the user's billing question",
                "response": "Based on the context, billing is handled by...",
                "tokens_in": 200,
                "tokens_out": 150,
                "latency_ms": 900.0,
                "hallucination_flag": False,
                "source_documents": ["doc-3"],
            }
        ],
        "tool_calls": [],
        "retrieval_events": [
            {
                "event_id": "ret-001",
                "query": "how does billing work",
                "namespace": "support-docs",
                "chunks_returned": 3,
                "relevance_scores": [0.45, 0.32, 0.21],
                "expected_doc_ids": ["doc-1", "doc-2"],
                "actual_doc_ids": ["doc-3", "doc-4", "doc-5"],
            }
        ],
    }


@pytest.fixture
def tool_misfire_session() -> dict:
    """A session with tool call failure traits."""
    return {
        "session_id": "test-chat-002",
        "agent_id": "test-agent",
        "outcome": "failure",
        "failure_type": "tool_misfire",
        "failure_summary": "API call to payment service timed out after 3 retries",
        "llm_calls": [],
        "tool_calls": [
            {
                "call_id": "tool-001",
                "tool_name": "payment_api",
                "parameters": {"action": "charge", "amount": 99.99},
                "error": "TimeoutError: Connection timed out after 30s",
                "status": "timeout",
                "latency_ms": 30000.0,
            },
            {
                "call_id": "tool-002",
                "tool_name": "payment_api",
                "parameters": {"action": "charge", "amount": 99.99},
                "error": "TimeoutError: Connection timed out after 30s",
                "status": "timeout",
                "latency_ms": 30000.0,
            },
            {
                "call_id": "tool-003",
                "tool_name": "payment_api",
                "parameters": {"action": "charge", "amount": 99.99},
                "error": "TimeoutError: Connection timed out after 30s",
                "status": "timeout",
                "latency_ms": 30000.0,
            },
        ],
        "retrieval_events": [],
    }


def _mock_graph_result(session_id: str, failure_type: str = "memory") -> dict:
    """Build a mock analysis_graph.ainvoke result."""
    return {
        "report": {
            "session_id": session_id,
            "failure_type": failure_type,
            "summary": "Test analysis summary.",
            "findings": [
                {
                    "title": "Test Finding",
                    "severity": "high",
                    "description": "A test finding for validation.",
                    "evidence": ["evidence-1"],
                    "recommendation": "Fix the issue.",
                }
            ],
            "root_cause": "Test root cause.",
            "confidence": 0.85,
            "raw_analysis": "Raw analysis text from the module.",
        }
    }


@pytest.mark.asyncio
async def test_chat_returns_analysis_report(memory_failure_session: dict) -> None:
    """Chat endpoint should return a structured AnalysisReport."""
    mock_result = _mock_graph_result("test-chat-001", "memory")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=memory_failure_session)

    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["data"]["session_id"] == "test-chat-001"
    assert body["data"]["failure_type"] == "memory"
    assert body["data"]["summary"] == "Test analysis summary."
    assert len(body["data"]["findings"]) == 1
    assert body["data"]["confidence"] == 0.85


@pytest.mark.asyncio
async def test_chat_response_envelope(memory_failure_session: dict) -> None:
    """Chat response should follow the standard API envelope."""
    mock_result = _mock_graph_result("test-chat-001")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=memory_failure_session)

    body = response.json()
    assert "data" in body
    assert "error" in body
    assert "metadata" in body
    assert body["metadata"]["request_id"] is not None
    assert body["metadata"]["duration_ms"] is not None


@pytest.mark.asyncio
async def test_chat_with_tool_misfire_session(tool_misfire_session: dict) -> None:
    """Chat endpoint should handle tool_misfire failure type."""
    mock_result = _mock_graph_result("test-chat-002", "tool_misfire")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=tool_misfire_session)

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["failure_type"] == "tool_misfire"


@pytest.mark.asyncio
async def test_chat_handles_graph_error(memory_failure_session: dict) -> None:
    """Chat endpoint should return error envelope when graph fails."""
    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(side_effect=RuntimeError("LLM API unavailable"))

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=memory_failure_session)

    assert response.status_code == 200  # envelope always returns 200
    body = response.json()
    assert body["data"] is None
    assert "LLM API unavailable" in body["error"]


@pytest.mark.asyncio
async def test_chat_rejects_invalid_payload() -> None:
    """Chat endpoint should reject payloads missing required fields."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/chat", json={"not_a_session": True})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_findings_structure(memory_failure_session: dict) -> None:
    """Chat findings should have the expected structure."""
    mock_result = _mock_graph_result("test-chat-001")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=memory_failure_session)

    finding = response.json()["data"]["findings"][0]
    assert "title" in finding
    assert "severity" in finding
    assert "description" in finding
    assert "evidence" in finding
    assert "recommendation" in finding
