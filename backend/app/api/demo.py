"""Demo Agent endpoints — run instrumented LLM scenarios and return the conversation turn.

POST /api/demo/run  { "scenario": "memory" | "tool_misfire" | "hallucination" | "blind_spot" }
GET  /api/demo/scenarios
"""

import asyncio
import uuid

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.models.response import ApiResponse
from app.utils.langfuse_utils import make_langfuse_handler
from app.utils.sanitize import sanitize_input

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


class DemoChatResult(BaseModel):
    user_message: str
    assistant_response: str
    session_id: str
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
                "metadata": {"tags": scenario["tags"], "scenario": scenario["name"]},
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
    """Free-form chat with Langfuse tracing.

    Accepts the full conversation history so the LLM has context across turns.
    Each call is traced as a new Langfuse observation.
    """
    session_id = f"demo-chat-{uuid.uuid4().hex[:8]}"
    request.message = sanitize_input(request.message, "message")
    logger.info("demo_chat_start", session_id=session_id, message_len=len(request.message))

    try:
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
        from langchain_openai import ChatOpenAI

        handler, langfuse_client = make_langfuse_handler()
        langfuse_traced = handler is not None

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            base_url=settings.openai_base_url or None,
            api_key=settings.openai_api_key,
            default_headers={"x-session-id": session_id},
        )

        # Build message list: system + history + new user message
        messages: list = [
            SystemMessage(
                content=(
                    "You are a helpful AI assistant demonstrating the Aethen platform. "
                    "Answer the user's questions clearly and concisely. "
                    "When relevant, mention that your responses are being traced by Langfuse "
                    "and can be analyzed by Aethen for failure patterns."
                )
            )
        ]
        for turn in request.history:
            if turn.role == "user":
                messages.append(HumanMessage(content=turn.content))
            elif turn.role == "assistant":
                messages.append(AIMessage(content=turn.content))
        messages.append(HumanMessage(content=request.message))

        invoke_config: dict = {}
        if handler:
            invoke_config = {
                "callbacks": [handler],
                "tags": ["demo-chat", "user-input"],
                "run_name": f"demo-chat-{session_id}",
                "metadata": {"session_id": session_id, "turn": len(request.history) + 1},
            }

        def _invoke():
            return llm.invoke(messages, config=invoke_config if invoke_config else {})

        response = await asyncio.get_event_loop().run_in_executor(None, _invoke)
        assistant_text = response.content if hasattr(response, "content") else str(response)

        if langfuse_client:
            await asyncio.get_event_loop().run_in_executor(None, langfuse_client.flush)

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
