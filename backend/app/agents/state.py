"""Shared state schema and output models for the LangGraph analysis pipeline."""

from typing import Any

from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from app.models.trace import FailureType, Session


def ensure_session(session_or_dict) -> Session:
    """Convert a dict back to a Session if LangGraph serialized it."""
    if isinstance(session_or_dict, dict):
        return Session(**session_or_dict)
    return session_or_dict

# ── LangGraph State ────────────────────────────────────────────────────────────


class AgentState(TypedDict, total=False):
    """State that flows through the LangGraph analysis pipeline.

    Nodes read/write specific keys; `total=False` allows partial updates.
    """

    # Input
    session: Session
    query: str  # optional natural-language question about the session

    # Classification
    failure_type: FailureType

    # Evidence (populated by retrieve + rerank nodes)
    vector_results: list[dict[str, Any]]
    graph_results: list[dict[str, Any]]
    reranked_evidence: list[dict[str, Any]]

    # Analysis (populated by the analysis module)
    analysis: str

    # Pipeline control
    early_exit: bool   # True when classify finds no failure pattern — skips retrieval/analysis
    skip_graph: bool   # True to skip Neo4j graph_traverse (saves ~3s when no cross-session data)

    # Final output
    report: dict[str, Any]  # serialized AnalysisReport


# ── Output Models ──────────────────────────────────────────────────────────────


class Finding(BaseModel):
    """A single diagnostic finding from an analysis module."""

    title: str = Field(description="Short finding headline")
    severity: str = Field(description="low | medium | high | critical")
    description: str = Field(description="Detailed explanation of the finding")
    evidence: list[str] = Field(default_factory=list, description="Supporting evidence references")
    recommendation: str = Field(default="", description="Suggested remediation")


class AnalysisReport(BaseModel):
    """Structured output from the analysis pipeline."""

    session_id: str = Field(description="ID of the analyzed session")
    failure_type: FailureType = Field(description="Classified failure type")
    summary: str = Field(description="Executive summary of the analysis")
    findings: list[Finding] = Field(default_factory=list, description="Detailed findings")
    root_cause: str = Field(default="", description="Identified root cause")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence score 0-1")
    raw_analysis: str = Field(default="", description="Full LLM analysis text")
