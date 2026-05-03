"""Pydantic models for AI agent execution traces."""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class FailureType(StrEnum):
    """Categories of AI agent failures."""

    MEMORY = "memory"
    TOOL_MISFIRE = "tool_misfire"
    HALLUCINATION = "hallucination"
    BLIND_SPOT = "blind_spot"
    UNKNOWN = "unknown"


class ToolCallStatus(StrEnum):
    """Outcome of a tool invocation."""

    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"


class LLMCall(BaseModel):
    """A single LLM invocation within a session."""

    call_id: str = Field(description="Unique identifier for this LLM call")
    model: str = Field(description="Model name (e.g., claude-3.5-sonnet)")
    prompt: str = Field(description="Input prompt sent to the LLM")
    response: str = Field(description="LLM response text")
    tokens_in: int = Field(default=0, description="Input token count")
    tokens_out: int = Field(default=0, description="Output token count")
    latency_ms: float = Field(default=0.0, description="Call latency in milliseconds")
    hallucination_flag: bool = Field(default=False, description="Whether this response was flagged as hallucinated")
    source_documents: list[str] = Field(default_factory=list, description="Source doc IDs used for grounding")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ToolCall(BaseModel):
    """A single tool invocation within a session."""

    call_id: str = Field(description="Unique identifier for this tool call")
    tool_name: str = Field(description="Name of the tool invoked")
    parameters: dict = Field(default_factory=dict, description="Parameters passed to the tool")
    result: str | None = Field(default=None, description="Tool return value")
    error: str | None = Field(default=None, description="Error message if tool call failed")
    status: ToolCallStatus = Field(default=ToolCallStatus.SUCCESS, description="Outcome of the tool call")
    latency_ms: float = Field(default=0.0, description="Call latency in milliseconds")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class RetrievalEvent(BaseModel):
    """A single vector DB retrieval within a session."""

    event_id: str = Field(description="Unique identifier for this retrieval event")
    query: str = Field(description="The retrieval query text")
    namespace: str = Field(default="default", description="Pinecone namespace queried")
    chunks_returned: int = Field(default=0, description="Number of chunks returned")
    relevance_scores: list[float] = Field(default_factory=list, description="Similarity scores of returned chunks")
    metadata_filters: dict = Field(default_factory=dict, description="Metadata filters applied to query")
    expected_doc_ids: list[str] = Field(default_factory=list, description="Doc IDs that should have been retrieved")
    actual_doc_ids: list[str] = Field(default_factory=list, description="Doc IDs actually retrieved")
    doc_content: list[str] = Field(default_factory=list, description="Text content of retrieved documents")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Session(BaseModel):
    """A complete AI agent execution session with all trace events."""

    session_id: str = Field(description="Unique session identifier")
    agent_id: str = Field(description="Identifier of the agent that ran this session")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC), description="Session start time")
    outcome: str = Field(description="Session outcome: success or failure")
    failure_type: FailureType | None = Field(default=None, description="Type of failure if outcome is failure")
    failure_summary: str | None = Field(default=None, description="Human-readable failure description")
    llm_calls: list[LLMCall] = Field(default_factory=list, description="All LLM calls in this session")
    tool_calls: list[ToolCall] = Field(default_factory=list, description="All tool calls in this session")
    retrieval_events: list[RetrievalEvent] = Field(default_factory=list, description="All retrieval events")
    metadata: dict = Field(default_factory=dict, description="Additional session metadata")
    trace_source: str = Field(default="langfuse", description="Trace provider: langfuse | langsmith | demo | synthetic")


class IngestRequest(BaseModel):
    """Request body for the trace ingestion endpoint."""

    sessions: list[Session] = Field(description="One or more sessions to ingest", min_length=1)


class IngestResult(BaseModel):
    """Result of ingesting a batch of sessions."""

    sessions_ingested: int = Field(description="Number of sessions successfully ingested")
    events_processed: int = Field(description="Total trace events processed")
    analyses_queued: int = Field(default=0, description="Number of background analysis tasks started")
    errors: list[str] = Field(default_factory=list, description="Any errors encountered during ingestion")
