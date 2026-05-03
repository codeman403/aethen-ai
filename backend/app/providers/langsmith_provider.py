"""LangSmith live trace provider — pulls and adapts real traces from LangSmith API.

LangSmith uses a hierarchical run model:
  - Root run (type: "chain" or "agent") → the full trace
  - Child runs nested recursively:
      run_type="llm"       → LLMCall
      run_type="tool"      → ToolCall
      run_type="retriever" → RetrievalEvent
      run_type="chain"     → intermediate chain (recurse into children)

Incremental pull uses the `start_time` filter so only runs created after
the last watermark are fetched.
"""

import json
import uuid
from datetime import UTC, datetime

import structlog

from app.models.trace import (
    FailureType,
    LLMCall,
    RetrievalEvent,
    Session,
    ToolCall,
    ToolCallStatus,
)
from app.providers.base import TraceProvider

logger = structlog.get_logger()


class LangSmithTraceAdapter:
    """Transforms LangSmith Run objects into Aethen Session models."""

    # run_type values that indicate retrieval
    _RETRIEVAL_TYPES = {"retriever"}
    # Name fragments that indicate a retrieval-like tool call
    _RETRIEVAL_KEYWORDS = {"retrieve", "retrieval", "vector", "search", "similarity", "embedding", "knowledge"}

    def _is_retrieval(self, name: str, _msg: dict | None = None) -> bool:
        """Matches Langfuse's LangfuseTraceAdapter._is_retrieval — keyword check on tool name."""
        return any(kw in name.lower() for kw in self._RETRIEVAL_KEYWORDS)

    # ── Public entry point ─────────────────────────────────────────────────

    def adapt_run(self, run) -> Session:
        """Convert a single LangSmith root Run into an Aethen Session."""
        run_id = str(run.id)
        agent_id = self._extract_agent_id(run)
        error = getattr(run, "error", None)
        outcome = "failure" if error else "success"
        failure_summary = (error[:500] if error else None)

        # Walk the run tree for structured child runs
        llm_calls: list[LLMCall] = []
        tool_calls: list[ToolCall] = []
        retrieval_events: list[RetrievalEvent] = []
        self._walk_run(run, llm_calls, tool_calls, retrieval_events)

        # Backfill from input message history when structured run tree is incomplete.
        # Demo Agent Phase 1 runs without callbacks so tool calls and search
        # results only exist in the messages passed to Phase 2.
        # Always backfill tool_calls if none found — even when retrieval_events exist,
        # because tool errors in message history won't appear as structured child runs.
        if not tool_calls and not retrieval_events:
            self._extract_events_from_message_history(run, tool_calls, retrieval_events)
        elif not tool_calls:
            # Has retrieval events from walk but no tool calls — still check message
            # history for tool calls. Pass a scratch list so we don't double-add
            # retrieval events that were already extracted from the run tree.
            _scratch: list[RetrievalEvent] = []
            self._extract_events_from_message_history(run, tool_calls, _scratch)

        # Infer failure type from signals
        failure_type = self._infer_failure_type(run, llm_calls, tool_calls, retrieval_events)

        # If a failure type was inferred from trace signals (e.g. ToolMessage errors
        # in message history), upgrade outcome to failure even if run.error is None
        if failure_type is not None and outcome == "success":
            outcome = "failure"
            tool_error = self._extract_tool_error_from_messages(run)
            if tool_error and not failure_summary:
                failure_summary = tool_error

        ts = getattr(run, "start_time", None) or datetime.now(UTC)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)

        return Session(
            session_id=run_id,
            agent_id=agent_id,
            timestamp=ts,
            outcome=outcome,
            failure_type=failure_type,
            failure_summary=failure_summary,
            llm_calls=llm_calls,
            tool_calls=tool_calls,
            retrieval_events=retrieval_events,
            trace_source="langsmith",
        )

    # ── Tree walker ────────────────────────────────────────────────────────

    def _walk_run(
        self,
        run,
        llm_calls: list[LLMCall],
        tool_calls: list[ToolCall],
        retrieval_events: list[RetrievalEvent],
        depth: int = 0,
    ) -> None:
        """Recursively walk a run tree, mapping each node to Aethen event types."""
        if depth > 10:  # guard against pathological nesting
            return

        run_type = (getattr(run, "run_type", "") or "").lower()
        run_name = (getattr(run, "name", "") or "").lower()

        if run_type == "llm":
            lc = self._to_llm_call(run)
            if lc:
                llm_calls.append(lc)
        elif run_type == "tool":
            # Check if this tool is actually a retrieval operation
            if any(kw in run_name for kw in self._RETRIEVAL_KEYWORDS):
                re = self._tool_to_retrieval_event(run)
                if re:
                    retrieval_events.append(re)
            else:
                tc = self._to_tool_call(run)
                if tc:
                    tool_calls.append(tc)
        elif run_type in self._RETRIEVAL_TYPES:
            re = self._to_retrieval_event(run)
            if re:
                retrieval_events.append(re)

        # Recurse into children (chain, agent, or other intermediate nodes)
        for child in (getattr(run, "child_runs", None) or []):
            self._walk_run(child, llm_calls, tool_calls, retrieval_events, depth + 1)

    # ── Event constructors ─────────────────────────────────────────────────

    def _to_llm_call(self, run) -> LLMCall | None:
        try:
            inputs = getattr(run, "inputs", {}) or {}
            outputs = getattr(run, "outputs", {}) or {}
            extra = getattr(run, "extra", {}) or {}
            error = getattr(run, "error", None)

            # Extract prompt — LangSmith stores messages as [[msg1, msg2, ...]] (nested list).
            # Each message uses LangChain constructor format:
            #   {'type': 'constructor', 'kwargs': {'content': '...', 'type': 'human'}, 'id': [...]}
            prompt = ""
            msgs = inputs.get("messages") or inputs.get("prompts") or []
            # Unwrap nested list — LangChain serialises as [[msg1, msg2, ...]]
            if msgs and isinstance(msgs[0], list):
                msgs = msgs[0]
            if msgs:
                prompt = self._extract_last_human(msgs)[:600]
            if not prompt and inputs:
                prompt = str(list(inputs.values())[-1])[:600]

            # Extract response
            response = ""
            if error:
                response = f"[Error] {error[:300]}"
            else:
                gens = outputs.get("generations") or []
                if gens:
                    first = gens[0][0] if isinstance(gens[0], list) else gens[0]
                    response = str(first.get("text", first.get("message", {}).get("content", str(first))))[:600]
                elif "output" in outputs:
                    response = str(outputs["output"])[:600]
                elif outputs:
                    response = str(list(outputs.values())[0])[:600]

            # Model name
            inv = extra.get("invocation_params") or {}
            model = inv.get("model_name") or inv.get("model") or inv.get("_type") or "unknown"

            # Tokens
            token_usage = (outputs.get("llm_output") or {}).get("token_usage") or {}
            tokens_in = token_usage.get("prompt_tokens", 0)
            tokens_out = token_usage.get("completion_tokens", 0)

            # Latency
            start = getattr(run, "start_time", None)
            end = getattr(run, "end_time", None)
            latency_ms = 0.0
            if start and end:
                latency_ms = (end - start).total_seconds() * 1000

            ts = start or datetime.now(UTC)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)

            return LLMCall(
                call_id=str(getattr(run, "id", uuid.uuid4())),
                model=str(model),
                prompt=prompt,
                response=response,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
                hallucination_flag=False,
                timestamp=ts,
            )
        except Exception as exc:
            logger.debug("langsmith_llm_call_parse_error", error=str(exc))
            return None

    def _to_tool_call(self, run) -> ToolCall | None:
        try:
            inputs = getattr(run, "inputs", {}) or {}
            outputs = getattr(run, "outputs", {}) or {}
            error = getattr(run, "error", None)

            tool_name = getattr(run, "name", "unknown_tool") or "unknown_tool"
            status = ToolCallStatus.FAILED if error else ToolCallStatus.SUCCESS

            result = None
            if not error and outputs:
                result = str(outputs.get("output", list(outputs.values())[0] if outputs else ""))[:400]

            start = getattr(run, "start_time", None)
            end = getattr(run, "end_time", None)
            latency_ms = 0.0
            if start and end:
                latency_ms = (end - start).total_seconds() * 1000

            ts = start or datetime.now(UTC)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)

            return ToolCall(
                call_id=str(getattr(run, "id", uuid.uuid4())),
                tool_name=tool_name,
                parameters=dict(inputs) if isinstance(inputs, dict) else {},
                result=result,
                error=str(error)[:300] if error else None,
                status=status,
                latency_ms=latency_ms,
                timestamp=ts,
            )
        except Exception as exc:
            logger.debug("langsmith_tool_call_parse_error", error=str(exc))
            return None

    def _to_retrieval_event(self, run) -> RetrievalEvent | None:
        try:
            inputs = getattr(run, "inputs", {}) or {}
            outputs = getattr(run, "outputs", {}) or {}

            query = str(inputs.get("query") or inputs.get("input") or "")[:300]
            docs = outputs.get("documents") or outputs.get("output") or []
            if isinstance(docs, str):
                docs = []

            chunks_returned = len(docs) if isinstance(docs, list) else 0
            scores: list[float] = []
            doc_ids: list[str] = []
            doc_texts: list[str] = []
            for doc in (docs if isinstance(docs, list) else []):
                if isinstance(doc, dict):
                    meta = doc.get("metadata") or {}
                    score = meta.get("score") or meta.get("relevance_score") or doc.get("score")
                    if score is not None:
                        try:
                            scores.append(float(score))
                        except (ValueError, TypeError):
                            pass
                    doc_id = meta.get("id") or meta.get("source") or meta.get("doc_id") or ""
                    if doc_id:
                        doc_ids.append(str(doc_id))
                    text = doc.get("page_content") or doc.get("content") or ""
                    if text:
                        doc_texts.append(str(text)[:200])

            ts = getattr(run, "start_time", None) or datetime.now(UTC)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)

            return RetrievalEvent(
                event_id=str(getattr(run, "id", uuid.uuid4())),
                query=query,
                chunks_returned=chunks_returned,
                relevance_scores=scores,
                actual_doc_ids=doc_ids,
                doc_content=doc_texts,
                timestamp=ts,
            )
        except Exception as exc:
            logger.debug("langsmith_retrieval_parse_error", error=str(exc))
            return None

    def _tool_to_retrieval_event(self, run) -> RetrievalEvent | None:
        """Convert a tool run whose name implies retrieval into a RetrievalEvent."""
        try:
            inputs = getattr(run, "inputs", {}) or {}
            outputs = getattr(run, "outputs", {}) or {}

            query = str(inputs.get("query") or inputs.get("input") or inputs.get("question") or "")[:300]
            raw = outputs.get("output") or outputs.get("documents") or []
            docs = raw if isinstance(raw, list) else []

            ts = getattr(run, "start_time", None) or datetime.now(UTC)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)

            return RetrievalEvent(
                event_id=str(getattr(run, "id", uuid.uuid4())),
                query=query,
                chunks_returned=len(docs),
                timestamp=ts,
            )
        except Exception as exc:
            logger.debug("langsmith_tool_retrieval_parse_error", error=str(exc))
            return None

    # ── Helpers ────────────────────────────────────────────────────────────

    def _extract_agent_id(self, run) -> str:
        extra = getattr(run, "extra", {}) or {}
        meta = extra.get("metadata") or {}
        raw = (
            meta.get("langfuse_user_id")
            or meta.get("user_id")
            or meta.get("agent_id")
            or getattr(run, "name", None)
            or "langsmith-agent"
        )
        return "Demo Agent" if str(raw).lower().startswith("demo-") else raw

    def _extract_last_human(self, msgs: list) -> str:
        """Extract the last human/user message content from a messages list.

        Handles both flat format {'role': 'user', 'content': '...'} and
        LangChain constructor format {'type': 'constructor', 'kwargs': {'type': 'human', 'content': '...'}}.
        """
        for msg in reversed(msgs):
            if isinstance(msg, str):
                return msg[:300]
            if not isinstance(msg, dict):
                continue

            # LangChain constructor serialisation format (used by LangSmith SDK)
            if msg.get("type") == "constructor":
                kwargs = msg.get("kwargs") or {}
                msg_type = kwargs.get("type", "").lower()
                # Also check id[-1] e.g. ['langchain', 'schema', 'messages', 'HumanMessage']
                msg_id_tail = (msg.get("id") or [""])[-1].lower()
                if msg_type == "human" or "human" in msg_id_tail:
                    return str(kwargs.get("content", ""))[:300]
            else:
                # Standard flat format: {'role': 'user', 'content': '...'} or
                # {'type': 'HumanMessage', 'content': '...'}
                role = (msg.get("role") or msg.get("type") or "").lower()
                if "human" in role or role == "user":
                    return str(msg.get("content", ""))[:300]

        return ""

    def _extract_tool_error_from_messages(self, run) -> str | None:
        """Scan input message history for ToolMessage entries with error content.

        Demo Agent Phase 1 runs without callbacks so tool errors never appear
        as structured child runs in LangSmith. Instead they are captured as
        ToolMessage content in the inputs passed to Phase 2. This reads that
        structured data — the same factual source Langfuse reads via observations.

        Returns the error string if found, None otherwise.
        """
        inputs = getattr(run, "inputs", {}) or {}
        msgs = inputs.get("messages") or []
        if msgs and isinstance(msgs[0], list):
            msgs = msgs[0]  # unwrap nested list

        for msg in msgs:
            if not isinstance(msg, dict):
                continue
            # Constructor format (LangSmith SDK serialisation)
            if msg.get("type") == "constructor":
                kwargs = msg.get("kwargs") or {}
                msg_type = kwargs.get("type", "").lower()
                content = str(kwargs.get("content", ""))
            else:
                msg_type = (msg.get("role") or msg.get("type") or "").lower()
                content = str(msg.get("content", ""))

            if msg_type == "tool" and content.lower().startswith("error:"):
                return content[:200]

        return None

    def _extract_events_from_message_history(
        self,
        run,
        tool_calls: list[ToolCall],
        retrieval_events: list[RetrievalEvent],
    ) -> None:
        """Backfill tool calls and retrieval events from input message history.

        Demo Agent Phase 1 runs without callbacks so structured events only
        exist in the messages passed to Phase 2. This mirrors Langfuse's
        _extract_retrieval_from_trace_messages pattern.

        Processes:
        - AIMessage with tool_calls → records which tool was called
        - ToolMessage with JSON list content → RetrievalEvent (search results)
        - ToolMessage with 'Error:' content → ToolCall(status=FAILED)
        - ToolMessage with other content → ToolCall(status=SUCCESS)
        """
        inputs = getattr(run, "inputs", {}) or {}
        msgs = inputs.get("messages") or []
        if msgs and isinstance(msgs[0], list):
            msgs = msgs[0]

        # Build tool_call_id → (tool_name, args) from AIMessages
        pending_calls: dict[str, tuple[str, dict]] = {}

        for msg in msgs:
            if not isinstance(msg, dict):
                continue

            # Normalise across constructor format and flat format
            if msg.get("type") == "constructor":
                kwargs = msg.get("kwargs") or {}
                msg_type = kwargs.get("type", "").lower()
                content = str(kwargs.get("content") or "")
                ai_tool_calls = kwargs.get("tool_calls") or kwargs.get("additional_kwargs", {}).get("tool_calls") or []
                tool_call_id = kwargs.get("tool_call_id") or ""
            else:
                msg_type = (msg.get("role") or msg.get("type") or "").lower()
                content = str(msg.get("content") or "")
                ai_tool_calls = msg.get("tool_calls") or msg.get("additional_kwargs", {}).get("tool_calls") or []
                tool_call_id = msg.get("tool_call_id") or ""

            # Record pending tool calls from AIMessage
            if msg_type in ("ai", "assistant") and ai_tool_calls:
                for tc_spec in ai_tool_calls:
                    tc_id = tc_spec.get("id") or ""
                    name = tc_spec.get("name") or (tc_spec.get("function") or {}).get("name") or "unknown"
                    args_raw = tc_spec.get("args") or (tc_spec.get("function") or {}).get("arguments") or {}
                    if isinstance(args_raw, str):
                        try:
                            args_raw = json.loads(args_raw)
                        except Exception:
                            args_raw = {"raw": args_raw}
                    if tc_id:
                        pending_calls[tc_id] = (name, dict(args_raw) if isinstance(args_raw, dict) else {})

            # Process ToolMessage
            if msg_type == "tool" and content:
                tool_name, tool_args = pending_calls.get(tool_call_id, ("unknown_tool", {}))
                call_id = tool_call_id or str(uuid.uuid4())

                # Determine if this looks like a retrieval result (JSON list of docs)
                is_retrieval = self._is_retrieval(tool_name)
                parsed_list = None
                if is_retrieval:
                    try:
                        parsed_list = json.loads(content)
                        if not isinstance(parsed_list, list):
                            parsed_list = None
                    except Exception:
                        parsed_list = None
                if is_retrieval and parsed_list is not None:
                    # Build RetrievalEvent
                    scores, doc_ids, doc_texts = [], [], []
                    for item in parsed_list:
                        if not isinstance(item, dict):
                            continue
                        score = item.get("score") or item.get("relevance_score")
                        if score is not None:
                            try:
                                scores.append(float(score))
                            except (ValueError, TypeError):
                                pass
                        doc_id = item.get("doc_id") or item.get("id") or ""
                        if doc_id:
                            doc_ids.append(str(doc_id))
                        text = item.get("content") or item.get("text") or ""
                        if text:
                            doc_texts.append(str(text)[:200])

                    query = tool_args.get("query") or tool_args.get("q") or tool_name
                    retrieval_events.append(RetrievalEvent(
                        event_id=call_id,
                        query=str(query)[:300],
                        chunks_returned=len(parsed_list),
                        relevance_scores=scores,
                        actual_doc_ids=doc_ids,
                        doc_content=doc_texts,
                    ))
                else:
                    # Non-retrieval tool call
                    is_error = content.lower().startswith("error:")
                    status = ToolCallStatus.FAILED if is_error else ToolCallStatus.SUCCESS
                    tool_calls.append(ToolCall(
                        call_id=call_id,
                        tool_name=tool_name,
                        parameters=tool_args,
                        result=content[:400] if not is_error else None,
                        error=content[:300] if is_error else None,
                        status=status,
                    ))

    def _infer_failure_type(
        self,
        run,
        llm_calls: list[LLMCall],
        tool_calls: list[ToolCall],
        retrieval_events: list[RetrievalEvent],
    ) -> FailureType | None:
        """Heuristic failure type from trace signals — mirrors langfuse_provider logic.

        Signal priority:
        1. Explicit run tags
        2. Failed tool call child runs (structured)
        3. ToolMessage errors in input message history (Phase 1 without callbacks)
        4. Zero-chunk retrievals → blind spot
        5. Low relevance scores → memory failure
        6. Hallucination flag
        """
        # 1. Explicit run tags
        tags = [t.lower() for t in (getattr(run, "tags", None) or [])]
        for tag in tags:
            if "hallucin" in tag:
                return FailureType.HALLUCINATION
            if "tool" in tag or "misfire" in tag:
                return FailureType.TOOL_MISFIRE
            if "memory" in tag or "retrieval" in tag:
                return FailureType.MEMORY
            if "blind" in tag or "gap" in tag:
                return FailureType.BLIND_SPOT

        # 2. Failed tool call child runs (structured tracing)
        if any(tc.status == ToolCallStatus.FAILED for tc in tool_calls):
            return FailureType.TOOL_MISFIRE

        # 3. ToolMessage errors in input message history
        if self._extract_tool_error_from_messages(run):
            return FailureType.TOOL_MISFIRE

        # 4. Zero-chunk retrievals → blind spot
        if any(r.chunks_returned == 0 for r in retrieval_events):
            return FailureType.BLIND_SPOT

        # 5. Low relevance scores → memory failure
        for r in retrieval_events:
            if r.relevance_scores and max(r.relevance_scores) < 0.5:
                return FailureType.MEMORY

        # 6. Hallucination flag
        if any(lc.hallucination_flag for lc in llm_calls):
            return FailureType.HALLUCINATION

        return None


class LangSmithProvider(TraceProvider):
    """Pulls traces from LangSmith API and converts to Aethen Sessions."""

    def __init__(self, api_key: str, endpoint: str, project_name: str = "default") -> None:
        self._api_key = api_key
        self._endpoint = endpoint
        self._project_name = project_name
        self._adapter = LangSmithTraceAdapter()

    async def fetch_traces(
        self,
        limit: int = 50,
        since: datetime | None = None,
    ) -> list[Session]:
        """Fetch root runs from LangSmith and convert to Sessions.

        Filters to runs that started after `since` for incremental ingestion.
        Skips Aethen's own internal traces (run names starting with 'aethen-').
        """
        import asyncio
        from langsmith import Client

        client = Client(api_key=self._api_key, api_url=self._endpoint)

        # run_types that can legitimately be root agent traces
        _VALID_ROOT_TYPES = {"chain", "agent", "retriever", "tool"}

        def _fetch() -> list[Session]:
            kwargs: dict = {
                "project_name": self._project_name,
                "is_root": True,
                "limit": limit,
            }
            if since:
                kwargs["start_time"] = since

            sessions: list[Session] = []
            try:
                for run in client.list_runs(**kwargs):
                    run_name = (getattr(run, "name", "") or "").lower()
                    run_type = (getattr(run, "run_type", "") or "").lower()

                    # Skip Aethen's own internal analysis traces
                    if run_name.startswith("aethen-"):
                        continue

                    try:
                        session = self._adapter.adapt_run(run)
                        sessions.append(session)
                    except Exception as exc:
                        logger.warning(
                            "langsmith_adapt_run_failed",
                            run_id=str(getattr(run, "id", "?")),
                            error=str(exc),
                        )
            except Exception as exc:
                logger.error("langsmith_list_runs_failed", error=str(exc))
                raise
            return sessions

        loop = asyncio.get_event_loop()
        sessions = await loop.run_in_executor(None, _fetch)
        logger.info("langsmith_fetch_complete", count=len(sessions))
        return sessions

    async def health_check(self) -> dict:
        """Verify LangSmith connectivity by listing one run."""
        import asyncio
        from langsmith import Client

        def _check() -> dict:
            try:
                client = Client(api_key=self._api_key, api_url=self._endpoint)
                projects = list(client.list_projects())
                project_names = [p.name for p in projects[:5]]
                return {
                    "status": "ok",
                    "detail": f"Connected to LangSmith. Projects: {', '.join(project_names) or 'none'}",
                }
            except Exception as exc:
                return {"status": "error", "detail": str(exc)[:200]}

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _check)
