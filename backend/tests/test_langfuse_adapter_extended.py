"""Extended tests for LangfuseTraceAdapter helper methods."""

import json
import pytest

from app.providers.langfuse_provider import LangfuseTraceAdapter
from app.models.trace import LLMCall, RetrievalEvent, ToolCall, FailureType


# Create an adapter instance without calling __init__ (no Langfuse credentials needed)
adapter = LangfuseTraceAdapter.__new__(LangfuseTraceAdapter)


class TestExtractHumanPrompt:

    def test_extracts_from_openai_wire_format(self):
        value = [
            {"role": "system", "content": "You are an assistant."},
            {"role": "user", "content": "What is the refund policy?"},
        ]
        result = adapter._extract_human_prompt(value)
        assert "refund policy" in result

    def test_extracts_last_user_message_in_multi_turn(self):
        value = [
            {"role": "user", "content": "First question"},
            {"role": "assistant", "content": "First answer"},
            {"role": "user", "content": "Second question"},
        ]
        result = adapter._extract_human_prompt(value)
        assert "Second question" in result

    def test_skips_tool_schema_dicts(self):
        value = [
            {"type": "function", "function": {"name": "search", "description": "..."}},
            {"role": "user", "content": "Search for something"},
        ]
        result = adapter._extract_human_prompt(value)
        assert "Search for something" in result

    def test_handles_langchain_messages_and_tools_dict(self):
        value = {
            "messages": [{"role": "user", "content": "test query"}],
            "tools": [{"type": "function", "function": {"name": "search"}}],
        }
        result = adapter._extract_human_prompt(value)
        assert "test query" in result

    def test_handles_plain_string(self):
        result = adapter._extract_human_prompt("plain text prompt")
        assert "plain text prompt" in result

    def test_handles_json_string_input(self):
        messages = [{"role": "user", "content": "json question"}]
        result = adapter._extract_human_prompt(json.dumps(messages))
        assert "json question" in result


class TestExtractToolCallResponse:

    def test_null_content_with_tool_calls_synthesizes_description(self):
        value = {
            "content": None,
            "tool_calls": [{"function": {"name": "search_kb", "arguments": '{"query": "billing"}'}}],
        }
        result = adapter._extract_tool_call_response(value)
        assert "search_kb" in result
        assert "Called tool" in result

    def test_non_dict_returns_empty_string(self):
        # _extract_tool_call_response only handles dicts; non-dict → ""
        result = adapter._extract_tool_call_response("plain string")
        assert result == ""

    def test_dict_with_content_not_tool_call_returns_empty(self):
        # If content is present, it's not a tool-call output — returns "" to let _extract_text handle it
        value = {"content": "Here is my answer"}
        result = adapter._extract_tool_call_response(value)
        assert result == ""

    def test_empty_tool_calls_returns_empty(self):
        value = {"content": None, "tool_calls": []}
        result = adapter._extract_tool_call_response(value)
        assert result == ""

    def test_langchain_format_tool_call(self):
        value = {
            "content": None,
            "tool_calls": [{"name": "update_record", "args": {"field": "email"}, "type": "tool_call"}],
        }
        result = adapter._extract_tool_call_response(value)
        assert "update_record" in result


class TestExtractRetrievalFromTraceMessages:

    def _make_messages(self, tool_name, query, results):
        """Build a realistic message list with AIMessage tool call + ToolMessage response."""
        return [
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"id": "call_1", "name": tool_name,
                                 "args": {"query": query}, "type": "tool_call"}],
            },
            {
                "role": "tool",
                "tool_call_id": "call_1",
                "content": json.dumps(results),
            }
        ]

    def test_extracts_retrieval_from_search_knowledge_base(self):
        messages = self._make_messages(
            "search_knowledge_base", "billing refund",
            [{"doc_id": "doc-1", "content": "Billing info", "score": 0.82},
             {"doc_id": "doc-2", "content": "Refund policy", "score": 0.71}]
        )
        events = adapter._extract_retrieval_from_trace_messages(messages)
        assert len(events) > 0
        assert events[0].chunks_returned == 2
        assert "doc-1" in events[0].actual_doc_ids

    def test_returns_empty_list_for_no_tool_messages(self):
        messages = [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]
        events = adapter._extract_retrieval_from_trace_messages(messages)
        assert events == []

    def test_handles_empty_input(self):
        events = adapter._extract_retrieval_from_trace_messages([])
        assert events == []

    def test_handles_none_input(self):
        events = adapter._extract_retrieval_from_trace_messages(None)
        assert events == []

    def test_non_retrieval_tool_ignored(self):
        messages = self._make_messages(
            "create_ticket", "login broken",
            [{"ticket_id": "T-123", "status": "created"}]
        )
        events = adapter._extract_retrieval_from_trace_messages(messages)
        # create_ticket is not a retrieval tool
        assert events == []


class TestLinkRetrievalToLLM:

    def test_backfills_source_documents_from_preceding_retrieval(self):
        retrieval = RetrievalEvent(
            event_id="r1", query="billing",
            chunks_returned=2, actual_doc_ids=["doc-a", "doc-b"],
        )
        llm_call = LLMCall(
            call_id="lc1", prompt="q", response="a",
            model="gpt-4o-mini", source_documents=[],
        )
        # r1 ends before lc1 starts — should be linked
        obs_timestamps = {
            "r1":  ("2026-04-28T10:00:00", "2026-04-28T10:00:01"),
            "lc1": ("2026-04-28T10:00:02", "2026-04-28T10:00:03"),
        }
        adapter._link_retrieval_to_llm([llm_call], [retrieval], obs_timestamps)
        assert "doc-a" in llm_call.source_documents
        assert "doc-b" in llm_call.source_documents

    def test_does_not_overwrite_existing_source_documents(self):
        retrieval = RetrievalEvent(
            event_id="r1", query="q", chunks_returned=1, actual_doc_ids=["doc-new"],
        )
        llm_call = LLMCall(
            call_id="lc1", prompt="q", response="a",
            model="gpt-4o-mini", source_documents=["doc-existing"],
        )
        obs_timestamps = {
            "r1":  ("2026-04-28T10:00:00", "2026-04-28T10:00:01"),
            "lc1": ("2026-04-28T10:00:02", "2026-04-28T10:00:03"),
        }
        adapter._link_retrieval_to_llm([llm_call], [retrieval], obs_timestamps)
        assert "doc-existing" in llm_call.source_documents
        assert "doc-new" not in llm_call.source_documents

    def test_retrieval_after_llm_not_linked(self):
        retrieval = RetrievalEvent(
            event_id="r1", query="q", chunks_returned=1, actual_doc_ids=["doc-late"],
        )
        llm_call = LLMCall(
            call_id="lc1", prompt="q", response="a",
            model="gpt-4o-mini", source_documents=[],
        )
        # r1 ends AFTER lc1 starts — should NOT be linked
        obs_timestamps = {
            "lc1": ("2026-04-28T10:00:00", "2026-04-28T10:00:01"),
            "r1":  ("2026-04-28T10:00:02", "2026-04-28T10:00:03"),
        }
        adapter._link_retrieval_to_llm([llm_call], [retrieval], obs_timestamps)
        assert llm_call.source_documents == []


class TestInferFailureType:

    def test_infers_memory_from_tags(self):
        trace = {"tags": ["memory_failure"], "name": "demo-chat", "input": "", "output": ""}
        ft = adapter._infer_failure_type(trace, [], [], [])
        assert ft == FailureType.MEMORY

    def test_infers_tool_misfire_from_failed_tools(self):
        tools = [ToolCall(call_id="c1", tool_name="search", parameters={}, status="failed")]
        trace = {"tags": [], "name": "demo-chat", "input": "", "output": ""}
        ft = adapter._infer_failure_type(trace, [], tools, [])
        assert ft == FailureType.TOOL_MISFIRE

    def test_infers_blind_spot_from_empty_retrieval(self):
        retrievals = [RetrievalEvent(event_id="r1", query="billing", chunks_returned=0)]
        trace = {"tags": [], "name": "demo-chat", "input": "", "output": ""}
        ft = adapter._infer_failure_type(trace, [], [], retrievals)
        assert ft == FailureType.BLIND_SPOT

    def test_success_trace_returns_none(self):
        trace = {"tags": [], "name": "success-run", "input": "", "output": ""}
        ft = adapter._infer_failure_type(trace, [], [], [])
        assert ft is None

    def test_hallucination_tag_inferred(self):
        trace = {"tags": ["hallucination_detected"], "name": "demo", "input": "", "output": ""}
        ft = adapter._infer_failure_type(trace, [], [], [])
        assert ft == FailureType.HALLUCINATION

    def test_mismatched_doc_ids_infers_memory(self):
        # Memory heuristic fires when expected_doc_ids != actual_doc_ids on a RetrievalEvent
        retrievals = [RetrievalEvent(
            event_id="r1", query="billing", chunks_returned=2,
            expected_doc_ids=["doc-expected"],
            actual_doc_ids=["doc-actual-different"],
        )]
        trace = {"tags": [], "name": "demo", "input": "", "output": ""}
        ft = adapter._infer_failure_type(trace, [], [], retrievals)
        assert ft == FailureType.MEMORY
