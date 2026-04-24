"""Main LangGraph StateGraph — orchestrates the full analysis pipeline.

Flow:
    classify_intent → [vector_retrieve || graph_traverse] → rerank
        → conditional routing to analysis module → synthesize
"""

import structlog
from langgraph.graph import END, StateGraph

from app.agents.nodes.blind_spot import blind_spot
from app.agents.nodes.classify import classify_intent
from app.agents.nodes.hallucination_rca import hallucination_rca
from app.agents.nodes.memory_debug import memory_debug
from app.agents.nodes.rerank import rerank
from app.agents.nodes.retrieve import graph_traverse, vector_retrieve
from app.agents.nodes.synthesize import synthesize
from app.agents.nodes.tool_debug import tool_debug
from app.agents.state import AgentState
from app.models.trace import FailureType

logger = structlog.get_logger()


def _route_to_module(state: AgentState) -> str:
    """Route to the appropriate analysis module based on failure classification."""
    failure_type = state.get("failure_type", FailureType.UNKNOWN)

    routing = {
        FailureType.MEMORY: "memory_debug",
        FailureType.TOOL_MISFIRE: "tool_debug",
        FailureType.HALLUCINATION: "hallucination_rca",
        FailureType.BLIND_SPOT: "blind_spot",
    }

    route = routing.get(failure_type, "memory_debug")  # default to memory_debug for unknown
    logger.info("routing_to_module", failure_type=str(failure_type), module=route)
    return route


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

    # classify → parallel retrieval
    graph.add_edge("classify_intent", "vector_retrieve")
    graph.add_edge("classify_intent", "graph_traverse")

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


# Singleton compiled graph
analysis_graph = build_analysis_graph()
