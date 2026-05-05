"""Aethen MCP Server — 5 tools + 4 resources via stdio transport.

Tools (reactive — agent calls on failure):
  analyze_langfuse_trace        — fetch trace by ID using stored source credentials
  analyze_langfuse_trace_direct — fetch trace with per-call credentials (not stored)
  analyze_session               — analyze a raw Aethen Session dict
  get_report                    — retrieve a cached AnalysisReport by session_id
  search_traces                 — find similar past failures by type or query

Resources (proactive — agent reads on any schedule):
  aethen://stats                — system reliability overview
  aethen://patterns             — cross-session failure patterns (unique to Aethen)
  aethen://alerts               — active issues crossing severity thresholds
  aethen://agents/{agent_id}    — per-agent health summary

All tools call the Aethen HTTP API — the MCP server is a stateless adapter.
Credentials for MCP are read from env vars at startup (AETHEN_API_URL, AETHEN_API_KEY).
Langfuse/LangSmith credentials are either stored in Aethen (source model) or
passed per-call by the agent orchestrator (direct model).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from mcp.server.fastmcp import FastMCP

from app.mcp.client import get_client

logger = structlog.get_logger()
mcp = FastMCP("Aethen — AI Agent Reliability Studio")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _data(response: dict) -> Any:
    """Extract .data from an ApiResponse envelope."""
    return response.get("data")


def _error(response: dict) -> str | None:
    return response.get("error")


# ── Tools ──────────────────────────────────────────────────────────────────────


@mcp.tool()
async def analyze_langfuse_trace(trace_id: str, source: str = "default") -> dict:
    """Fetch a Langfuse trace by ID using credentials registered in Aethen, then run the full diagnostic pipeline.

    Args:
        trace_id: The Langfuse trace ID to analyze.
        source: Name of the registered source in Aethen (default = Aethen's own account).
                Register sources at: Settings → Integrations in the Aethen UI.

    Returns:
        AnalysisReport with failure_type, root_cause, findings, and confidence.
    """
    client = get_client()
    response = await client.post("/api/langfuse/trace", {
        "trace_id": trace_id,
        "source": source,
        "analyze": True,
    })
    if err := _error(response):
        return {"error": err}
    return _data(response) or {}


@mcp.tool()
async def analyze_langfuse_trace_direct(
    trace_id: str,
    public_key: str,
    secret_key: str,
    base_url: str = "",
) -> dict:
    """Fetch a Langfuse trace using per-call credentials (not stored by Aethen).

    Use this when you prefer not to register credentials in Aethen permanently.
    The secret_key is used for this request only and immediately discarded.

    Args:
        trace_id: The Langfuse trace ID to analyze.
        public_key: Langfuse project public key.
        secret_key: Langfuse secret key — used once, never stored.
        base_url: Optional self-hosted Langfuse URL.

    Returns:
        AnalysisReport with failure_type, root_cause, findings, and confidence.
    """
    client = get_client()
    response = await client.post("/api/analyze/raw", {
        "format": "langfuse",
        "trace_id": trace_id,
        "public_key": public_key,
        "secret_key": secret_key,
        "base_url": base_url,
        "analyze": True,
    })
    if err := _error(response):
        return {"error": err}
    return _data(response) or {}


@mcp.tool()
async def analyze_session(session: dict) -> dict:
    """Ingest and analyze a raw Aethen Session dict.

    Use this when your agent has custom observability (not Langfuse/LangSmith).
    The session must conform to Aethen's Session schema.

    Args:
        session: A dict matching the Aethen Session schema (session_id, agent_id,
                 outcome, llm_calls, tool_calls, retrieval_events, etc.)

    Returns:
        AnalysisReport with failure_type, root_cause, findings, and confidence.
    """
    client = get_client()

    # Step 1: ingest
    ingest_resp = await client.post("/api/ingest", {"sessions": [session]})
    if err := _error(ingest_resp):
        return {"error": f"Ingest failed: {err}"}

    session_id = session.get("session_id")
    if not session_id:
        return {"error": "session_id is required"}

    # Step 2: analyze
    analyze_resp = await client.post("/api/chat", session)
    if err := _error(analyze_resp):
        return {"error": f"Analysis failed: {err}"}

    return _data(analyze_resp) or {}


@mcp.tool()
async def get_report(session_id: str) -> dict | None:
    """Retrieve a cached AnalysisReport for a previously analyzed session.

    Returns the cached report without running the pipeline again (no LLM cost).
    Returns None if the session has not been analyzed yet.

    Args:
        session_id: The Aethen session ID.

    Returns:
        AnalysisReport dict or None.
    """
    client = get_client()
    response = await client.get(f"/api/sessions/{session_id}")
    data = _data(response)
    if not data:
        return None
    return data.get("analysis_report")


@mcp.tool()
async def search_traces(
    query: str = "",
    failure_type: str | None = None,
    limit: int = 5,
) -> list[dict]:
    """Search for similar past failure sessions in Aethen.

    Args:
        query: Free-text description of the failure (used for filtering).
        failure_type: Optional filter — one of: memory, tool_misfire, hallucination, blind_spot.
        limit: Maximum number of results (default: 5, max: 20).

    Returns:
        List of sessions with session_id, failure_type, failure_summary, and confidence.
    """
    client = get_client()
    params: dict = {"limit": min(limit, 20)}
    if failure_type:
        params["failure_type"] = failure_type

    response = await client.get("/api/sessions", params)
    sessions = _data(response) or []
    return [
        {
            "session_id": s.get("session_id"),
            "failure_type": s.get("failure_type"),
            "failure_summary": s.get("failure_summary"),
            "confidence": (s.get("analysis_report") or {}).get("confidence"),
        }
        for s in (sessions if isinstance(sessions, list) else [])
    ][:limit]


# ── Resources ──────────────────────────────────────────────────────────────────


@mcp.resource("aethen://stats")
async def resource_stats() -> str:
    """Overall system reliability — read this before a run to understand current health.

    Returns reliability score, failure breakdown by type, top failing agents,
    and trend direction (improving/stable/degrading).
    """
    import json
    client = get_client()

    stats_resp = await client.get("/api/stats")
    agents_resp = await client.get("/api/stats/agents")

    stats = _data(stats_resp) or {}
    agents = _data(agents_resp) or []

    top_failing = sorted(
        [a for a in (agents if isinstance(agents, list) else []) if a.get("failure_rate", 0) > 0.2],
        key=lambda a: a.get("failure_rate", 0),
        reverse=True,
    )[:3]

    result = {
        "total_sessions": stats.get("total_sessions", 0),
        "reliability_score": stats.get("reliability_score", 0),
        "failure_breakdown": stats.get("failure_breakdown", {}),
        "top_failing_agents": [
            {"agent_id": a.get("agent_id"), "failure_rate": a.get("failure_rate")}
            for a in top_failing
        ],
        "trend": _compute_trend(stats),
        "as_of": datetime.now(UTC).isoformat(),
    }
    return json.dumps(result, indent=2)


@mcp.resource("aethen://patterns")
async def resource_patterns() -> str:
    """Cross-session failure patterns — systemic issues Aethen has detected.

    This is Aethen's unique value: patterns across hundreds of traces that
    Langfuse or LangSmith dashboards do not surface. Read before a run to
    pre-empt known failure modes.
    """
    import json
    client = get_client()

    patterns_resp = await client.get("/api/stats/patterns")
    recs_resp = await client.get("/api/stats/recommendations")

    patterns = _data(patterns_resp) or []
    recommendations = _data(recs_resp) or []

    result = {
        "patterns": patterns if isinstance(patterns, list) else [],
        "top_recommendations": (recommendations if isinstance(recommendations, list) else [])[:5],
        "as_of": datetime.now(UTC).isoformat(),
    }
    return json.dumps(result, indent=2)


@mcp.resource("aethen://alerts")
async def resource_alerts() -> str:
    """Active alerts — issues that crossed a severity threshold recently.

    Alerts are computed from recent stats: reliability drops, new blind spots,
    and recurring tool failures. Read this to know if there are known critical
    issues before running your agent.
    """
    import json
    client = get_client()

    stats_resp = await client.get("/api/stats")
    agents_resp = await client.get("/api/stats/agents")

    stats = _data(stats_resp) or {}
    agents = _data(agents_resp) or []

    alerts = _compute_alerts(stats, agents if isinstance(agents, list) else [])

    result = {
        "alerts": alerts,
        "alert_count": len(alerts),
        "as_of": datetime.now(UTC).isoformat(),
    }
    return json.dumps(result, indent=2)


@mcp.resource("aethen://agents/{agent_id}")
async def resource_agent_profile(agent_id: str) -> str:
    """Per-agent health summary — read your own agent's reliability profile.

    Args:
        agent_id: The agent identifier as registered in Aethen.

    Returns failure rate, breakdown by failure type, and top root causes
    extracted from cached analysis reports.
    """
    import json
    client = get_client()

    agents_resp = await client.get("/api/stats/agents")
    agents = _data(agents_resp) or []

    agent = next(
        (a for a in (agents if isinstance(agents, list) else []) if a.get("agent_id") == agent_id),
        None,
    )

    if not agent:
        return json.dumps({"error": f"Agent '{agent_id}' not found", "agent_id": agent_id})

    result = {
        "agent_id": agent_id,
        "failure_rate": agent.get("failure_rate", 0),
        "total_sessions": agent.get("total_sessions", 0),
        "failure_breakdown": agent.get("failure_breakdown", {}),
        "top_root_causes": agent.get("top_root_causes", []),
        "last_seen": agent.get("last_seen"),
        "as_of": datetime.now(UTC).isoformat(),
    }
    return json.dumps(result, indent=2)


# ── Alert computation ──────────────────────────────────────────────────────────

def _compute_trend(stats: dict) -> str:
    """Derive a trend label from stats."""
    score = stats.get("reliability_score", 1.0)
    if score >= 0.85:
        return "stable"
    if score >= 0.70:
        return "degrading"
    return "critical"


def _compute_alerts(stats: dict, agents: list[dict]) -> list[dict]:
    """Compute active alerts from current stats."""
    alerts = []
    now = datetime.now(UTC).isoformat()

    score = stats.get("reliability_score", 1.0)
    if isinstance(score, (int, float)) and score < 0.65:
        alerts.append({
            "severity": "critical",
            "type": "low_reliability",
            "message": f"System reliability is at {score:.0%} — below the 65% threshold",
            "triggered_at": now,
        })

    for agent in agents:
        rate = agent.get("failure_rate", 0)
        agent_id = agent.get("agent_id", "unknown")
        if isinstance(rate, (int, float)) and rate > 0.6:
            alerts.append({
                "severity": "high",
                "type": "high_agent_failure_rate",
                "message": f"{agent_id} has a {rate:.0%} failure rate — investigate recent sessions",
                "triggered_at": now,
                "agent_id": agent_id,
            })

    breakdown = stats.get("failure_breakdown", {})
    total = stats.get("total_sessions", 0)
    if isinstance(total, int) and total > 10:
        blind_spots = breakdown.get("blind_spot", 0)
        if isinstance(blind_spots, int) and blind_spots / total > 0.35:
            alerts.append({
                "severity": "high",
                "type": "blind_spot_spike",
                "message": f"Blind spot failures account for {blind_spots/total:.0%} of all failures — knowledge base gap likely",
                "triggered_at": now,
            })

    return alerts
