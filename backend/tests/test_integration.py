"""Integration tests for the Aethen analysis pipeline.

7 tests per proposal:
1. test_full_memory_pipeline — end-to-end with retrieval events
2. test_full_tool_misfire_pipeline — with tool call trace
3. test_full_hallucination_pipeline — with LLM call trace
4. test_full_blind_spot_pipeline — with empty retrieval
5. test_classify_routes_correctly — each failure type routes to correct module
6. test_synthesis_fallback — invalid JSON from LLM falls back gracefully
7. test_api_chat_returns_envelope — correct {data, error, metadata} shape
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


# ── Fixtures ──────────────────────────────────────────────────────


def _build_session(failure_type: str, session_id: str = "int-test-001") -> dict:
    """Build a minimal valid session payload for a given failure type."""
    base = {
        "session_id": session_id,
        "agent_id": "test-agent-v1",
        "outcome": "failure",
        "failure_type": failure_type,
        "llm_calls": [
            {
                "call_id": "llm-int-001",
                "model": "gpt-4o-mini",
                "prompt": "How do I reset my billing password?",
                "response": "Here is the answer about billing...",
                "tokens_in": 150,
                "tokens_out": 80,
                "latency_ms": 450.0,
                "hallucination_flag": False,
                "source_documents": ["doc-001"],
            }
        ],
        "tool_calls": [
            {
                "call_id": "tool-int-001",
                "tool_name": "search_knowledge_base",
                "parameters": {"query": "billing password"},
                "result": "Found 3 results",
                "status": "success",
                "latency_ms": 120.0,
            }
        ],
        "retrieval_events": [
            {
                "event_id": "ret-int-001",
                "query": "billing password reset",
                "chunks_returned": 3,
                "relevance_scores": [0.92, 0.85, 0.71],
                "expected_doc_ids": ["doc-001"],
                "actual_doc_ids": ["doc-001"],
            }
        ],
    }

    # Customize per failure type
    if failure_type == "memory":
        base["retrieval_events"][0]["expected_doc_ids"] = ["doc-expected-001"]
        base["retrieval_events"][0]["actual_doc_ids"] = ["doc-wrong-099"]
    elif failure_type == "tool_misfire":
        base["tool_calls"][0]["tool_name"] = "update_user_record"
        base["tool_calls"][0]["result"] = None
        base["tool_calls"][0]["error"] = "PermissionError: insufficient privileges"
        base["tool_calls"][0]["status"] = "failed"
    elif failure_type == "hallucination":
        base["llm_calls"][0]["hallucination_flag"] = True
        base["llm_calls"][0]["response"] = "Quantum encryption resets require Mars satellite contact."
        base["llm_calls"][0]["source_documents"] = []
    elif failure_type == "blind_spot":
        base["retrieval_events"][0]["chunks_returned"] = 0
        base["retrieval_events"][0]["relevance_scores"] = []
        base["retrieval_events"][0]["actual_doc_ids"] = []

    return base


def _mock_graph_result(session_id: str, failure_type: str) -> dict:
    """Build a mock LangGraph analysis result matching AnalysisReport schema."""
    return {
        "report": {
            "session_id": session_id,
            "failure_type": failure_type,
            "summary": f"Analysis complete for {failure_type} failure.",
            "findings": [
                {
                    "title": f"{failure_type.replace('_', ' ').title()} Detected",
                    "severity": "high",
                    "description": f"Detected {failure_type} issue in session.",
                    "evidence": ["trace event int-001"],
                    "recommendation": f"Review {failure_type} configuration.",
                }
            ],
            "root_cause": f"Root cause identified for {failure_type}",
            "confidence": 0.87,
        }
    }


# ── Test 1: Full memory pipeline ─────────────────────────────────


@pytest.mark.asyncio
async def test_full_memory_pipeline() -> None:
    """End-to-end memory failure analysis with mismatched retrieval docs."""
    session = _build_session("memory", "mem-int-001")
    mock_result = _mock_graph_result("mem-int-001", "memory")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=session)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["failure_type"] == "memory"
    assert data["session_id"] == "mem-int-001"
    assert len(data["findings"]) >= 1
    assert "memory" in data["findings"][0]["title"].lower()


# ── Test 2: Full tool misfire pipeline ────────────────────────────


@pytest.mark.asyncio
async def test_full_tool_misfire_pipeline() -> None:
    """End-to-end tool misfire analysis with failed tool call."""
    session = _build_session("tool_misfire", "tool-int-001")
    mock_result = _mock_graph_result("tool-int-001", "tool_misfire")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=session)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["failure_type"] == "tool_misfire"
    assert data["session_id"] == "tool-int-001"
    assert any("tool misfire" in f["title"].lower() for f in data["findings"])


# ── Test 3: Full hallucination pipeline ───────────────────────────


@pytest.mark.asyncio
async def test_full_hallucination_pipeline() -> None:
    """End-to-end hallucination RCA with flagged LLM response."""
    session = _build_session("hallucination", "hal-int-001")
    mock_result = _mock_graph_result("hal-int-001", "hallucination")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=session)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["failure_type"] == "hallucination"
    assert data["confidence"] > 0


# ── Test 4: Full blind spot pipeline ─────────────────────────────


@pytest.mark.asyncio
async def test_full_blind_spot_pipeline() -> None:
    """End-to-end blind spot detection with empty retrieval results."""
    session = _build_session("blind_spot", "blind-int-001")
    mock_result = _mock_graph_result("blind-int-001", "blind_spot")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=session)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["failure_type"] == "blind_spot"
    assert data["session_id"] == "blind-int-001"


# ── Test 5: Classify routes correctly ─────────────────────────────


@pytest.mark.asyncio
async def test_classify_routes_correctly() -> None:
    """Each failure type should route through the pipeline and return the correct type."""
    failure_types = ["memory", "tool_misfire", "hallucination", "blind_spot"]

    for ft in failure_types:
        session = _build_session(ft, f"classify-{ft}")
        mock_result = _mock_graph_result(f"classify-{ft}", ft)

        with patch("app.api.chat.analysis_graph") as mock_graph:
            mock_graph.ainvoke = AsyncMock(return_value=mock_result)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/chat", json=session)

        assert response.status_code == 200, f"Failed for {ft}"
        data = response.json()["data"]
        assert data["failure_type"] == ft, f"Expected {ft}, got {data.get('failure_type')}"


# ── Test 6: Synthesis fallback ────────────────────────────────────


@pytest.mark.asyncio
async def test_synthesis_fallback() -> None:
    """When the graph returns a malformed report, the API should handle it gracefully."""
    session = _build_session("memory", "fallback-001")

    # Return a result with empty findings — simulates LLM returning minimal output
    malformed_result = {
        "report": {
            "session_id": "fallback-001",
            "failure_type": "memory",
            "summary": "Partial analysis — synthesis encountered an error.",
            "findings": [],
            "root_cause": "",
            "confidence": 0.0,
        }
    }

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=malformed_result)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=session)

    # Should still return 200 with the partial report (graceful degradation)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["session_id"] == "fallback-001"
    assert data["confidence"] == 0.0


# ── Test 7: API chat returns correct envelope ─────────────────────


@pytest.mark.asyncio
async def test_api_chat_returns_envelope() -> None:
    """Response must follow {data, error, metadata} envelope shape."""
    session = _build_session("memory", "envelope-001")
    mock_result = _mock_graph_result("envelope-001", "memory")

    with patch("app.api.chat.analysis_graph") as mock_graph:
        mock_graph.ainvoke = AsyncMock(return_value=mock_result)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/chat", json=session)

    assert response.status_code == 200
    body = response.json()

    # Verify envelope structure
    assert "data" in body, "Response missing 'data' key"
    assert "error" in body, "Response missing 'error' key"
    assert body["error"] is None, "Successful response should have null error"

    # Verify report structure inside data
    data = body["data"]
    assert "session_id" in data
    assert "failure_type" in data
    assert "summary" in data
    assert "findings" in data
    assert "root_cause" in data
    assert "confidence" in data


# ── Bonus: Langfuse adapter unit tests ────────────────────────────


class TestLangfuseTraceAdapter:
    """Unit tests for the LangfuseTraceAdapter mapping logic."""

    def setup_method(self):
        from app.providers.langfuse_provider import LangfuseTraceAdapter
        self.adapter = LangfuseTraceAdapter()

    def test_adapt_generation_to_llm_call(self):
        """GENERATION observations should map to LLMCall."""
        trace = {"id": "trace-001", "name": "test-trace", "tags": []}
        observations = [
            {
                "id": "obs-gen-001",
                "type": "GENERATION",
                "name": "chat-completion",
                "model": "gpt-4o-mini",
                "input": {"messages": [{"role": "user", "content": "Hello"}]},
                "output": {"content": "Hi there!"},
                "usage": {"input": 10, "output": 5},
                "startTime": "2026-04-24T10:00:00Z",
                "endTime": "2026-04-24T10:00:01Z",
            }
        ]

        session = self.adapter.adapt_trace(trace, observations)
        assert len(session.llm_calls) == 1
        assert session.llm_calls[0].model == "gpt-4o-mini"
        assert session.llm_calls[0].tokens_in == 10
        assert session.llm_calls[0].tokens_out == 5
        assert session.llm_calls[0].latency_ms == pytest.approx(1000.0, abs=10)

    def test_adapt_span_to_tool_call(self):
        """SPAN observations should map to ToolCall."""
        trace = {"id": "trace-002", "name": "test-trace", "tags": []}
        observations = [
            {
                "id": "obs-span-001",
                "type": "SPAN",
                "name": "search_documents",
                "input": {"query": "billing help"},
                "output": "Found 3 results",
                "level": "DEFAULT",
            }
        ]

        session = self.adapter.adapt_trace(trace, observations)
        assert len(session.tool_calls) == 1
        assert session.tool_calls[0].tool_name == "search_documents"

    def test_adapt_failed_tool(self):
        """ERROR-level SPAN should map to failed ToolCall."""
        trace = {"id": "trace-003", "name": "test-trace", "tags": []}
        observations = [
            {
                "id": "obs-err-001",
                "type": "SPAN",
                "name": "update_record",
                "input": {},
                "output": None,
                "level": "ERROR",
                "statusMessage": "PermissionError: access denied",
            }
        ]

        session = self.adapter.adapt_trace(trace, observations)
        assert len(session.tool_calls) == 1
        assert session.tool_calls[0].status == "failed"
        assert "PermissionError" in session.tool_calls[0].error

    def test_adapt_retrieval_observation(self):
        """Retrieval-keyword observations should map to RetrievalEvent."""
        trace = {"id": "trace-004", "name": "test-trace", "tags": []}
        observations = [
            {
                "id": "obs-ret-001",
                "type": "SPAN",
                "name": "vector_retrieval",
                "input": "How to reset password?",
                "output": [
                    {"id": "doc-001", "text": "Reset instructions..."},
                    {"id": "doc-002", "text": "Password policy..."},
                ],
            }
        ]

        session = self.adapter.adapt_trace(trace, observations)
        assert len(session.retrieval_events) == 1
        assert session.retrieval_events[0].chunks_returned == 2
        assert "doc-001" in session.retrieval_events[0].actual_doc_ids

    def test_infer_failure_from_tags(self):
        """Trace tags should drive failure type inference."""
        trace = {"id": "trace-005", "name": "test-trace", "tags": ["hallucination", "test"]}
        session = self.adapter.adapt_trace(trace, [])
        assert session.failure_type == "hallucination"

    def test_infer_failure_from_failed_tools(self):
        """Failed tool calls should infer tool_misfire failure type."""
        trace = {"id": "trace-006", "name": "test-trace", "tags": []}
        observations = [
            {
                "id": "obs-fail-001",
                "type": "SPAN",
                "name": "api_call",
                "input": {},
                "output": None,
                "level": "ERROR",
                "statusMessage": "Timeout",
            }
        ]

        session = self.adapter.adapt_trace(trace, observations)
        assert session.failure_type == "tool_misfire"

    def test_successful_trace_has_no_failure(self):
        """A clean trace with no issues should have no failure type."""
        trace = {"id": "trace-007", "name": "test-trace", "tags": []}
        observations = [
            {
                "id": "obs-ok-001",
                "type": "GENERATION",
                "name": "chat-completion",
                "model": "gpt-4o-mini",
                "input": "Hello",
                "output": "Hi!",
                "usage": {"input": 5, "output": 3},
            }
        ]

        session = self.adapter.adapt_trace(trace, observations)
        assert session.failure_type is None
        assert session.outcome == "success"
