"""Tests for rerank node — _evidence_to_documents and rerank fallback."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.agents.nodes.rerank import _evidence_to_documents, rerank
from app.models.trace import Session, FailureType
import uuid


def _state(vector_results=None, graph_results=None, failure_type=FailureType.TOOL_MISFIRE):
    session = Session(
        session_id=str(uuid.uuid4()),
        agent_id="test-agent",
        outcome="failure",
        failure_type=failure_type,
        failure_summary="Tool failed",
    )
    return {
        "session": session,
        "failure_type": failure_type,
        "vector_results": vector_results or [],
        "graph_results": graph_results or [],
    }


class TestEvidenceToDocuments:

    def test_vector_result_with_text_produces_content(self):
        state = _state(vector_results=[{
            "score": 0.87,
            "metadata": {
                "failure_summary": "Tool update_user failed",
                "text": "Tool update_user: {} → failed | error: PermissionError",
            }
        }])
        docs = _evidence_to_documents(state)
        assert len(docs) == 1
        assert "0.870" in docs[0]
        assert "Tool update_user failed" in docs[0]
        assert "PermissionError" in docs[0]

    def test_vector_result_without_text_uses_empty_string(self):
        state = _state(vector_results=[{
            "score": 0.75,
            "metadata": {"failure_summary": "", "event_type": "tool_call"},
        }])
        docs = _evidence_to_documents(state)
        assert len(docs) == 1
        assert "0.750" in docs[0]

    def test_related_pattern_graph_result(self):
        state = _state(graph_results=[{
            "type": "related_pattern",
            "agent_id": "agent-X",
            "failure_summary": "PermissionError on write ops",
        }])
        docs = _evidence_to_documents(state)
        assert len(docs) == 1
        assert "agent-X" in docs[0]
        assert "PermissionError" in docs[0]

    def test_shared_chunk_graph_result(self):
        state = _state(graph_results=[{
            "type": "shared_chunk",
            "shared_doc_id": "doc-billing",
            "other_failure_type": "hallucination",
            "other_failure_summary": "Wrong billing info",
        }])
        docs = _evidence_to_documents(state)
        assert "doc-billing" in docs[0]
        assert "hallucination" in docs[0]

    def test_systemic_blind_spot_graph_result(self):
        state = _state(graph_results=[{
            "type": "systemic_blind_spot",
            "topic": "enterprise pricing",
            "total_hits": 12,
            "affected_agents": ["agent-a", "agent-b"],
        }])
        docs = _evidence_to_documents(state)
        assert "enterprise pricing" in docs[0]
        assert "12" in docs[0]
        assert "agent-a" in docs[0]

    def test_same_query_different_outcome_graph_result(self):
        state = _state(graph_results=[{
            "type": "same_query_different_outcome",
            "query_text": "what is the refund policy?",
            "other_failure_type": "memory",
        }])
        docs = _evidence_to_documents(state)
        assert "refund policy" in docs[0]
        assert "memory" in docs[0]

    def test_direct_result_with_summary_included(self):
        state = _state(graph_results=[{
            "type": "direct",
            "session": {"failure_summary": "Tool timed out after 30s"},
        }])
        docs = _evidence_to_documents(state)
        assert len(docs) == 1
        assert "timed out" in docs[0]

    def test_direct_result_without_summary_skipped(self):
        state = _state(graph_results=[{
            "type": "direct",
            "session": {"failure_summary": ""},
        }])
        docs = _evidence_to_documents(state)
        assert len(docs) == 0

    def test_unknown_graph_type_skipped(self):
        state = _state(graph_results=[{"type": "unknown_type", "data": "some value"}])
        docs = _evidence_to_documents(state)
        assert len(docs) == 0

    def test_combined_vector_and_graph_results(self):
        state = _state(
            vector_results=[{"score": 0.9, "metadata": {"failure_summary": "VS", "text": "vector text"}}],
            graph_results=[{"type": "related_pattern", "agent_id": "a", "failure_summary": "GS"}],
        )
        docs = _evidence_to_documents(state)
        assert len(docs) == 2

    def test_max_evidence_cap_at_20(self):
        vector_results = [
            {"score": 0.5, "metadata": {"failure_summary": f"summary-{i}", "text": f"text-{i}"}}
            for i in range(25)
        ]
        state = _state(vector_results=vector_results)
        docs = _evidence_to_documents(state)
        assert len(docs) == 20

    def test_empty_state_returns_empty_list(self):
        state = _state()
        docs = _evidence_to_documents(state)
        assert docs == []


class TestRerankNode:

    @pytest.mark.asyncio
    async def test_no_evidence_returns_empty(self):
        state = _state()
        result = await rerank(state)
        assert result["reranked_evidence"] == []

    @pytest.mark.asyncio
    async def test_no_cohere_key_falls_back_to_raw(self):
        state = _state(vector_results=[{
            "score": 0.8,
            "metadata": {"failure_summary": "Tool failed", "text": "error detail"},
        }])
        with patch("app.agents.nodes.rerank.settings") as mock_settings:
            mock_settings.cohere_api_key = ""
            result = await rerank(state)
        assert len(result["reranked_evidence"]) > 0
        assert result["reranked_evidence"][0]["relevance_score"] == 0.5

    @pytest.mark.asyncio
    async def test_cohere_error_falls_back_to_raw(self):
        state = _state(vector_results=[{
            "score": 0.8,
            "metadata": {"failure_summary": "Tool failed", "text": "error detail"},
        }])
        with patch("app.agents.nodes.rerank.settings") as mock_settings:
            mock_settings.cohere_api_key = "fake-key"
            with patch("app.agents.nodes.rerank.cohere.AsyncClientV2") as mock_cohere:
                mock_client = MagicMock()
                mock_client.rerank = AsyncMock(side_effect=Exception("API error"))
                mock_cohere.return_value = mock_client
                result = await rerank(state)
        assert len(result["reranked_evidence"]) > 0

    @pytest.mark.asyncio
    async def test_cohere_reranks_and_returns_scores(self):
        state = _state(vector_results=[
            {"score": 0.6, "metadata": {"failure_summary": "A", "text": "text A"}},
            {"score": 0.5, "metadata": {"failure_summary": "B", "text": "text B"}},
        ])
        mock_result_1 = MagicMock(index=0, relevance_score=0.95)
        mock_result_2 = MagicMock(index=1, relevance_score=0.72)
        mock_response = MagicMock(results=[mock_result_1, mock_result_2])

        with patch("app.agents.nodes.rerank.settings") as mock_settings:
            mock_settings.cohere_api_key = "fake-key"
            with patch("app.agents.nodes.rerank.cohere.AsyncClientV2") as mock_cohere:
                mock_client = MagicMock()
                mock_client.rerank = AsyncMock(return_value=mock_response)
                mock_cohere.return_value = mock_client
                result = await rerank(state)

        reranked = result["reranked_evidence"]
        assert len(reranked) == 2
        assert reranked[0]["relevance_score"] == 0.95
        assert reranked[1]["relevance_score"] == 0.72
