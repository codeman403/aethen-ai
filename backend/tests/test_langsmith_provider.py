"""Tests for the LangSmith trace provider and adapter."""

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest

from app.models.trace import FailureType, ToolCallStatus
from app.providers.langsmith_provider import LangSmithProvider, LangSmithTraceAdapter


adapter = LangSmithTraceAdapter()


# ── Helpers ────────────────────────────────────────────────────────────────

def _make_run(
    run_type="chain",
    name="test-agent",
    inputs=None,
    outputs=None,
    error=None,
    tags=None,
    child_runs=None,
    run_id=None,
    start_time=None,
    end_time=None,
):
    run = MagicMock()
    run.id = run_id or uuid.uuid4()
    run.run_type = run_type
    run.name = name
    run.inputs = inputs or {}
    run.outputs = outputs or {}
    run.error = error
    run.tags = tags or []
    run.child_runs = child_runs or []
    run.extra = {}
    run.start_time = start_time or datetime.now(UTC)
    run.end_time = end_time or datetime.now(UTC)
    run.feedback_stats = {}
    run.parent_run_id = None
    return run


# ── LangSmithTraceAdapter ─────────────────────────────────────────────────

class TestLangSmithTraceAdapter:

    def test_adapt_simple_root_run(self):
        run = _make_run(name="my-agent")
        session = adapter.adapt_run(run)
        assert session.trace_source == "langsmith"
        assert session.agent_id == "my-agent"
        assert session.outcome == "success"

    def test_failed_root_run_sets_outcome_failure(self):
        run = _make_run(error="Something went wrong")
        session = adapter.adapt_run(run)
        assert session.outcome == "failure"
        assert session.failure_summary is not None
        assert "Something went wrong" in session.failure_summary

    def test_trace_source_is_always_langsmith(self):
        run = _make_run()
        session = adapter.adapt_run(run)
        assert session.trace_source == "langsmith"

    def test_llm_child_run_extracted(self):
        llm_run = _make_run(
            run_type="llm",
            name="ChatOpenAI",
            inputs={"messages": [{"role": "user", "content": "What is the refund policy?"}]},
            outputs={"generations": [[{"text": "Based on our policy..."}]]},
        )
        root = _make_run(child_runs=[llm_run])
        session = adapter.adapt_run(root)
        assert len(session.llm_calls) == 1
        assert "refund policy" in session.llm_calls[0].prompt
        assert "Based on our policy" in session.llm_calls[0].response

    def test_tool_child_run_extracted(self):
        tool_run = _make_run(
            run_type="tool",
            name="update_user_record",
            inputs={"field": "email", "value": "test@example.com"},
            outputs={"output": "Updated successfully"},
        )
        root = _make_run(child_runs=[tool_run])
        session = adapter.adapt_run(root)
        assert len(session.tool_calls) == 1
        assert session.tool_calls[0].tool_name == "update_user_record"
        assert session.tool_calls[0].status == ToolCallStatus.SUCCESS

    def test_failed_tool_run_has_failed_status(self):
        tool_run = _make_run(
            run_type="tool",
            name="update_user_record",
            inputs={},
            error="PermissionError: insufficient privileges",
        )
        root = _make_run(child_runs=[tool_run])
        session = adapter.adapt_run(root)
        assert len(session.tool_calls) == 1
        assert session.tool_calls[0].status == ToolCallStatus.FAILED
        assert "PermissionError" in (session.tool_calls[0].error or "")

    def test_retriever_child_run_extracted(self):
        docs = [
            {"page_content": "Billing info", "metadata": {"source": "doc-1", "score": 0.82}},
            {"page_content": "Refund policy", "metadata": {"source": "doc-2", "score": 0.71}},
        ]
        retriever_run = _make_run(
            run_type="retriever",
            name="VectorStoreRetriever",
            inputs={"query": "refund policy"},
            outputs={"documents": docs},
        )
        root = _make_run(child_runs=[retriever_run])
        session = adapter.adapt_run(root)
        assert len(session.retrieval_events) == 1
        assert session.retrieval_events[0].query == "refund policy"
        assert session.retrieval_events[0].chunks_returned == 2

    def test_retrieval_tool_by_name_extracted(self):
        """Tools with retrieval-like names become RetrievalEvents, not ToolCalls."""
        search_run = _make_run(
            run_type="tool",
            name="search_knowledge_base",
            inputs={"query": "billing"},
            outputs={"output": []},
        )
        root = _make_run(child_runs=[search_run])
        session = adapter.adapt_run(root)
        assert len(session.retrieval_events) == 1
        assert len(session.tool_calls) == 0

    def test_nested_chain_runs_walked_recursively(self):
        """LLM calls nested inside intermediate chains are still extracted."""
        llm_run = _make_run(
            run_type="llm",
            inputs={"prompts": ["What is X?"]},
            outputs={"generations": [[{"text": "X is Y"}]]},
        )
        inner_chain = _make_run(run_type="chain", name="inner", child_runs=[llm_run])
        root = _make_run(run_type="chain", child_runs=[inner_chain])
        session = adapter.adapt_run(root)
        assert len(session.llm_calls) == 1

    def test_infer_failure_type_tool_misfire(self):
        tool_run = _make_run(
            run_type="tool",
            name="api_call",
            error="TimeoutError: request timed out",
        )
        root = _make_run(child_runs=[tool_run])
        session = adapter.adapt_run(root)
        assert session.failure_type == FailureType.TOOL_MISFIRE

    def test_infer_failure_type_blind_spot(self):
        retriever_run = _make_run(
            run_type="retriever",
            inputs={"query": "enterprise pricing"},
            outputs={"documents": []},
        )
        root = _make_run(child_runs=[retriever_run])
        session = adapter.adapt_run(root)
        assert session.failure_type == FailureType.BLIND_SPOT

    def test_infer_failure_type_from_tags(self):
        run = _make_run(tags=["hallucination_detected"])
        session = adapter.adapt_run(run)
        assert session.failure_type == FailureType.HALLUCINATION

    def test_success_run_no_failure_type(self):
        llm_run = _make_run(
            run_type="llm",
            inputs={"messages": [{"role": "user", "content": "hi"}]},
            outputs={"generations": [[{"text": "hello"}]]},
        )
        root = _make_run(child_runs=[llm_run])
        session = adapter.adapt_run(root)
        assert session.failure_type is None
        assert session.outcome == "success"

    def test_depth_guard_prevents_infinite_recursion(self):
        """Pathologically deep nesting is handled gracefully."""
        # Build a chain 15 levels deep
        leaf = _make_run(run_type="llm",
                         inputs={"prompts": ["q"]},
                         outputs={"generations": [[{"text": "a"}]]})
        node = leaf
        for _ in range(15):
            node = _make_run(run_type="chain", child_runs=[node])
        session = adapter.adapt_run(node)
        # Should not raise; may or may not extract the leaf depending on depth guard
        assert session is not None

    def test_agent_id_extracted_from_metadata(self):
        run = _make_run(name="demo-agent")
        run.extra = {"metadata": {"user_id": "Demo Agent"}}
        session = adapter.adapt_run(run)
        assert session.agent_id == "Demo Agent"

    def test_latency_calculated_from_start_end(self):
        start = datetime(2026, 1, 1, 10, 0, 0, tzinfo=UTC)
        end = datetime(2026, 1, 1, 10, 0, 2, tzinfo=UTC)  # 2 seconds
        llm_run = _make_run(
            run_type="llm",
            inputs={"prompts": ["q"]},
            outputs={"generations": [[{"text": "a"}]]},
            start_time=start,
            end_time=end,
        )
        root = _make_run(child_runs=[llm_run])
        session = adapter.adapt_run(root)
        assert session.llm_calls[0].latency_ms == pytest.approx(2000.0)


# ── LangSmithProvider ─────────────────────────────────────────────────────

class TestLangSmithProvider:

    def _make_provider(self):
        return LangSmithProvider(
            api_key="test-key",
            endpoint="https://api.smith.langchain.com",
            project_name="default",
        )

    @pytest.mark.asyncio
    async def test_fetch_traces_returns_sessions(self):
        provider = self._make_provider()
        mock_run = _make_run(
            name="test-chain",
            child_runs=[
                _make_run(
                    run_type="tool",
                    name="search",
                    error="ConnectionError",
                )
            ],
        )

        with patch("langsmith.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            mock_client.list_runs.return_value = [mock_run]

            sessions = await provider.fetch_traces(limit=10)

        assert len(sessions) == 1
        assert sessions[0].trace_source == "langsmith"

    @pytest.mark.asyncio
    async def test_fetch_traces_skips_aethen_internal_runs(self):
        provider = self._make_provider()
        internal_run = _make_run(name="aethen-analysis-session123")
        real_run = _make_run(name="user-agent")

        with patch("langsmith.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            mock_client.list_runs.return_value = [internal_run, real_run]

            sessions = await provider.fetch_traces(limit=10)

        assert len(sessions) == 1
        assert sessions[0].agent_id == "user-agent"

    @pytest.mark.asyncio
    async def test_fetch_traces_with_since_passes_start_time(self):
        provider = self._make_provider()
        since = datetime(2026, 1, 1, tzinfo=UTC)

        with patch("langsmith.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            mock_client.list_runs.return_value = []

            await provider.fetch_traces(limit=10, since=since)

        call_kwargs = mock_client.list_runs.call_args[1]
        assert call_kwargs["start_time"] == since

    @pytest.mark.asyncio
    async def test_health_check_ok(self):
        provider = self._make_provider()
        mock_project = MagicMock()
        mock_project.name = "default"

        with patch("langsmith.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            mock_client.list_projects.return_value = [mock_project]

            result = await provider.health_check()

        assert result["status"] == "ok"
        assert "default" in result["detail"]

    @pytest.mark.asyncio
    async def test_health_check_error(self):
        provider = self._make_provider()

        with patch("langsmith.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            mock_client.list_projects.side_effect = Exception("Invalid API key")

            result = await provider.health_check()

        assert result["status"] == "error"
        assert "Invalid API key" in result["detail"]
