"""Main LangGraph StateGraph — orchestrates the full analysis pipeline.

Flow:
    classify_intent → [vector_retrieve || graph_traverse] → rerank
        → conditional routing to analysis module → synthesize
"""

import structlog
from langgraph.graph import END, StateGraph

from app.agents.nodes.blind_spot import blind_spot
from app.agents.nodes.classify import classify_intent
from app.agents.nodes.fast_analyze import fast_analyze
from app.agents.nodes.hallucination_rca import hallucination_rca
from app.agents.nodes.memory_debug import memory_debug
from app.agents.nodes.rerank import rerank
from app.agents.nodes.retrieve import graph_traverse, vector_retrieve
from app.agents.nodes.synthesize import synthesize
from app.agents.nodes.tool_debug import tool_debug
from app.agents.state import AgentState
from app.models.trace import FailureType

logger = structlog.get_logger()


def _route_after_classify(state: AgentState) -> str:
    """After classification: skip full pipeline if no failure pattern detected."""
    failure_type = state.get("failure_type", FailureType.UNKNOWN)
    if failure_type == FailureType.UNKNOWN:
        logger.info("early_exit_triggered", reason="no_failure_pattern_detected")
        return "early_exit"
    return "retrieve"


def _route_to_module(state: AgentState) -> str:
    """Route to the appropriate analysis module based on failure classification."""
    failure_type = state.get("failure_type", FailureType.UNKNOWN)

    routing = {
        FailureType.MEMORY: "memory_debug",
        FailureType.TOOL_MISFIRE: "tool_debug",
        FailureType.HALLUCINATION: "hallucination_rca",
        FailureType.BLIND_SPOT: "blind_spot",
    }

    route = routing.get(failure_type, "memory_debug")
    logger.info("routing_to_module", failure_type=str(failure_type), module=route)
    return route


def _early_exit_node(state: AgentState) -> dict:
    """Return a minimal report when no failure pattern is found — skips all retrieval/analysis."""
    from app.agents.state import AnalysisReport
    session = state["session"]
    if hasattr(session, "session_id"):
        session_id = session.session_id
    else:
        session_id = str(session.get("session_id", "unknown"))

    report = AnalysisReport(
        session_id=session_id,
        failure_type=FailureType.UNKNOWN,
        summary="No failure pattern detected in this conversation. The agent appears to be responding normally.",
        findings=[],
        root_cause="",
        confidence=0.0,
    )
    return {"report": report.model_dump(mode="json"), "early_exit": True}


def _merge_retrieval(state: AgentState) -> dict:
    """No-op merge node after parallel retrieval — state is already merged by LangGraph."""
    return {}


def build_analysis_graph() -> StateGraph:
    """Build and compile the analysis pipeline graph.

    Returns a compiled LangGraph that can be invoked with:
        result = await graph.ainvoke({"session": session_obj})
    """
    graph = StateGraph(AgentState)

    # Add all nodes
    graph.add_node("classify_intent", classify_intent)
    graph.add_node("early_exit", _early_exit_node)
    graph.add_node("start_retrieval", lambda s: {})  # pass-through to fan out to parallel retrieval
    graph.add_node("vector_retrieve", vector_retrieve)
    graph.add_node("graph_traverse", graph_traverse)
    graph.add_node("merge_retrieval", _merge_retrieval)
    graph.add_node("rerank", rerank)
    graph.add_node("memory_debug", memory_debug)
    graph.add_node("tool_debug", tool_debug)
    graph.add_node("hallucination_rca", hallucination_rca)
    graph.add_node("blind_spot", blind_spot)
    graph.add_node("synthesize", synthesize)

    # Set entry point
    graph.set_entry_point("classify_intent")

    # classify → early_exit (UNKNOWN) OR start_retrieval (known failure)
    graph.add_conditional_edges(
        "classify_intent",
        _route_after_classify,
        {"early_exit": "early_exit", "retrieve": "start_retrieval"},
    )
    graph.add_edge("early_exit", END)

    # start_retrieval fans out to parallel vector + graph retrieval
    graph.add_edge("start_retrieval", "vector_retrieve")
    graph.add_edge("start_retrieval", "graph_traverse")

    # parallel retrieval → merge → rerank
    graph.add_edge("vector_retrieve", "merge_retrieval")
    graph.add_edge("graph_traverse", "merge_retrieval")
    graph.add_edge("merge_retrieval", "rerank")

    # rerank → conditional routing to analysis module
    graph.add_conditional_edges(
        "rerank",
        _route_to_module,
        {
            "memory_debug": "memory_debug",
            "tool_debug": "tool_debug",
            "hallucination_rca": "hallucination_rca",
            "blind_spot": "blind_spot",
        },
    )

    # All analysis modules → synthesize → END
    graph.add_edge("memory_debug", "synthesize")
    graph.add_edge("tool_debug", "synthesize")
    graph.add_edge("hallucination_rca", "synthesize")
    graph.add_edge("blind_spot", "synthesize")
    graph.add_edge("synthesize", END)

    return graph.compile()


# Legacy full pipeline — kept for reference / rollback
_legacy_analysis_graph = build_analysis_graph()


def build_fast_analysis_graph() -> StateGraph:
    """Build the fast analysis graph for low-latency use cases (demo agent).

    Differences from analysis_graph:
    - Skips graph_traverse (Neo4j) — saves ~3s, no cross-session value for single-session demo
    - Skips Cohere reranking — saves ~1s, Pinecone top-k is sufficient for demo
    - Merges analysis module + synthesis into fast_analyze — saves ~8-13s (one LLM call)
    - Early exit on UNKNOWN failure type (same as full graph)

    Flow: classify_intent → (UNKNOWN→early_exit) | (known→vector_retrieve→fast_analyze) → END
    """
    graph = StateGraph(AgentState)

    graph.add_node("classify_intent", classify_intent)
    graph.add_node("early_exit",      _early_exit_node)
    graph.add_node("vector_retrieve", vector_retrieve)
    graph.add_node("fast_analyze",    fast_analyze)

    graph.set_entry_point("classify_intent")

    graph.add_conditional_edges(
        "classify_intent",
        _route_after_classify,
        {"early_exit": "early_exit", "retrieve": "vector_retrieve"},
    )
    graph.add_edge("early_exit",      END)
    graph.add_edge("vector_retrieve", "fast_analyze")
    graph.add_edge("fast_analyze",    END)

    return graph.compile()


# Fast graph — used by analyzeDirectly (demo agent)
fast_analysis_graph = build_fast_analysis_graph()


def _route_after_parallel(state: AgentState) -> str:
    """Route after classify + retrieval both complete (parallel start pattern)."""
    failure_type = state.get("failure_type", FailureType.UNKNOWN)
    if failure_type == FailureType.UNKNOWN:
        logger.info("optimized_early_exit", reason="no_failure_pattern_detected")
        return "early_exit"
    return "fast_analyze"


def build_optimized_analysis_graph() -> StateGraph:
    """Optimized full analysis graph — candidate replacement for analysis_graph.

    Optimizations vs analysis_graph:
    1. Parallel classify + retrieve: classify_intent, vector_retrieve, graph_traverse
       all start simultaneously (saves ~2s vs sequential classify-then-retrieve).
    2. skip_graph support in graph_traverse (caller sets skip_graph=True to save ~3s).
    3. fast_analyze replaces separate analysis module + synthesize (saves ~8-12s).

    Evals must pass before this replaces analysis_graph as the singleton.
    """
    graph = StateGraph(AgentState)

    # Pass-through entry node to fan out to all three in parallel
    graph.add_node("parallel_start",   lambda s: {})
    graph.add_node("classify_intent",  classify_intent)
    graph.add_node("early_exit",       _early_exit_node)
    graph.add_node("vector_retrieve",  vector_retrieve)
    graph.add_node("graph_traverse",   graph_traverse)
    graph.add_node("merge_retrieval",  _merge_retrieval)
    graph.add_node("fast_analyze",     fast_analyze)

    graph.set_entry_point("parallel_start")

    # Fan out all three in parallel from the entry node
    graph.add_edge("parallel_start",  "classify_intent")
    graph.add_edge("parallel_start",  "vector_retrieve")
    graph.add_edge("parallel_start",  "graph_traverse")

    # All three converge at merge_retrieval
    graph.add_edge("classify_intent", "merge_retrieval")
    graph.add_edge("vector_retrieve",  "merge_retrieval")
    graph.add_edge("graph_traverse",   "merge_retrieval")

    # After merge: route based on classify result
    graph.add_conditional_edges(
        "merge_retrieval",
        _route_after_parallel,
        {"early_exit": "early_exit", "fast_analyze": "fast_analyze"},
    )
    graph.add_edge("early_exit",    END)
    graph.add_edge("fast_analyze",  END)

    return graph.compile()


# Primary graph — evals confirmed: 100% accuracy, 85.56% judge (up from 83%)
# Replaces legacy full pipeline. Roll back to _legacy_analysis_graph if regressions appear.
analysis_graph = build_optimized_analysis_graph()
_optimized_analysis_graph_candidate = analysis_graph  # alias kept for compat
