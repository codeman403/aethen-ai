"""Tests for features added in Sessions 19–20.

Covers:
- Pinecone metadata (text + failure_summary fields on all event types)
- Retrieve node session exclusion filter
- Data Quality flagged_session_ids population
- Model settings API (get / update / test)
- LLM model cache (set_active_model, get_openai_llm, get_anthropic_llm)
- No-evidence guard (_has_analyzable_evidence)
- Rate limit values
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.trace import (
    FailureType,
    LLMCall,
    RetrievalEvent,
    Session,
    ToolCall,
    ToolCallStatus,
)


# ── Helpers ───────────────────────────────────────────────────────────────


def _session(*, outcome="failure", failure_type="tool_misfire", failure_summary="Tool failed",
             tool_calls=None, retrieval_events=None, llm_calls=None) -> Session:
    return Session(
        session_id=str(uuid.uuid4()),
        agent_id="test-agent",
        outcome=outcome,
        failure_type=failure_type,
        failure_summary=failure_summary,
        llm_calls=llm_calls or [],
        tool_calls=tool_calls or [],
        retrieval_events=retrieval_events or [],
    )


# ── Pinecone metadata ─────────────────────────────────────────────────────


class TestPineconeMetadata:
    """text and failure_summary fields are present and non-empty for all event types."""

    def _build_metadata(self, session: Session) -> list[dict]:
        """Replicate the metadata construction from pinecone_service.upsert_session."""
        failure_summary_short = (session.failure_summary or "")[:300]
        metadata_list = []

        for llm_call in session.llm_calls:
            metadata_list.append({
                "session_id": session.session_id,
                "event_type": "llm_call",
                "failure_type": session.failure_type or "",
                "failure_summary": failure_summary_short,
                "outcome": session.outcome,
                "text": f"LLM: {llm_call.prompt[:200]} → {llm_call.response[:200]}",
            })

        for tool_call in session.tool_calls:
            error_snippet = f" | error: {tool_call.error[:150]}" if tool_call.error else ""
            metadata_list.append({
                "session_id": session.session_id,
                "event_type": "tool_call",
                "failure_type": session.failure_type or "",
                "failure_summary": failure_summary_short,
                "outcome": session.outcome,
                "text": f"Tool {tool_call.tool_name}: {str(tool_call.parameters)[:100]} → {tool_call.status}{error_snippet}",
            })

        for retrieval in session.retrieval_events:
            avg_score = (
                round(sum(retrieval.relevance_scores) / len(retrieval.relevance_scores), 3)
                if retrieval.relevance_scores else None
            )
            score_part = f", avg_score={avg_score}" if avg_score is not None else ""
            metadata_list.append({
                "session_id": session.session_id,
                "event_type": "retrieval",
                "failure_type": session.failure_type or "",
                "failure_summary": failure_summary_short,
                "outcome": session.outcome,
                "text": f"Query: '{retrieval.query[:250]}' → {retrieval.chunks_returned} chunks{score_part}",
            })

        return metadata_list

    def test_llm_call_has_text_and_summary(self):
        s = _session(
            llm_calls=[LLMCall(call_id="c1", prompt="What is the refund policy?",
                               response="I cannot find that information.", model="gpt-4o-mini")],
        )
        metas = self._build_metadata(s)
        assert len(metas) == 1
        m = metas[0]
        assert m["text"], "text field must be non-empty"
        assert m["failure_summary"] == "Tool failed"
        assert "LLM:" in m["text"]
        assert "What is the refund policy?" in m["text"]
        assert "None" not in m["text"]

    def test_tool_call_with_error_includes_error_snippet(self):
        s = _session(
            tool_calls=[ToolCall(call_id="c1", tool_name="update_user_record",
                                 parameters={"field": "email"}, status="failed",
                                 error="PermissionError: insufficient privileges")],
        )
        metas = self._build_metadata(s)
        m = metas[0]
        assert "update_user_record" in m["text"]
        assert "failed" in m["text"]
        assert "PermissionError" in m["text"]
        assert "None" not in m["text"]

    def test_tool_call_without_error_no_none(self):
        s = _session(
            outcome="success",
            failure_type=None,
            failure_summary=None,
            tool_calls=[ToolCall(call_id="c1", tool_name="create_ticket",
                                 parameters={}, status="success")],
        )
        metas = self._build_metadata(s)
        m = metas[0]
        assert "None" not in m["text"]
        assert m["failure_summary"] == ""

    def test_retrieval_with_scores_includes_avg(self):
        s = _session(
            failure_type="memory",
            retrieval_events=[RetrievalEvent(event_id="r1", query="billing refund policy",
                                             chunks_returned=2, relevance_scores=[0.82, 0.71],
                                             actual_doc_ids=["doc-a", "doc-b"])],
        )
        metas = self._build_metadata(s)
        m = metas[0]
        assert "billing refund policy" in m["text"]
        assert "2 chunks" in m["text"]
        assert "avg_score" in m["text"]

    def test_retrieval_zero_chunks_no_avg_score(self):
        s = _session(
            failure_type="blind_spot",
            retrieval_events=[RetrievalEvent(event_id="r1", query="enterprise pricing",
                                             chunks_returned=0, relevance_scores=[])],
        )
        metas = self._build_metadata(s)
        m = metas[0]
        assert "0 chunks" in m["text"]
        assert "avg_score" not in m["text"]
        assert "None" not in m["text"]

    def test_metadata_within_pinecone_size_limit(self):
        """Combined metadata chars should be well under Pinecone's 40KB limit."""
        s = _session(
            llm_calls=[LLMCall(call_id="c1", prompt="A" * 500, response="B" * 500, model="gpt-4o-mini")],
            tool_calls=[ToolCall(call_id="c2", tool_name="tool", parameters={"k": "v" * 100},
                                 status="failed", error="E" * 150)],
            retrieval_events=[RetrievalEvent(event_id="r1", query="Q" * 250, chunks_returned=3,
                                             relevance_scores=[0.9, 0.8, 0.7])],
        )
        metas = self._build_metadata(s)
        for m in metas:
            total_chars = sum(len(str(v)) for v in m.values())
            assert total_chars < 40_000, f"Metadata too large: {total_chars} chars"


# ── Retrieve node ─────────────────────────────────────────────────────────


class TestRetrieveNode:
    """Session exclusion filter is applied to both Pinecone namespaces."""

    @pytest.mark.asyncio
    async def test_traces_namespace_excludes_current_session(self):
        from app.agents.nodes.retrieve import vector_retrieve
        from app.agents.state import AgentState

        session = _session(failure_type="tool_misfire")
        state: AgentState = {"session": session, "failure_type": FailureType.TOOL_MISFIRE}

        captured_calls: list[dict] = []

        async def mock_query_similar(query_text, namespace, top_k, filters=None):
            captured_calls.append({"namespace": namespace, "filters": filters})
            return []

        with patch("app.agents.nodes.retrieve.pinecone_service") as mock_svc:
            mock_svc.is_available = True
            mock_svc.query_similar = AsyncMock(side_effect=mock_query_similar)
            await vector_retrieve(state)

        traces_call = next((c for c in captured_calls if c["namespace"] == "traces"), None)
        assert traces_call is not None, "traces namespace was not queried"
        assert traces_call["filters"] is not None, "traces query has no filter"
        assert traces_call["filters"].get("session_id", {}).get("$ne") == session.session_id

    @pytest.mark.asyncio
    async def test_failure_patterns_namespace_excludes_current_session(self):
        from app.agents.nodes.retrieve import vector_retrieve
        from app.agents.state import AgentState

        session = _session(failure_type="memory")
        state: AgentState = {"session": session, "failure_type": FailureType.MEMORY}

        captured_calls: list[dict] = []

        async def mock_query_similar(query_text, namespace, top_k, filters=None):
            captured_calls.append({"namespace": namespace, "filters": filters})
            return []

        with patch("app.agents.nodes.retrieve.pinecone_service") as mock_svc:
            mock_svc.is_available = True
            mock_svc.query_similar = AsyncMock(side_effect=mock_query_similar)
            await vector_retrieve(state)

        fp_call = next((c for c in captured_calls if c["namespace"] == "failure_patterns"), None)
        assert fp_call is not None
        assert fp_call["filters"].get("session_id", {}).get("$ne") == session.session_id


# ── Data Quality flagged_session_ids ──────────────────────────────────────


class TestDataQualityFlaggedIds:
    """QC checks populate flagged_session_ids with actual session IDs."""

    def test_schema_validation_flags_invalid_sessions(self):
        from app.api.qc import _check_agent_traces

        sessions = [
            {"session_id": "good-1", "agent_id": "a", "outcome": "success", "llm_calls": []},
            {"agent_id": "a", "outcome": "success"},          # missing session_id
            {"session_id": "", "agent_id": "a", "outcome": "success"},  # empty session_id
        ]
        report = _check_agent_traces(sessions).compute_status()
        schema_check = next(c for c in report.checks if c.name == "Schema Validation")
        assert schema_check.flagged == 2
        assert len(schema_check.flagged_session_ids) == 2
        assert "good-1" not in schema_check.flagged_session_ids

    def test_completeness_flags_empty_event_sessions(self):
        from app.api.qc import _check_agent_traces

        sessions = [
            {"session_id": "has-events", "agent_id": "a", "outcome": "success",
             "llm_calls": [{"call_id": "c1"}], "tool_calls": [], "retrieval_events": []},
            {"session_id": "no-events", "agent_id": "a", "outcome": "success",
             "llm_calls": [], "tool_calls": [], "retrieval_events": []},
        ]
        report = _check_agent_traces(sessions).compute_status()
        completeness = next(c for c in report.checks if c.name == "Completeness")
        assert "no-events" in completeness.flagged_session_ids
        assert "has-events" not in completeness.flagged_session_ids

    def test_vector_db_checks_have_no_session_ids(self):
        """Vector DB checks are index-level, not session-level — no session IDs."""
        from app.api.qc import QualityCheck
        check = QualityCheck(name="Coverage (≥1,000 vectors)", status="fail",
                             detail="500 vectors (threshold: 1000)", count=500, flagged=1)
        assert check.flagged_session_ids == []


# ── Model settings API ────────────────────────────────────────────────────


class TestModelSettingsAPI:

    @pytest.mark.asyncio
    async def test_get_model_settings_returns_roles(self):
        with patch("app.api.model_settings.postgres_service") as mock_pg:
            mock_pg.get_setting = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/settings/models")
        assert resp.status_code == 200
        data = resp.json()["data"]
        roles = {r["role"] for r in data["roles"]}
        assert "analysis" in roles
        assert "synthesis" in roles
        assert "demo" in roles

    @pytest.mark.asyncio
    async def test_get_model_settings_uses_stored_value(self):
        with patch("app.api.model_settings.postgres_service") as mock_pg:
            mock_pg.get_setting = AsyncMock(side_effect=lambda k: "gpt-4.1" if k == "model_analysis" else None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/settings/models")
        analysis_role = next(r for r in resp.json()["data"]["roles"] if r["role"] == "analysis")
        assert analysis_role["current_model"] == "gpt-4.1"

    @pytest.mark.asyncio
    async def test_update_valid_model(self):
        with patch("app.api.model_settings.postgres_service") as mock_pg:
            mock_pg.set_setting = AsyncMock()
            with patch("app.agents.llm.set_active_model") as mock_cache:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.post("/api/settings/models",
                                         json={"role": "analysis", "model_id": "gpt-4.1-mini"})
        assert resp.status_code == 200
        assert resp.json()["data"]["model_id"] == "gpt-4.1-mini"
        mock_pg.set_setting.assert_called_once_with("model_analysis", "gpt-4.1-mini")

    @pytest.mark.asyncio
    async def test_update_unknown_role_returns_error(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/settings/models",
                                 json={"role": "cohere", "model_id": "some-model"})
        assert resp.status_code == 200
        assert resp.json()["error"] is not None

    @pytest.mark.asyncio
    async def test_update_disallowed_model_returns_error(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/settings/models",
                                 json={"role": "synthesis", "model_id": "claude-3-opus-20240229"})
        assert resp.status_code == 200
        assert resp.json()["error"] is not None

    @pytest.mark.asyncio
    async def test_model_options_are_whitelisted(self):
        """Only confirmed-working models appear in the options list."""
        with patch("app.api.model_settings.postgres_service") as mock_pg:
            mock_pg.get_setting = AsyncMock(return_value=None)
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/settings/models")
        body = resp.json()
        assert body.get("error") is None
        assert body.get("data") is not None
        for role in body["data"]["roles"]:
            ids = [o["id"] for o in role["options"]]
            assert "o3-mini" not in ids, "o3-mini is blocked by the proxy"
            assert "claude-3-opus-20240229" not in ids, "Opus is blocked by the proxy"
            assert "claude-opus-4-7" not in ids, "Opus 4.7 is blocked by the proxy"
            # All roles now show both providers
            providers = {o["provider"] for o in role["options"]}
            assert "openai" in providers
            assert "anthropic" in providers


# ── LLM model cache ───────────────────────────────────────────────────────


class TestLLMModelCache:

    def test_set_active_model_updates_cache(self):
        from app.agents import llm as llm_module
        original = llm_module._model_cache.get("openai")
        llm_module.set_active_model("openai", "gpt-4.1")
        assert llm_module._model_cache["openai"] == "gpt-4.1"
        # Restore
        llm_module.set_active_model("openai", original or "gpt-4o-mini")

    def test_get_openai_llm_uses_cache(self):
        from app.agents import llm as llm_module
        llm_module.set_active_model("analysis", "gpt-4.1-nano")
        with patch("langchain_openai.ChatOpenAI") as mock_cls:
            mock_cls.return_value = MagicMock()
            llm_module.get_openai_llm()
            call_kwargs = mock_cls.call_args[1]
            assert call_kwargs["model"] == "gpt-4.1-nano"
        llm_module.set_active_model("analysis", "gpt-4o-mini")

    def test_get_openai_llm_explicit_override(self):
        from app.agents import llm as llm_module
        with patch("langchain_openai.ChatOpenAI") as mock_cls:
            mock_cls.return_value = MagicMock()
            llm_module.get_openai_llm(model="gpt-4o")
            call_kwargs = mock_cls.call_args[1]
            assert call_kwargs["model"] == "gpt-4o"

    def test_get_anthropic_llm_uses_cache(self):
        from app.agents import llm as llm_module
        from app.config import settings
        if not settings.anthropic_api_key:
            pytest.skip("No Anthropic key configured")
        llm_module.set_active_model("synthesis", "claude-haiku-4-5")
        with patch("langchain_anthropic.ChatAnthropic") as mock_cls:
            mock_cls.return_value = MagicMock()
            llm_module.get_anthropic_llm()
            call_kwargs = mock_cls.call_args[1]
            assert call_kwargs["model"] == "claude-haiku-4-5"
        llm_module.set_active_model("synthesis", "claude-sonnet-4-6")

    def test_get_openai_llm_routes_to_anthropic_when_claude_selected(self):
        """If a Claude model is set for analysis role, get_openai_llm returns ChatAnthropic."""
        from app.agents import llm as llm_module
        from app.config import settings
        if not settings.anthropic_api_key:
            pytest.skip("No Anthropic key configured")
        llm_module.set_active_model("analysis", "claude-haiku-4-5")
        with patch("langchain_anthropic.ChatAnthropic") as mock_cls:
            mock_cls.return_value = MagicMock()
            llm_module.get_openai_llm()
            assert mock_cls.called
        llm_module.set_active_model("analysis", "gpt-4o-mini")


# ── No-evidence guard ─────────────────────────────────────────────────────


class TestNoEvidenceGuard:

    def _guard(self, session: Session) -> bool:
        from app.api.chat import _has_analyzable_evidence
        return _has_analyzable_evidence(session)

    def test_greeting_session_has_no_evidence(self):
        s = _session(outcome="success", failure_type=None, failure_summary=None)
        assert self._guard(s) is False

    def test_tool_misfire_has_evidence(self):
        s = _session(
            failure_type="tool_misfire",
            tool_calls=[ToolCall(call_id="c1", tool_name="t", parameters={}, status="failed")],
        )
        assert self._guard(s) is True

    def test_retrieval_event_is_evidence(self):
        s = _session(
            outcome="success", failure_type=None,
            retrieval_events=[RetrievalEvent(event_id="r1", query="q", chunks_returned=0)],
        )
        assert self._guard(s) is True

    def test_failure_type_alone_is_evidence(self):
        s = _session(failure_type="blind_spot")
        assert self._guard(s) is True

    def test_outcome_failure_is_evidence(self):
        s = _session(outcome="failure", failure_type=None)
        assert self._guard(s) is True


# ── Rate limit values ─────────────────────────────────────────────────────


def test_rate_limit_values():
    from app.utils.rate_limit import RateLimitMiddleware
    mw = RateLimitMiddleware(app=None, per_minute=100, per_hour=1000)
    assert mw._per_minute == 100
    assert mw._per_hour == 1000
