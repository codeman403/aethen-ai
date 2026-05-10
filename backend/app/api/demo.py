"""Demo Agent endpoints — run instrumented LLM scenarios and return the conversation turn.

POST /api/demo/run  { "scenario": "memory" | "tool_misfire" | "hallucination" | "blind_spot" }
GET  /api/demo/scenarios
"""

import asyncio
import json
import uuid

import structlog
from app.utils.request_context import get_data_org_id
from app.agents.llm import set_org_llm_context
from app.services.llm_key_service import get_config as _get_llm_config
from fastapi import APIRouter, HTTPException, Request
from langchain_core.tools import tool
from pydantic import BaseModel

from app.config import settings
from app.models.response import ApiResponse, ResponseMetadata
from app.services.postgres_service import postgres_service
from app.utils.langfuse_utils import make_langfuse_handler
from app.utils.langsmith_utils import make_langsmith_handler
from app.utils.sanitize import sanitize_input


def _build_callbacks(trace_destination: str, session_id: str) -> tuple[list, object | None, object | None]:
    """Build the callbacks list and Langfuse client based on trace_destination.

    Returns:
        (callbacks, langfuse_client, langfuse_handler) — callbacks passed to LangChain
        invoke config, langfuse_client used for flushing, langfuse_handler used to
        read last_trace_id after the call (all None if Langfuse not used).
    """
    callbacks = []
    langfuse_client = None
    langfuse_handler = None

    use_langfuse = trace_destination in ("langfuse", "both")
    use_langsmith = trace_destination in ("langsmith", "both")

    if use_langfuse:
        handler, langfuse_client = make_langfuse_handler()
        if handler:
            callbacks.append(handler)
            langfuse_handler = handler

    if use_langsmith:
        tracer = make_langsmith_handler()
        if tracer:
            callbacks.append(tracer)

    return callbacks, langfuse_client, langfuse_handler


# ---------------------------------------------------------------------------
# Aethen integration helpers
# ---------------------------------------------------------------------------


def _get_trace_id_from_handler(handler) -> str | None:
    """Read the trace_id directly from the Langfuse CallbackHandler.

    Uses handler.last_trace_id which is set synchronously after the LLM call —
    no API query needed, no indexing delay. Returns None if unavailable.
    """
    try:
        trace_id = getattr(handler, "last_trace_id", None)
        return str(trace_id) if trace_id else None
    except Exception:
        return None


async def _get_langfuse_trace_id_from_api(session_id: str, retries: int = 5, delay: float = 2.5) -> str | None:
    """Fallback: query Langfuse API for the most recent trace with this session_id.

    Retries with delay to allow for Langfuse indexing lag (~8-10s after flush).
    """
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return None
    try:
        from langfuse.api import LangfuseAPI
        host = settings.langfuse_base_url or "https://us.cloud.langfuse.com"
        client = LangfuseAPI(
            base_url=host,
            username=settings.langfuse_public_key,
            password=settings.langfuse_secret_key,
        )
        for attempt in range(retries):
            resp = client.trace.list(session_id=session_id, limit=1)
            traces = resp.data if hasattr(resp, "data") else []
            if traces:
                logger.info("demo_trace_id_resolved_api", session_id=session_id,
                            trace_id=traces[0].id)
                return traces[0].id
            if attempt < retries - 1:
                await asyncio.sleep(delay)
        return None
    except Exception as exc:
        logger.warning("demo_trace_id_api_lookup_failed", session_id=session_id, error=str(exc))
        return None


async def _analyze_via_aethen(trace_id: str) -> dict | None:
    """Fetch and analyze a Langfuse trace via Aethen's pipeline.

    Reads the configured demo source from app_settings (set in Integrations UI).
    Retries once with delay if Langfuse hasn't indexed the trace yet.
    Returns serialized AnalysisReport or None on failure.
    """
    try:
        from app.api.langfuse import SingleTraceRequest, fetch_and_analyze_trace
        source = await postgres_service.get_setting("demo_langfuse_source") or "default"
        req = SingleTraceRequest(trace_id=trace_id, source=source, analyze=True)

        for attempt in range(4):
            try:
                result = await fetch_and_analyze_trace(req)
                if result.data and result.data.report:
                    logger.info("demo_aethen_analysis_complete", trace_id=trace_id, source=source)
                    return result.data.report
                break
            except Exception as fetch_exc:
                if "404" in str(fetch_exc) and attempt < 3:
                    await asyncio.sleep(3.0)  # trace not yet indexed — wait and retry
                    continue
                logger.warning("demo_aethen_analysis_failed", trace_id=trace_id,
                               attempt=attempt + 1, error=str(fetch_exc))
                break
        return None
    except Exception as exc:
        logger.warning("demo_aethen_analysis_failed", trace_id=trace_id, error=str(exc))
        return None


# ---------------------------------------------------------------------------
# Demo tools — real LangChain tools that produce Langfuse SPAN observations.
# These are intentionally wired to fail in realistic ways so demo chat sessions
# contain structured ToolCall data for tool_debug analysis.
# ---------------------------------------------------------------------------

@tool
def search_knowledge_base(query: str, namespace: str = "general") -> str:
    """Search the internal knowledge base for documentation or policies."""
    q = query.lower()

    # ── Route 1: HALLUCINATION
    # API/auth queries → retrieves relevant docs (high scores 0.81/0.76).
    # Each doc contains ONE real fact + ONE gap. Multi-part questions cause the LLM
    # to answer both parts smoothly — the real fact from the doc, the missing fact
    # from training knowledge — without realising it has gone beyond the source.
    _hallucination_kws = ("api key", "oauth", "token", "authentication", "credential",
                          "rate limit", "rate_limit", "rotate", "pkce", "signing",
                          "expire", "expiry", "expiration")
    if any(kw in q for kw in _hallucination_kws):
        return json.dumps([
            {
                "doc_id": "api_keys_101.pdf",
                "content": (
                    "API Key Security: All API keys use HMAC-SHA256 request signing for "
                    "authentication. Keys must be stored securely and should be regenerated "
                    "periodically according to your organization's security policy. "
                    "Standard plan supports 3 keys; Pro plan supports 10 keys."
                ),
                "score": 0.81,
            },
            {
                "doc_id": "oauth_setup.pdf",
                "content": (
                    "OAuth 2.0 Setup: Access tokens are issued using the authorization code "
                    "flow. PKCE (Proof Key for Code Exchange) is supported for enhanced "
                    "security. Tokens are invalidated upon password change or account "
                    "suspension. Refresh tokens are single-use and replaced on each refresh."
                ),
                "score": 0.76,
            },
        ])

    # ── Route 2: MEMORY
    # Billing/payment queries → retrieves billing docs but for the WRONG tier.
    # Doc content is about the correct domain (billing/refunds) but the WRONG specific policy
    # (Standard monthly plan) when the user asked about annual subscriptions or enterprise.
    # Scores are medium-low: retrieval tried but fetched the wrong specific document.
    _memory_kws = ("refund", "billing", "invoice", "payment", "annual subscription",
                   "monthly plan", "pricing", "cost", "cancel my subscription",
                   "reset.*password", "password reset")
    if any(kw in q for kw in _memory_kws):
        return json.dumps([
            {
                "doc_id": "billing_policy_standard.pdf",
                "content": (
                    "Standard Plan Billing Policy: Monthly subscriptions are billed on the 1st of "
                    "each month. Cancellations take effect at the end of the current billing period. "
                    "No refunds are issued for partial months on Standard monthly plans. "
                    "Standard plan minimum commitment is 1 month."
                ),
                "score": 0.47,
            },
            {
                "doc_id": "refund_faq.pdf",
                "content": (
                    "Refund FAQ: Q: Can I get a refund for a cancelled Standard plan? "
                    "A: Standard monthly plans are non-refundable for partial months. "
                    "Q: What about annual plan refunds? A: Contact support for annual plan requests. "
                    "Q: How long do refunds take? A: Approved refunds process in 5-10 business days."
                ),
                "score": 0.41,
            },
        ])

    # ── Route 3: BLIND SPOT (default)
    # All other queries (enterprise account policies, compliance, SLA, cancellation, etc.)
    # → returns zero results. The knowledge base has no content covering these topics.
    # chunks_returned=0 is an unambiguous structural signal for blind_spot — no
    # interpretation required. Both heuristic and classify_intent agree immediately.
    return json.dumps([])


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
    trace_destination: str = "langfuse"  # "langfuse" | "langsmith" | "both"


class DemoChatResult(BaseModel):
    user_message: str
    assistant_response: str
    session_id: str                     # Always returned so frontend persists it
    langfuse_traced: bool
    langsmith_traced: bool = False
    trace_destination: str = "langfuse"
    langfuse_trace_id: str | None = None  # trace_id for this turn's Phase 2 call


class DemoRunRequest(BaseModel):
    scenario: str
    trace_destination: str = "langfuse"  # "langfuse" | "langsmith" | "both"


class DemoRunResult(BaseModel):
    scenario: str
    scenario_name: str
    user_message: str
    assistant_response: str
    session_id: str
    langfuse_traced: bool
    langsmith_traced: bool = False
    trace_destination: str = "langfuse"
    langfuse_trace_id: str | None = None   # trace_id after flush
    analysis_report: dict | None = None    # AnalysisReport if analysis succeeded


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
async def run_demo_scenario(request: DemoRunRequest, http_request: Request) -> ApiResponse[DemoRunResult]:
    """Run a single demo LLM scenario.

    Langfuse/LangSmith tracing only happens for authenticated users — public
    visitors run the scenario without tracing so their sessions don't appear
    in the operator's Langfuse account.
    """
    scenario_key = request.scenario.lower()
    if scenario_key not in SCENARIOS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario '{scenario_key}'. Valid: {list(SCENARIOS)}",
        )

    org_id = get_data_org_id(http_request)
    set_org_llm_context(await _get_llm_config(org_id))
    scenario = SCENARIOS[scenario_key]
    session_id = f"demo-{scenario_key}-{uuid.uuid4().hex[:8]}"
    logger.info("demo_run_start", scenario=scenario_key, session_id=session_id)

    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from app.agents.llm import get_demo_llm

        # Only trace for authenticated users
        dest = request.trace_destination if org_id else "none"
        callbacks, langfuse_client, langfuse_handler = _build_callbacks(dest, session_id)
        langfuse_traced = langfuse_client is not None
        langsmith_traced = dest in ("langsmith", "both") and any(
            "LangChainTracer" in type(c).__name__ for c in callbacks
        )

        llm = get_demo_llm()

        messages = [
            SystemMessage(content=scenario["system"]),
            HumanMessage(content=scenario["user"]),
        ]

        invoke_config: dict = {}
        if callbacks:
            invoke_config = {
                "callbacks": callbacks,
                "tags": scenario["tags"],
                "run_name": scenario["run_name"],
                "metadata": {
                    "langfuse_user_id": "Demo Agent",
                    "langfuse_session_id": session_id,   # required for trace_id lookup
                    "tags": scenario["tags"],
                    "scenario": scenario["name"],
                },
            }

        # Run the synchronous LLM call off the event loop
        def _invoke():
            return llm.invoke(messages, config=invoke_config if invoke_config else {})

        response = await asyncio.get_event_loop().run_in_executor(None, _invoke)
        assistant_text = response.content if hasattr(response, "content") else str(response)

        # Flush Langfuse traces
        if langfuse_client:
            await asyncio.get_event_loop().run_in_executor(None, langfuse_client.flush)
            logger.info("langfuse_flushed", scenario=scenario_key, session_id=session_id)

        # Resolve trace_id — return it so the frontend can trigger analysis separately.
        # Analysis is NOT triggered here; the frontend calls /api/demo/analyze-chat
        # after showing the response, displaying "Diagnosing..." in the meantime.
        langfuse_trace_id: str | None = None
        if langfuse_traced:
            langfuse_trace_id = _get_trace_id_from_handler(langfuse_handler)
            if not langfuse_trace_id:
                langfuse_trace_id = await _get_langfuse_trace_id_from_api(session_id)

        logger.info("demo_run_complete", scenario=scenario_key, session_id=session_id,
                    trace_destination=dest, has_trace_id=langfuse_trace_id is not None)

        return ApiResponse(
            data=DemoRunResult(
                scenario=scenario_key,
                scenario_name=scenario["name"],
                user_message=scenario["user"],
                assistant_response=assistant_text,
                session_id=session_id,
                langfuse_traced=langfuse_traced,
                langsmith_traced=langsmith_traced,
                trace_destination=dest,
                langfuse_trace_id=langfuse_trace_id,
                analysis_report=None,  # frontend triggers analysis separately
            )
        )

    except Exception as exc:
        logger.error("demo_run_failed", scenario=scenario_key, error=str(exc))
        return ApiResponse(error=f"Demo scenario failed: {exc!s}")


@router.post("/demo/chat", response_model=ApiResponse[DemoChatResult])
async def demo_chat(request: DemoChatRequest, http_request: Request) -> ApiResponse[DemoChatResult]:
    """Free-form chat with Langfuse tracing and Postgres persistence.

    On the first turn (session_id=None) a new demo session is created and the
    session_id is returned so the frontend can send it on every subsequent turn,
    keeping all turns of one conversation under the same Postgres session and
    Langfuse session group.
    """
    request.message = sanitize_input(request.message, "message")

    # actual_org_id: raw value from JWT state.
    #   - Public users  → None (middleware skips open paths, state never set)
    #   - Regular users → their org UUID
    #   - Admin users   → None (bypasses org filter by design)
    # persist: True for any authenticated user (regular + admin), False for public.
    # Distinguishing factor: middleware sets user_id on authenticated requests.
    actual_org_id: str | None = getattr(http_request.state, "org_id", None)
    persist: bool = bool(getattr(http_request.state, "user_id", None))

    query_org_id = get_data_org_id(http_request)  # sentinel UUID for public users
    set_org_llm_context(await _get_llm_config(query_org_id))
    is_new_session = request.session_id is None
    session_id = request.session_id or f"demo-cs-{uuid.uuid4().hex[:12]}"

    if persist and is_new_session:
        title = request.message[:60]
        await postgres_service.create_demo_session(session_id, title, request.trace_destination, org_id=actual_org_id)

    logger.info("demo_chat_start", session_id=session_id, message_len=len(request.message))

    try:
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
        from app.agents.llm import get_demo_llm

        dest = request.trace_destination
        callbacks, langfuse_client, langfuse_handler = _build_callbacks(dest, session_id)
        langfuse_traced = langfuse_client is not None
        langsmith_traced = dest in ("langsmith", "both") and any(
            "LangChainTracer" in type(c).__name__ for c in callbacks
        )

        invoke_config: dict = {}
        if callbacks:
            invoke_config = {
                "callbacks": callbacks,
                "run_name": "demo-agent-chat",
                "metadata": {
                    "langfuse_user_id": "Demo Agent",
                    "langfuse_session_id": session_id,
                    "turn": len(request.history) + 1,
                },
            }

        llm = get_demo_llm()
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

        if persist:
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

        # Resolve trace_id for this turn — use handler.last_trace_id first (no delay)
        langfuse_trace_id: str | None = None
        if langfuse_traced:
            langfuse_trace_id = _get_trace_id_from_handler(langfuse_handler)
            if not langfuse_trace_id:
                langfuse_trace_id = await _get_langfuse_trace_id_from_api(session_id)

        # Save assistant response (authenticated users only)
        if persist:
            await postgres_service.append_demo_message(
                message_id=f"dm-{uuid.uuid4().hex[:12]}",
                session_id=session_id,
                role="assistant",
                content=assistant_text,
                langfuse_traced=langfuse_traced,
            )

        logger.info("demo_chat_complete", session_id=session_id,
                    trace_id=langfuse_trace_id)

        return ApiResponse(
            data=DemoChatResult(
                user_message=request.message,
                assistant_response=assistant_text,
                session_id=session_id,
                langfuse_traced=langfuse_traced,
                langsmith_traced=langsmith_traced,
                trace_destination=dest,
                langfuse_trace_id=langfuse_trace_id,
            )
        )

    except Exception as exc:
        logger.error("demo_chat_failed", error=str(exc))
        return ApiResponse(error=f"Chat failed: {exc!s}")


# ---------------------------------------------------------------------------
# Demo session CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("/demo/sessions", response_model=ApiResponse[list[dict]])
async def list_demo_sessions(http_request: Request) -> ApiResponse[list[dict]]:
    """Return demo chat sessions for the caller's org ordered by most recent activity."""
    org_id = get_data_org_id(http_request)
    sessions = await postgres_service.list_demo_sessions(org_id=org_id)
    return ApiResponse(data=sessions)


@router.delete("/demo/sessions/{session_id}", response_model=ApiResponse[dict])
async def delete_demo_session(session_id: str, http_request: Request) -> ApiResponse[dict]:
    """Delete a demo chat session and all its messages."""
    org_id = get_data_org_id(http_request)
    deleted = await postgres_service.delete_demo_session(session_id, org_id=org_id)
    if not deleted:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Demo session '{session_id}' not found")
    return ApiResponse(data={"deleted": session_id})


@router.get("/demo/sessions/{session_id}/messages", response_model=ApiResponse[list[dict]])
async def get_demo_messages(session_id: str) -> ApiResponse[list[dict]]:
    """Return the full message history for a demo session."""
    messages = await postgres_service.get_demo_messages(session_id)
    return ApiResponse(data=messages)


class DirectAnalysisRequest(BaseModel):
    """Inline session data for public demo analysis — no Postgres or Langfuse required."""
    scenario: str                       # e.g. "memory", "tool_misfire"
    user_message: str
    assistant_response: str


@router.post("/demo/analyze-direct", response_model=ApiResponse[dict])
async def analyze_direct(request: DirectAnalysisRequest) -> ApiResponse[dict]:
    """Run Aethen's LangGraph pipeline on inline session data.

    Public endpoint — no auth required. Used by the public demo agent so visitors
    can see a real diagnosis without Langfuse tracing or Postgres persistence.
    """
    from app.agents.graph import fast_analysis_graph
    from app.models.trace import FailureType, Session, LLMCall

    session_id = f"demo-direct-{uuid.uuid4().hex[:12]}"

    # Map scenario key to the failure type the pipeline should expect
    _FAILURE_MAP = {
        "memory":       FailureType.MEMORY,
        "tool_misfire": FailureType.TOOL_MISFIRE,
        "hallucination": FailureType.HALLUCINATION,
        "blind_spot":   FailureType.BLIND_SPOT,
    }
    failure_type = _FAILURE_MAP.get(request.scenario)

    session = Session(
        session_id=session_id,
        agent_id="Demo Agent",
        outcome="failure",
        failure_type=failure_type,
        failure_summary=f"Demo scenario: {request.scenario}",
        llm_calls=[
            LLMCall(
                call_id=f"lc-{uuid.uuid4().hex[:8]}",
                model="demo",
                prompt=request.user_message,
                response=request.assistant_response,
            )
        ],
    )

    try:
        result = await fast_analysis_graph.ainvoke({"session": session})
        report = result.get("report")
        if not report:
            raise ValueError("Pipeline returned no report")
        return ApiResponse(
            data=report if isinstance(report, dict) else report.model_dump(mode="json"),
            error=None,
            metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
        )
    except Exception as exc:
        logger.error("demo_analyze_direct_failed", error=str(exc), scenario=request.scenario)
        raise HTTPException(status_code=502, detail="Analysis pipeline failed")


@router.post("/demo/analyze-chat/{session_id}", response_model=ApiResponse[dict])
async def analyze_demo_chat_session(
    session_id: str,
    trace_id: str | None = None,
) -> ApiResponse[dict]:
    """Analyze a demo session via Aethen's pipeline — production integration pattern.

    Accepts an optional trace_id query param for direct lookup (no indexing delay).
    If trace_id is not provided, falls back to querying by session_id (slower).

    Usage:
      POST /api/demo/analyze-chat/{session_id}?trace_id=<langfuse_trace_id>
    """
    if not trace_id:
        trace_id = await _get_langfuse_trace_id_from_api(session_id)
    if not trace_id:
        raise HTTPException(
            status_code=404,
            detail="No Langfuse trace found for this session. Ensure Langfuse tracing is enabled.",
        )

    report = await _analyze_via_aethen(trace_id)
    if not report:
        raise HTTPException(
            status_code=502,
            detail="Analysis pipeline did not return a report. Check that the trace has been flushed.",
        )

    logger.info("demo_chat_analyzed", session_id=session_id, trace_id=trace_id)
    return ApiResponse(
        data=report,
        error=None,
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )
