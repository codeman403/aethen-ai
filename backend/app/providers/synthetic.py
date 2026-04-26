"""Synthetic trace provider — wraps generate_traces.py logic."""

import random
import uuid
from datetime import UTC, datetime

from app.models.trace import (
    FailureType,
    LLMCall,
    RetrievalEvent,
    Session,
    ToolCall,
    ToolCallStatus,
)
from app.providers.base import TraceProvider


class SyntheticProvider(TraceProvider):
    """Generates synthetic agent traces for testing and demo purposes.

    Produces realistic failure scenarios across all 4 failure types.
    """

    AGENTS = ["support-agent-v2", "research-bot-v1", "coding-assistant-v3", "data-analyst-v1"]
    TOPICS = [
        "billing password reset", "API rate limits", "database migration",
        "kubernetes pod scheduling", "OAuth2 token refresh", "CSV export",
        "email notification settings", "user permission escalation",
    ]

    async def fetch_traces(self, limit: int = 50) -> list[Session]:
        """Generate a batch of synthetic trace sessions."""
        sessions: list[Session] = []
        failure_types = list(FailureType)
        failure_types.remove(FailureType.UNKNOWN)

        for i in range(limit):
            ft = failure_types[i % len(failure_types)]
            session = self._build_session(ft)
            sessions.append(session)

        return sessions

    async def health_check(self) -> dict:
        return {"status": "ok", "detail": "Synthetic provider always available"}

    def _build_session(self, failure_type: FailureType) -> Session:
        """Build a single synthetic session with the given failure type."""
        sid = f"{failure_type.value[:3]}-{uuid.uuid4().hex[:8]}"
        agent = random.choice(self.AGENTS)
        topic = random.choice(self.TOPICS)
        now = datetime.now(UTC)

        llm_calls = [self._build_llm_call(topic, failure_type)]
        tool_calls = [self._build_tool_call(topic, failure_type)]
        retrieval_events = [self._build_retrieval(topic, failure_type)]

        return Session(
            session_id=sid,
            agent_id=agent,
            timestamp=now,
            outcome="failure",
            failure_type=failure_type,
            failure_summary=f"Synthetic {failure_type.value} failure on: {topic}",
            llm_calls=llm_calls,
            tool_calls=tool_calls,
            retrieval_events=retrieval_events,
            metadata={"source": "synthetic", "topic": topic},
        )

    def _build_llm_call(self, topic: str, ft: FailureType) -> LLMCall:
        response = f"Here is the answer about {topic}..."
        hallucinated = ft == FailureType.HALLUCINATION

        if hallucinated:
            response = f"The system requires a quantum encryption reset for {topic}, which involves contacting the Mars satellite office."

        return LLMCall(
            call_id=f"llm-{uuid.uuid4().hex[:8]}",
            model="gpt-4o-mini",
            prompt=f"User asked: How do I handle {topic}?",
            response=response,
            tokens_in=random.randint(100, 500),
            tokens_out=random.randint(50, 300),
            latency_ms=random.uniform(200, 2000),
            hallucination_flag=hallucinated,
            source_documents=[f"doc-{uuid.uuid4().hex[:6]}"] if not hallucinated else [],
        )

    def _build_tool_call(self, topic: str, ft: FailureType) -> ToolCall:
        failed = ft == FailureType.TOOL_MISFIRE
        return ToolCall(
            call_id=f"tool-{uuid.uuid4().hex[:8]}",
            tool_name="search_knowledge_base" if not failed else "update_user_record",
            parameters={"query": topic},
            result=None if failed else f"Found 3 results for {topic}",
            error="PermissionError: insufficient privileges" if failed else None,
            status=ToolCallStatus.FAILED if failed else ToolCallStatus.SUCCESS,
            latency_ms=random.uniform(50, 500),
        )

    def _build_retrieval(self, topic: str, ft: FailureType) -> RetrievalEvent:
        is_memory = ft == FailureType.MEMORY
        is_blind = ft == FailureType.BLIND_SPOT

        return RetrievalEvent(
            event_id=f"ret-{uuid.uuid4().hex[:8]}",
            query=topic,
            chunks_returned=0 if is_blind else random.randint(1, 5),
            relevance_scores=[] if is_blind else [round(random.uniform(0.3, 0.95), 3) for _ in range(3)],
            expected_doc_ids=["doc-expected-001", "doc-expected-002"] if is_memory else [],
            actual_doc_ids=["doc-wrong-099"] if is_memory else [f"doc-{uuid.uuid4().hex[:6]}"],
        )
