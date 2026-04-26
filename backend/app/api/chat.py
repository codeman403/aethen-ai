"""POST /api/chat        — analyse a full Session object through LangGraph.
POST /api/chat/freeform — accept a natural-language query, ground it in real
                          Postgres sessions, and run the same pipeline.
"""

import asyncio
import re
import time
import traceback
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.graph import analysis_graph
from app.agents.state import AnalysisReport
from app.models.response import ApiResponse, ResponseMetadata
from app.models.trace import FailureType, Session
from app import store
from app.services.postgres_service import postgres_service
from app.utils.langfuse_utils import make_langfuse_handler
from app.utils.sanitize import sanitize_input

router = APIRouter()
logger = structlog.get_logger()

# Failure types used by the LangGraph pipeline — referenced in _llm_route prompt
# The LLM uses these labels when classifying failure-specific queries.


class ChatRequest(Session):
    """Chat endpoint accepts a full Session object for analysis.

    Extends Session directly so the request body IS the session trace.
    """

    pass


@router.post("/chat", response_model=ApiResponse[AnalysisReport])
async def analyze_session(request: ChatRequest) -> ApiResponse[AnalysisReport]:
    """Analyze an AI agent session trace for failure diagnosis.

    Runs the full LangGraph pipeline:
    classify → retrieve → rerank → analyze → synthesize
    """
    request_id = str(uuid.uuid4())
    start = time.perf_counter()

    logger.info("chat_request_received", session_id=request.session_id, request_id=request_id)

    # Sanitize free-text fields before they reach the LLM pipeline
    if request.failure_summary:
        request.failure_summary = sanitize_input(request.failure_summary, "failure_summary")

    # Langfuse tracing — gracefully skipped when credentials are absent
    handler, langfuse_client = make_langfuse_handler()
    lf_config = {
        "callbacks": [handler],
        "run_name": f"aethen-analysis-{request.session_id}",
        "metadata": {
            "failure_type": str(request.failure_type),
            "session_id": request.session_id,
        },
    } if handler else {}

    try:
        result = await analysis_graph.ainvoke({"session": request}, config=lf_config)

        if langfuse_client:
            await asyncio.get_event_loop().run_in_executor(None, langfuse_client.flush)

        report = AnalysisReport(**result["report"])
        store.save(report)
        duration_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "chat_request_complete",
            session_id=request.session_id,
            request_id=request_id,
            duration_ms=f"{duration_ms:.0f}",
            failure_type=report.failure_type,
            findings_count=len(report.findings),
        )

        return ApiResponse(
            data=report,
            metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms),
        )

    except Exception as exc:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.error(
            "chat_request_failed",
            session_id=request.session_id,
            request_id=request_id,
            error=str(exc),
            traceback=traceback.format_exc(),
        )
        return ApiResponse(
            error=f"Analysis failed: {exc!s}",
            metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms),
        )


# ── Freeform query endpoint ────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str     # "user" | "assistant"
    content: str


class FreeformRequest(BaseModel):
    query: str
    history: list[HistoryMessage] = []


_SEVERITY_THRESHOLDS = {"critical": 100, "high": 50, "medium": 20}


def _severity(count: int) -> str:
    for level, threshold in _SEVERITY_THRESHOLDS.items():
        if count >= threshold:
            return level
    return "low"


_SESSION_ID_RE = re.compile(r"\b[0-9a-f]{32}\b")

def _extract_session_id_from_history(history: list[HistoryMessage]) -> str | None:
    """Return the most recently mentioned 32-char hex session ID from assistant messages."""
    for msg in reversed(history):
        if msg.role == "assistant":
            m = _SESSION_ID_RE.search(msg.content)
            if m:
                return m.group()
    return None


_ANALYSIS_SIGNALS = (
    "could involve", "suggests that", "indicates a", "this failure",
    "misfire", "retrieval miss", "hallucination", "blind spot", "stale embedding",
)

def _looks_like_analysis(text: str) -> bool:
    """True when general-path LLM text reads like specific-session analysis."""
    lower = text.lower()
    return any(s in lower for s in _ANALYSIS_SIGNALS)


async def _llm_route(query: str, history: list[HistoryMessage]) -> dict:
    """Single LLM call: classifies intent, generates SQL for data queries, answers general ones.

    Returns one of:
      {"intent": "data",       "sql": "SELECT ..."}
      {"intent": "diagnostic", "failure_type": "memory|...", "session_id": "<optional>"}
      {"intent": "general",    "answer": "..."}
    session_id is included in diagnostic when the history references a specific session.
    """
    import json as _json
    from langchain_core.messages import HumanMessage, SystemMessage
    from app.agents.llm import get_openai_llm

    stats = await postgres_service.compute_stats()
    total   = stats.get("total_sessions", 0)
    bd      = stats.get("failure_breakdown", {})
    success = max(0, total - sum(bd.values()))

    history_text = "\n".join(
        f"{'User' if t.role == 'user' else 'Aethen'}: {t.content[:300]}"
        for t in history[-15:]
    ) or "(no previous messages)"

    system = f"""You are Aethen, an AI agent failure intelligence assistant.

Postgres schema (read-only):
  sessions (
    session_id    TEXT,
    agent_id      TEXT,
    failure_type  TEXT  -- 'memory' | 'tool_misfire' | 'hallucination' | 'blind_spot' | NULL (success)
    outcome       TEXT  -- 'failed' | 'success'
    failure_summary TEXT,
    session_ts    TIMESTAMPTZ,  -- when the agent session occurred
    created_at    TIMESTAMPTZ   -- when Aethen ingested it
  )
  DO NOT use the session_data column (too large).

Current totals: {total} sessions — {success} successful, {bd.get('memory',0)} memory,
  {bd.get('tool_misfire',0)} tool_misfire, {bd.get('hallucination',0)} hallucination,
  {bd.get('blind_spot',0)} blind_spot.

Conversation history:
{history_text}

Respond with ONLY valid JSON (no markdown). Choose one intent:

1. DATA — any question about sessions, counts, ordering, timestamps, filtering.
   Generate a safe SELECT query. Only SELECT allowed.
   For "oldest"/"earliest"/"first" → ORDER BY session_ts ASC
   For "newest"/"latest"/"recent"  → ORDER BY session_ts DESC
   Always add LIMIT (max 50). Return only useful columns.
   → {{"intent":"data","sql":"SELECT session_id, agent_id, failure_type, failure_summary, session_ts FROM sessions WHERE ... ORDER BY ... LIMIT ..."}}

2. DIAGNOSTIC — root cause analysis, "why is X failing", "diagnose", "analyze", "understand this failure".
   Pick the failure_type that best fits:
     memory       → wrong chunks retrieved, retrieval miss, stale embeddings, wrong context surfaced
     tool_misfire → API errors, tool call failures, timeouts, permission errors, wrong tool params
     hallucination → LLM fabricated facts, answer not grounded in source documents, made-up data
     blind_spot   → topic missing from knowledge base, agent can't answer despite data existing
   Use "unknown" when the failure type genuinely cannot be determined from the query.

   IMPORTANT: If the conversation history shows that a specific session_id was recently
   mentioned by Aethen (e.g. "session ID **abc123...** was logged") AND this query is asking
   to understand, analyze, diagnose, or explain that failure — include the session_id:
   → {{"intent":"diagnostic","failure_type":"tool_misfire","session_id":"abc123..."}}

   If no specific session is referenced, omit session_id:
   → {{"intent":"diagnostic","failure_type":"memory|tool_misfire|hallucination|blind_spot|unknown"}}

3. GENERAL — identity, capabilities, conversation history, anything not answerable by SQL.
   → {{"intent":"general","answer":"your full response here using the totals above"}}"""

    try:
        llm = get_openai_llm()
        resp = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=query)])
        text = (resp.content if hasattr(resp, "content") else str(resp)).strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return _json.loads(text.strip())
    except Exception as exc:
        logger.warning("llm_route_failed", error=str(exc))
        return {
            "intent": "general",
            "answer": (
                "I'm Aethen, your AI agent failure intelligence assistant. "
                f"You have {total} sessions ({success} successful, {total - success} failures). "
                "Ask me anything about your agent traces."
            ),
        }


async def _handle_text_to_sql(
    query: str, sql: str, history: list[HistoryMessage]
) -> AnalysisReport:
    """Execute the LLM-generated SQL and format results as plain English.

    A second LLM call converts raw rows into a conversational answer that
    includes specific values (timestamps, IDs, counts) so follow-up questions
    about those values can be answered from the conversation history.
    """
    import json as _json
    from langchain_core.messages import HumanMessage, SystemMessage
    from app.agents.llm import get_openai_llm

    # Safety: only SELECT is permitted
    if not sql.strip().upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are permitted")

    # Execute query
    async with postgres_service._pool.acquire() as conn:
        rows = await conn.fetch(sql.strip())

    # Serialise rows — skip session_data (too large), convert datetimes
    results: list[dict] = []
    for row in rows:
        r: dict = {}
        for k, v in dict(row).items():
            if k == "session_data":
                continue
            r[k] = v.isoformat() if hasattr(v, "isoformat") else (str(v) if v is not None else None)
        results.append(r)

    logger.info("text_to_sql_executed", rows=len(results), sql=sql[:120])

    # Format results as natural language
    results_json = _json.dumps(results, indent=2) if results else "[]"
    history_text = "\n".join(
        f"{'User' if t.role == 'user' else 'Aethen'}: {t.content[:200]}"
        for t in history[-5:]
    ) or ""

    format_system = (
        "You are Aethen. Convert the SQL query results into a clear, conversational answer. "
        "Include all specific values from the results: session IDs, timestamps, failure summaries, counts. "
        "The user may ask follow-up questions about these values, so make sure they appear in your response. "
        "Be concise. Never mention SQL or database internals."
    )
    format_prompt = (
        f"User question: {query}\n\n"
        f"Query returned {len(results)} row(s):\n{results_json}\n\n"
        "Answer in plain English, citing the actual values."
    )

    try:
        llm = get_openai_llm()
        resp = await llm.ainvoke([
            SystemMessage(content=format_system),
            HumanMessage(content=format_prompt),
        ])
        answer = resp.content if hasattr(resp, "content") else str(resp)
    except Exception as exc:
        logger.warning("text_to_sql_format_failed", error=str(exc))
        if results:
            lines = [f"Found {len(results)} result(s):"]
            for i, r in enumerate(results, 1):
                lines.append(f"{i}. " + "  |  ".join(f"{k}: {v}" for k, v in r.items() if v))
            answer = "\n".join(lines)
        else:
            answer = "No results found for that query."

    return AnalysisReport(
        session_id=f"sql-{uuid.uuid4().hex[:8]}",
        failure_type=FailureType.UNKNOWN,
        summary=answer,
        findings=[],
        root_cause="",
        confidence=0.0,
        raw_analysis=answer,
    )


# _handle_stats and _handle_list removed — replaced by _handle_text_to_sql (Session 10).
# The LLM now generates SQL for all data queries, handling ordering, filtering, and
# timestamps correctly without hardcoded patterns.


@router.post("/chat/freeform", response_model=ApiResponse[AnalysisReport])
async def freeform_query(request: FreeformRequest) -> ApiResponse[AnalysisReport]:
    """Route a natural-language query to the appropriate handler.

    - Stats intent  ("how many X") → aggregate counts from Postgres
    - List intent   ("top 10 X")  → list real sessions from Postgres
    - Diagnostic    ("why/what")  → full LangGraph analysis pipeline
    """
    request_id = str(uuid.uuid4())
    start = time.perf_counter()

    query = sanitize_input(request.query, "query")

    # ── Routing — fully LLM-driven, no keyword matching ────────────────────
    routing = await _llm_route(query, request.history)
    intent = routing.get("intent", "general")
    ft_str = routing.get("failure_type", "unknown")
    try:
        failure_type: FailureType | None = FailureType(ft_str)
        if failure_type == FailureType.UNKNOWN:
            failure_type = None   # let LangGraph classify_intent do its job
    except ValueError:
        failure_type = None

    logger.info("freeform_query", intent=intent, failure_type=failure_type, request_id=request_id)

    try:
        if intent == "general":
            # LLM already answered — wrap in a plain-text report.
            # Guard: if there's a referenced session in history and the LLM response looks
            # like specific-session analysis, redirect rather than surface ungrounded text.
            answer = routing.get("answer", "I'm Aethen, your AI agent failure intelligence assistant.")
            referenced_sid = _extract_session_id_from_history(request.history)
            if referenced_sid and _looks_like_analysis(answer):
                answer = (
                    f"I can see session **{referenced_sid}** was mentioned earlier. "
                    f"To get a grounded analysis with root cause, findings, and confidence score, "
                    f"ask me to diagnose it — for example: "
                    f"*\"Diagnose session {referenced_sid}\"* or *\"Analyze that failure\"*."
                )
            report = AnalysisReport(
                session_id=f"chat-{uuid.uuid4().hex[:8]}",
                failure_type=FailureType.UNKNOWN,
                summary=answer,
                findings=[],
                root_cause="",
                confidence=0.0,
                raw_analysis=answer,
            )

        elif intent == "data":
            # LLM generated a SQL query — execute it and format the results
            sql = routing.get("sql", "")
            if not sql:
                raise ValueError("LLM returned data intent but no SQL query")
            report = await _handle_text_to_sql(query, sql, request.history)

        else:  # diagnostic
            # Ground the query in a real session from Postgres.
            # Priority 1: LLM returned a specific session_id from conversation history.
            # Priority 2: fetch by failure_type.
            # Priority 3: any recent session so the pipeline always has real context.
            referenced_session_id = routing.get("session_id") or _extract_session_id_from_history(request.history)
            real_sessions: list[dict] = []

            if referenced_session_id:
                # Fetch the exact session the user is asking about
                exact = await postgres_service.get_session(referenced_session_id)
                if exact:
                    real_sessions = [exact]
                    logger.info("freeform_diagnostic_exact_session", session_id=referenced_session_id)

            if not real_sessions and failure_type is not None:
                real_sessions = await postgres_service.get_by_failure_type(failure_type.value, limit=3)
            if not real_sessions:
                # Fall back to any recent session so the pipeline has context
                summaries = await postgres_service.get_all_summaries(limit=5)
                for s in summaries:
                    data = await postgres_service.get_session(s["session_id"])
                    if data:
                        real_sessions = [data]
                        break

            if real_sessions:
                base = dict(real_sessions[0])
                base["session_id"] = f"freeform-{uuid.uuid4().hex[:8]}"
                base["failure_summary"] = (
                    f"User query: {query}\n\n"
                    f"Trace context: {real_sessions[0].get('failure_summary') or ''}"
                )
                # Only pre-set failure_type when explicitly identified — otherwise
                # leave it unset so classify_intent classifies from session content
                if failure_type is None:
                    base.pop("failure_type", None)
                session = Session(**base)
            else:
                session = Session(
                    session_id=f"freeform-{uuid.uuid4().hex[:8]}",
                    agent_id="freeform-query",
                    timestamp=datetime.now(UTC),
                    outcome="failed",
                    failure_type=failure_type,
                    failure_summary=query,
                    llm_calls=[],
                    tool_calls=[],
                    retrieval_events=[],
                )

            ft_label = failure_type.value if failure_type else "unknown"
            handler, langfuse_client = make_langfuse_handler()
            lf_config = {
                "callbacks": [handler],
                "run_name": f"aethen-freeform-{ft_label}",
                "metadata": {"intent": "diagnostic", "failure_type": ft_label, "query": query},
            } if handler else {}

            result = await analysis_graph.ainvoke({"session": session}, config=lf_config)

            if langfuse_client:
                await asyncio.get_event_loop().run_in_executor(None, langfuse_client.flush)

            report = AnalysisReport(**result["report"])

        store.save(report)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info("freeform_query_complete", intent=intent, request_id=request_id, duration_ms=f"{duration_ms:.0f}")
        return ApiResponse(data=report, metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms))

    except Exception as exc:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.error("freeform_query_failed", request_id=request_id, error=str(exc))
        return ApiResponse(
            error=f"Query failed: {exc!s}",
            metadata=ResponseMetadata(request_id=request_id, duration_ms=duration_ms),
        )
