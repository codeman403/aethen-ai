"""Tests for MCP tools and resources.

All CI-safe — mock the AethenClient HTTP layer. No live API calls,
no database, no LLM invocations.
"""

from unittest.mock import AsyncMock, patch

import pytest

# ── Fixtures ───────────────────────────────────────────────────────────────────

MOCK_REPORT = {
    "session_id": "sess-001",
    "failure_type": "memory",
    "summary": "Wrong documents retrieved",
    "root_cause": "Embedding scores peaked at 0.43, below threshold",
    "confidence": 0.87,
    "findings": [],
}

MOCK_STATS = {
    "total_sessions": 200,
    "reliability_score": 0.78,
    "failure_breakdown": {"memory": 40, "tool_misfire": 30, "hallucination": 20, "blind_spot": 10},
    "daily_counts": [],
}

MOCK_AGENTS = [
    {"agent_id": "support-agent-v2", "failure_rate": 0.45, "total_sessions": 80,
     "failure_breakdown": {"blind_spot": 30, "tool_misfire": 20},
     "top_root_causes": ["KB lacks DevOps coverage"], "last_seen": "2026-05-05T01:00:00Z"},
    {"agent_id": "research-agent", "failure_rate": 0.15, "total_sessions": 40,
     "failure_breakdown": {"hallucination": 6}, "top_root_causes": [], "last_seen": "2026-05-05T00:00:00Z"},
]

MOCK_PATTERNS = [
    {"type": "recurring_blind_spot", "description": "Kubernetes queries fail across 3 agents",
     "affected_agents": ["support-agent-v2"], "session_count": 12,
     "recommendation": "Add Kubernetes docs to KB"},
]


def _mock_client(post_return=None, get_return=None):
    client = AsyncMock()
    client.post = AsyncMock(return_value={"data": post_return, "error": None})
    client.get = AsyncMock(return_value={"data": get_return, "error": None})
    return client


# ── analyze_langfuse_trace ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_analyze_langfuse_trace_uses_stored_source():
    from app.mcp.server import analyze_langfuse_trace
    mock = _mock_client(post_return={"session_id": "sess-001", "report": MOCK_REPORT})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await analyze_langfuse_trace("trace-abc", source="my-agent")
    mock.post.assert_called_once_with("/api/langfuse/trace", {
        "trace_id": "trace-abc", "source": "my-agent", "analyze": True,
    })
    assert result["session_id"] == "sess-001"


@pytest.mark.asyncio
async def test_analyze_langfuse_trace_default_source():
    from app.mcp.server import analyze_langfuse_trace
    mock = _mock_client(post_return={"session_id": "sess-002", "report": MOCK_REPORT})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await analyze_langfuse_trace("trace-xyz")
    call_body = mock.post.call_args[0][1]
    assert call_body["source"] == "default"


@pytest.mark.asyncio
async def test_analyze_langfuse_trace_source_not_found():
    from app.mcp.server import analyze_langfuse_trace
    mock = AsyncMock()
    mock.post = AsyncMock(return_value={"data": None, "error": "Source 'bad-source' not found"})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await analyze_langfuse_trace("trace-abc", source="bad-source")
    assert "error" in result


# ── analyze_langfuse_trace_direct ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_analyze_langfuse_trace_direct_per_call_creds():
    from app.mcp.server import analyze_langfuse_trace_direct
    mock = _mock_client(post_return={"session_id": "sess-003", "report": MOCK_REPORT})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await analyze_langfuse_trace_direct("trace-abc", "pk-xxx", "sk-xxx")
    call_body = mock.post.call_args[0][1]
    assert call_body["format"] == "langfuse"
    assert call_body["public_key"] == "pk-xxx"
    assert call_body["secret_key"] == "sk-xxx"
    assert result["session_id"] == "sess-003"


@pytest.mark.asyncio
async def test_analyze_langfuse_trace_direct_creds_not_in_response():
    """Credentials must not appear in the tool return value."""
    from app.mcp.server import analyze_langfuse_trace_direct
    mock = _mock_client(post_return={"session_id": "sess-004", "report": MOCK_REPORT})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await analyze_langfuse_trace_direct("trace-abc", "pk-secret", "sk-secret")
    result_str = str(result)
    assert "pk-secret" not in result_str
    assert "sk-secret" not in result_str


# ── analyze_session ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_analyze_session_two_step_flow():
    from app.mcp.server import analyze_session
    mock = AsyncMock()
    mock.post = AsyncMock(side_effect=[
        {"data": {"sessions_ingested": 1, "events_processed": 1}, "error": None},  # ingest
        {"data": MOCK_REPORT, "error": None},  # analyze
    ])
    session_dict = {"session_id": "sess-005", "agent_id": "test", "outcome": "failure",
                    "llm_calls": [], "tool_calls": [], "retrieval_events": []}
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await analyze_session(session_dict)
    assert mock.post.call_count == 2
    first_call = mock.post.call_args_list[0][0]
    assert first_call[0] == "/api/ingest"


@pytest.mark.asyncio
async def test_analyze_session_missing_session_id():
    from app.mcp.server import analyze_session
    mock = _mock_client(post_return={"sessions_ingested": 1})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await analyze_session({"agent_id": "test", "outcome": "failure"})
    assert "error" in result


# ── get_report ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_report_returns_cached():
    from app.mcp.server import get_report
    mock = _mock_client(get_return={"session_id": "sess-006", "analysis_report": MOCK_REPORT})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await get_report("sess-006")
    assert result["failure_type"] == "memory"
    mock.get.assert_called_once_with("/api/sessions/sess-006")


@pytest.mark.asyncio
async def test_get_report_none_when_missing():
    from app.mcp.server import get_report
    mock = AsyncMock()
    mock.get = AsyncMock(return_value={"data": None, "error": None})
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await get_report("nonexistent")
    assert result is None


# ── search_traces ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_traces_with_failure_type():
    from app.mcp.server import search_traces
    sessions = [
        {"session_id": "s1", "failure_type": "memory", "failure_summary": "wrong docs",
         "analysis_report": {"confidence": 0.8}},
    ]
    mock = _mock_client(get_return=sessions)
    with patch("app.mcp.server.get_client", return_value=mock):
        result = await search_traces(failure_type="memory", limit=5)
    params = mock.get.call_args[0][1]
    assert params["failure_type"] == "memory"
    assert len(result) == 1
    assert result[0]["session_id"] == "s1"


@pytest.mark.asyncio
async def test_search_traces_no_filter():
    from app.mcp.server import search_traces
    mock = _mock_client(get_return=[])
    with patch("app.mcp.server.get_client", return_value=mock):
        await search_traces()
    params = mock.get.call_args[0][1]
    assert "failure_type" not in params


@pytest.mark.asyncio
async def test_search_traces_limit_capped_at_20():
    from app.mcp.server import search_traces
    mock = _mock_client(get_return=[])
    with patch("app.mcp.server.get_client", return_value=mock):
        await search_traces(limit=999)
    params = mock.get.call_args[0][1]
    assert params["limit"] == 20


# ── Resources ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_resource_stats_shape():
    from app.mcp.server import resource_stats
    import json
    mock = AsyncMock()
    mock.get = AsyncMock(side_effect=[
        {"data": MOCK_STATS, "error": None},  # /api/stats
        {"data": MOCK_AGENTS, "error": None},  # /api/stats/agents
    ])
    with patch("app.mcp.server.get_client", return_value=mock):
        raw = await resource_stats()
    data = json.loads(raw)
    assert "total_sessions" in data
    assert "reliability_score" in data
    assert "failure_breakdown" in data
    assert "as_of" in data


@pytest.mark.asyncio
async def test_resource_patterns_shape():
    from app.mcp.server import resource_patterns
    import json
    mock = AsyncMock()
    mock.get = AsyncMock(side_effect=[
        {"data": MOCK_PATTERNS, "error": None},
        {"data": [], "error": None},
    ])
    with patch("app.mcp.server.get_client", return_value=mock):
        raw = await resource_patterns()
    data = json.loads(raw)
    assert "patterns" in data
    assert isinstance(data["patterns"], list)
    assert "as_of" in data


@pytest.mark.asyncio
async def test_resource_alerts_spike_detected():
    from app.mcp.server import resource_alerts
    import json
    low_score_stats = {**MOCK_STATS, "reliability_score": 0.50}  # below 0.65 threshold
    mock = AsyncMock()
    mock.get = AsyncMock(side_effect=[
        {"data": low_score_stats, "error": None},
        {"data": MOCK_AGENTS, "error": None},
    ])
    with patch("app.mcp.server.get_client", return_value=mock):
        raw = await resource_alerts()
    data = json.loads(raw)
    assert data["alert_count"] > 0
    assert any(a["type"] == "low_reliability" for a in data["alerts"])


@pytest.mark.asyncio
async def test_resource_alerts_empty_when_healthy():
    from app.mcp.server import resource_alerts
    import json
    healthy_stats = {**MOCK_STATS, "reliability_score": 0.92, "total_sessions": 10}
    healthy_agents = [{"agent_id": "good-agent", "failure_rate": 0.05, "total_sessions": 10}]
    mock = AsyncMock()
    mock.get = AsyncMock(side_effect=[
        {"data": healthy_stats, "error": None},
        {"data": healthy_agents, "error": None},
    ])
    with patch("app.mcp.server.get_client", return_value=mock):
        raw = await resource_alerts()
    data = json.loads(raw)
    assert data["alert_count"] == 0


@pytest.mark.asyncio
async def test_resource_agent_profile():
    from app.mcp.server import resource_agent_profile
    import json
    mock = _mock_client(get_return=MOCK_AGENTS)
    with patch("app.mcp.server.get_client", return_value=mock):
        raw = await resource_agent_profile("support-agent-v2")
    data = json.loads(raw)
    assert data["agent_id"] == "support-agent-v2"
    assert "failure_rate" in data
    assert "failure_breakdown" in data


@pytest.mark.asyncio
async def test_resource_agent_profile_not_found():
    from app.mcp.server import resource_agent_profile
    import json
    mock = _mock_client(get_return=MOCK_AGENTS)
    with patch("app.mcp.server.get_client", return_value=mock):
        raw = await resource_agent_profile("unknown-agent")
    data = json.loads(raw)
    assert "error" in data


# ── Auth header ────────────────────────────────────────────────────────────────


def test_client_includes_auth_header():
    import os
    with patch.dict(os.environ, {"AETHEN_API_KEY": "test-key-abc", "AETHEN_API_URL": "http://localhost:8000"}):
        from app.mcp.client import AethenClient
        client = AethenClient()
    assert "Authorization" in client._headers
    assert client._headers["Authorization"] == "Bearer test-key-abc"


def test_client_no_auth_header_when_no_key():
    import os
    with patch.dict(os.environ, {"AETHEN_API_KEY": "", "AETHEN_API_URL": "http://localhost:8000"}):
        from app.mcp.client import AethenClient
        client = AethenClient()
    assert "Authorization" not in client._headers
