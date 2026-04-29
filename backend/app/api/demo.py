"""Demo Agent endpoints — run instrumented LLM scenarios and return the conversation turn.

POST /api/demo/run  { "scenario": "memory" | "tool_misfire" | "hallucination" | "blind_spot" }
GET  /api/demo/scenarios
"""

import asyncio
import json
import uuid

import structlog
from fastapi import APIRouter, HTTPException
from langchain_core.tools import tool
from pydantic import BaseModel

from app.config import settings
from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service
from app.utils.langfuse_utils import make_langfuse_handler
from app.utils.sanitize import sanitize_input


# ---------------------------------------------------------------------------
# Demo tools — real LangChain tools that produce Langfuse SPAN observations.
# These are intentionally wired to fail in realistic ways so demo chat sessions
# contain structured ToolCall data for tool_debug analysis.
# ---------------------------------------------------------------------------

@tool
def search_knowledge_base(query: str, namespace: str = "general") -> str:
    """Search the internal knowledge base for documentation or policies."""
    # Returns off-topic documents — simulates a memory retrieval failure
    return json.dumps([
        {"doc_id": "api_keys_101.pdf", "content": "API key rotation policy: rotate every 90 days...", "score": 0.81},
        {"doc_id": "oauth_setup.pdf", "content": "OAuth 2.0 setup guide for third-party integrations...", "score": 0.76},
    ])


@tool
def update_user_record(user_id: str, field: str, value: str) -> str:
    """Update a field on a user record in the CRM database."""
    raise PermissionError("insufficient privileges: caller lacks WRITE access to user_record table")


@tool
def create_support_ticket(title: str, description: str, priority: str = "medium") -> str:
    """Create a support ticket in the ticketing system."""
    ticket_id = f"TKT-{uuid.uuid4().hex[:6].upper()}"
    return json.dumps({"ticket_id": ticket_id, "status": "created", "priority": priority, "title": title})


@tool
def query_database(entity: str, filters: str = "") -> str:
    """Query the operational database for records."""
    raise ConnectionError("ConnectionError: database cluster unavailable — retry after 30s")


DEMO_TOOLS = [search_knowledge_base, update_user_record, create_support_ticket, query_database]
DEMO_TOOL_MAP = {t.name: t for t in DEMO_TOOLS}

logger = structlog.get_logger()

router = APIRouter(tags=["demo"])

# ---------------------------------------------------------------------------
# Scenario definitions (mirrors demo_agent.py, kept in sync)
# ---------------------------------------------------------------------------

SCENARIOS: dict[str, dict] = {
    "memory": {
        "name": "Memory Retrieval Failure",
        "description": "Retrieval system returns wrong documents — billing docs replaced by API key docs.",
        "system": "You are a support agent. Help the user with their billing issue.",
        "user": (
            "I can't reset my billing password. The retrieval system returned wrong "
            "documents about API keys instead of billing procedures."
        ),
        "tags": ["memory", "retrieval-failure"],
        "run_name": "demo-memory-retrieval-failure",
    },
    "tool_misfire": {
        "name": "Tool Misfire",
        "description": "Tool call returns a PermissionError — agent lacks privileges for the requested action.",
        "system": "You are a data assistant. Use available tools to help users.",
        "user": (
            "Please update my user profile. The update_user_record tool returned "
            "a PermissionError: insufficient privileges."
        ),
        "tags": ["tool_misfire", "permission-error"],
        "run_name": "demo-tool-misfire",
    },
    "hallucination": {
        "name": "Hallucination",
        "description": "LLM states a fact (quantum encryption) that has no basis in source documents.",
        "system": "You are a technical assistant. Only use verified information.",
        "user": (
            "Explain how quantum encryption works for password resets. "
            "Note: there is no such thing as quantum encryption for passwords."
        ),
        "tags": ["hallucination", "factual-error"],
        "run_name": "demo-hallucination",
    },
    "blind_spot": {
        "name": "Blind Spot — Knowledge Gap",
        "description": "Knowledge base returns 0 results — the topic simply doesn't exist in the docs.",
        "system": "You are a knowledge base assistant.",
        "user": (
            "How do I configure the experimental Zephyr module? "
            "The knowledge base returned 0 results for this query."
        ),
        "tags": ["blind_spot", "knowledge-gap"],
        "run_name": "demo-blind-spot-knowledge-gap",
    },
}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class DemoChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    session_id: str | None = None   # None on first turn; backend creates and returns one


class DemoChatResult(BaseModel):
    user_message: str
    assistant_response: str
    session_id: str                 # Always returned so frontend persists it
    langfuse_traced: bool


class DemoRunRequest(BaseModel):
    scenario: str


class DemoRunResult(BaseModel):
    scenario: str
    scenario_name: str
    user_message: str
    assistant_response: str
    session_id: str
    langfuse_traced: bool


class ScenarioInfo(BaseModel):
    key: str
    name: str
    description: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/demo/scenarios", response_model=ApiResponse[list[ScenarioInfo]])
async def list_scenarios() -> ApiResponse[list[ScenarioInfo]]:
    """Return the list of available demo scenarios."""
    items = [
        ScenarioInfo(key=k, name=v["name"], description=v["description"])
        for k, v in SCENARIOS.items()
    ]
    return ApiResponse(data=items)


@router.post("/demo/run", response_model=ApiResponse[DemoRunResult])
async def run_demo_scenario(request: DemoRunRequest) -> ApiResponse[DemoRunResult]:
    """Run a single demo LLM scenario with Langfuse tracing.

    The LLM call is made synchronously in a thread so the async event loop
    is not blocked. The Langfuse trace is flushed before returning.
    """
    scenario_key = request.scenario.lower()
    if scenario_key not in SCENARIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario '{scenario_key}'. Valid: {list(SCENARIOS)}",
        )

    scenario = SCENARIOS[scenario_key]
    session_id = f"demo-{scenario_key}-{uuid.uuid4().hex[:8]}"
    logger.info("demo_run_start", scenario=scenario_key, session_id=session_id)

    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_openai import ChatOpenAI

        handler, langfuse_client = make_langfuse_handler()
        langfuse_traced = handler is not None

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            base_url=settings.openai_base_url or None,
            api_key=settings.openai_api_key,
            default_headers={"x-session-id": session_id},
        )

        messages = [
            SystemMessage(content=scenario["system"]),
            HumanMessage(content=scenario["user"]),
        ]

        invoke_config: dict = {}
        if handler:
            invoke_config = {
                "callbacks": [handler],
                "tags": scenario["tags"],
                "run_name": scenario["run_name"],
                "metadata": {
                    "langfuse_user_id": "Demo Agent",
                    "tags": scenario["tags"],
                    "scenario": scenario["name"],
                },
            }

        # Run the synchronous LLM call off the event loop
        def _invoke():
            return llm.invoke(messages, config=invoke_config if invoke_config else {})

        response = await asyncio.get_event_loop().run_in_executor(None, _invoke)
        assistant_text = response.content if hasattr(response, "content") else str(response)

        # Flush traces to Langfuse
        if langfuse_client:
            await asyncio.get_event_loop().run_in_executor(None, langfuse_client.flush)
            logger.info("langfuse_flushed", scenario=scenario_key, session_id=session_id)

        logger.info("demo_run_complete", scenario=scenario_key, session_id=session_id)

        return ApiResponse(
            data=DemoRunResult(
                scenario=scenario_key,
                scenario_name=scenario["name"],
                user_message=scenario["user"],
                assistant_response=assistant_text,
                session_id=session_id,
                langfuse_traced=langfuse_traced,
            )
        )

    except Exception as exc:
        logger.error("demo_run_failed", scenario=scenario_key, error=str(exc))
        return ApiResponse(error=f"Demo scenario failed: {exc!s}")


@router.post("/demo/chat", response_model=ApiResponse[DemoChatResult])
async def demo_chat(request: DemoChatRequest) -> ApiResponse[DemoChatResult]:
    """Free-form chat with Langfuse tracing and Postgres persistence.

    On the first turn (session_id=None) a new demo session is created and the
    session_id is returned so the frontend can send it on every subsequent turn,
    keeping all turns of one conversation under the same Postgres session and
    Langfuse session group.
    """
    request.message = sanitize_input(request.message, "message")

    # Resolve or create session
    is_new_session = request.session_id is None
    session_id = request.session_id or f"demo-cs-{uuid.uuid4().hex[:12]}"

    if is_new_session:
        title = request.message[:60]
        await postgres_service.create_demo_session(session_id, title)

    logger.info("demo_chat_start", session_id=session_id, message_len=len(request.message))

    try:
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
        from langchain_openai import ChatOpenAI

        handler, langfuse_client = make_langfuse_handler()
        langfuse_traced = handler is not None

        invoke_config: dict = {}
        if handler:
            invoke_config = {
                "callbacks": [handler],
                "run_name": "demo-agent-chat",
                "metadata": {
                    "langfuse_user_id": "Demo Agent",
                    "langfuse_session_id": session_id,
                    "turn": len(request.history) + 1,
                },
            }

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            base_url=settings.openai_base_url or None,
            api_key=settings.openai_api_key,
            default_headers={"x-session-id": session_id},
        )
        llm_with_tools = llm.bind_tools(DEMO_TOOLS)

        messages: list = [
            SystemMessage(
                content=(
                    "You are a helpful AI assistant demonstrating the Aethen platform. "
                    "You have access to the following tools: search_knowledge_base, "
                    "update_user_record, create_support_ticket, query_database. "
                    "Use tools when the user's request naturally requires them — "
                    "e.g. looking up docs, updating a record, creating a ticket, or querying data. "
                    "Your responses are traced by Langfuse and analyzed by Aethen for failure patterns."
                )
            )
        ]
        for turn in request.history:
            if turn.role == "user":
                messages.append(HumanMessage(content=turn.content))
            elif turn.role == "assistant":
                messages.append(AIMessage(content=turn.content))
        messages.append(HumanMessage(content=request.message))

        await postgres_service.append_demo_message(
            message_id=f"dm-{uuid.uuid4().hex[:12]}",
            session_id=session_id,
            role="user",
            content=request.message,
            langfuse_traced=False,
        )

        # ── Phase 1: tool loop — NO Langfuse callbacks ───────────────────────────
        # Runs all tool iterations without creating Langfuse observations.
        # Accumulates the full conversation context (including tool results).
        def _run_tools() -> tuple[list, bool]:
            """Return (final_messages, hit_limit)."""
            current_messages = list(messages)
            for _ in range(5):
                response = llm_with_tools.invoke(current_messages)
                if not getattr(response, "tool_calls", None):
                    return current_messages, False
                current_messages.append(response)
                for tc in response.tool_calls:
                    tool_fn = DEMO_TOOL_MAP.get(tc["name"])
                    if tool_fn is None:
                        content = f"Error: unknown tool '{tc['name']}'"
                    else:
                        try:
                            content = str(tool_fn.invoke(tc["args"]))
                        except Exception as exc:
                            content = f"Error: {exc}"
                    current_messages.append(
                        ToolMessage(content=content, tool_call_id=tc["id"])
                    )
            return current_messages, True

        final_messages, hit_limit = await asyncio.get_event_loop().run_in_executor(
            None, _run_tools
        )

        if hit_limit:
            assistant_text = "I've reached the tool call limit. Please try a more specific request."
        else:
            # ── Phase 2: ONE final invoke WITH callback → exactly one Langfuse trace ─
            # final_messages includes any tool call context so the LLM gives a
            # response that reflects what the tools returned.
            def _traced_invoke() -> str:
                resp = llm.invoke(
                    final_messages,
                    config=invoke_config if invoke_config else {},
                )
                return resp.content if hasattr(resp, "content") else str(resp)

            assistant_text = await asyncio.get_event_loop().run_in_executor(
                None, _traced_invoke
            )

        if langfuse_client:
            await asyncio.get_event_loop().run_in_executor(None, langfuse_client.flush)

        # Save assistant response
        await postgres_service.append_demo_message(
            message_id=f"dm-{uuid.uuid4().hex[:12]}",
            session_id=session_id,
            role="assistant",
            content=assistant_text,
            langfuse_traced=langfuse_traced,
        )

        logger.info("demo_chat_complete", session_id=session_id)

        return ApiResponse(
            data=DemoChatResult(
                user_message=request.message,
                assistant_response=assistant_text,
                session_id=session_id,
                langfuse_traced=langfuse_traced,
            )
        )

    except Exception as exc:
        logger.error("demo_chat_failed", error=str(exc))
        return ApiResponse(error=f"Chat failed: {exc!s}")


# ---------------------------------------------------------------------------
# Demo session CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("/demo/sessions", response_model=ApiResponse[list[dict]])
async def list_demo_sessions() -> ApiResponse[list[dict]]:
    """Return demo chat sessions ordered by most recent activity."""
    sessions = await postgres_service.list_demo_sessions()
    return ApiResponse(data=sessions)


@router.get("/demo/sessions/{session_id}/messages", response_model=ApiResponse[list[dict]])
async def get_demo_messages(session_id: str) -> ApiResponse[list[dict]]:
    """Return the full message history for a demo session."""
    messages = await postgres_service.get_demo_messages(session_id)
    return ApiResponse(data=messages)
