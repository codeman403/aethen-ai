"""Langfuse live trace provider — pulls and adapts real traces from Langfuse API."""

import uuid

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


class LangfuseTraceAdapter:
    """Transforms Langfuse trace objects into Aethen Session models.

    Langfuse uses an observation-based model:
      - trace → contains observations
      - observation types: GENERATION, SPAN, EVENT

    This adapter maps:
      - GENERATION observations → LLMCall
      - SPAN observations with tool-like names → ToolCall
      - SPAN/EVENT observations with retrieval signals → RetrievalEvent
    """

    TOOL_KEYWORDS = {"search", "query", "fetch", "lookup", "call", "execute", "invoke", "tool", "api"}
    RETRIEVAL_KEYWORDS = {"retrieve", "retrieval", "vector", "search_kb", "pinecone", "similarity", "embedding"}

    def adapt_trace(self, trace: dict, observations: list[dict]) -> Session:
        """Convert a single Langfuse trace + its observations into an Aethen Session."""
        trace_name = (trace.get("name") or "")

        # ── Aethen's own analysis / freeform traces ────────────────────────
        # These are produced by Aethen's own LangGraph pipeline. The raw
        # observations contain the LangGraph AgentState as prompts, which is
        # not useful for display. Instead we reconstruct a clean LLMCall from
        # the trace-level input (original session) and output (analysis report).
        if trace_name.startswith("aethen-"):
            return self._adapt_aethen_trace(trace, trace_name)

        # ── Regular external agent traces ──────────────────────────────────
        llm_calls: list[LLMCall] = []
        tool_calls: list[ToolCall] = []
        retrieval_events: list[RetrievalEvent] = []

        for obs in observations:
            obs_type = (obs.get("type") or "").upper()
            obs_name = (obs.get("name") or "").lower()

            if obs_type == "GENERATION":
                llm_calls.append(self._to_llm_call(obs))
            elif self._is_retrieval(obs_name, obs):
                retrieval_events.append(self._to_retrieval_event(obs))
            elif obs_type == "SPAN" or self._is_tool(obs_name, obs):
                tool_calls.append(self._to_tool_call(obs))

        # Infer failure type from trace metadata or output
        failure_type = self._infer_failure_type(trace, llm_calls, tool_calls, retrieval_events)

        # Extract trace-level input/output for filling empty observation fields
        trace_input  = self._extract_text(trace.get("input"))
        trace_output = self._extract_text(trace.get("output"))

        # failure_summary describes WHAT WENT WRONG — kept separate from the user prompt.
        # Priority: explicit error → failure type label → trace name → None
        if isinstance(trace.get("output"), dict) and trace["output"].get("error"):
            failure_summary: str | None = str(trace["output"]["error"])
        elif failure_type:
            label = failure_type.value.replace("_", " ").title()
            trace_name = (trace.get("name") or "").replace("-", " ").title()
            failure_summary = f"{label} — {trace_name}" if trace_name else f"{label} detected"
        elif trace.get("name"):
            failure_summary = (trace.get("name") or "").replace("-", " ").title()
        else:
            failure_summary = None

        # Fill empty LLM call prompts/responses from trace-level input/output.
        # This is the ACTUAL user prompt — intentionally different from failure_summary.
        if llm_calls and trace_input:
            for call in llm_calls:
                if not call.prompt:
                    call.prompt = trace_input
                if not call.response and trace_output:
                    call.response = trace_output

        return Session(
            session_id=trace.get("id", f"lf-{uuid.uuid4().hex[:8]}"),
            agent_id=trace.get("userId") or trace.get("name") or "langfuse-agent",
            **({"timestamp": trace["timestamp"]} if trace.get("timestamp") else {}),
            outcome="failure" if failure_type else "success",
            failure_type=failure_type,
            failure_summary=failure_summary,
            llm_calls=llm_calls,
            tool_calls=tool_calls,
            retrieval_events=retrieval_events,
            metadata={
                "source": "langfuse",
                "langfuse_trace_id": trace.get("id"),
                "tags": trace.get("tags", []),
            },
        )

    def _to_llm_call(self, obs: dict) -> LLMCall:
        """Map a GENERATION observation to LLMCall."""
        usage = obs.get("usage") or {}
        model = obs.get("model") or obs.get("modelId") or "unknown"

        # Extract prompt text from input
        prompt = self._extract_text(obs.get("input"))
        response = self._extract_text(obs.get("output"))

        return LLMCall(
            call_id=obs.get("id", f"llm-{uuid.uuid4().hex[:8]}"),
            model=model,
            prompt=prompt,
            response=response,
            tokens_in=usage.get("input") or usage.get("promptTokens") or 0,
            tokens_out=usage.get("output") or usage.get("completionTokens") or 0,
            latency_ms=self._calc_latency(obs),
            hallucination_flag=False,  # Can be enriched post-analysis
            source_documents=[],
        )

    def _to_tool_call(self, obs: dict) -> ToolCall:
        """Map a SPAN observation to ToolCall."""
        error = None
        status = ToolCallStatus.SUCCESS
        level = (obs.get("level") or "").upper()

        if level == "ERROR" or obs.get("statusMessage"):
            error = obs.get("statusMessage") or "Tool execution failed"
            status = ToolCallStatus.FAILED

        return ToolCall(
            call_id=obs.get("id", f"tool-{uuid.uuid4().hex[:8]}"),
            tool_name=obs.get("name", "unknown_tool"),
            parameters=obs.get("input") if isinstance(obs.get("input"), dict) else {},
            result=self._extract_text(obs.get("output")),
            error=error,
            status=status,
            latency_ms=self._calc_latency(obs),
        )

    def _to_retrieval_event(self, obs: dict) -> RetrievalEvent:
        """Map a retrieval-like observation to RetrievalEvent."""
        output = obs.get("output")
        chunks = 0
        doc_ids: list[str] = []

        if isinstance(output, list):
            chunks = len(output)
            doc_ids = [str(item.get("id", "")) for item in output if isinstance(item, dict)]
        elif isinstance(output, dict):
            results = output.get("results") or output.get("documents") or []
            chunks = len(results)
            doc_ids = [str(r.get("id", "")) for r in results if isinstance(r, dict)]

        return RetrievalEvent(
            event_id=obs.get("id", f"ret-{uuid.uuid4().hex[:8]}"),
            query=self._extract_text(obs.get("input")),
            chunks_returned=chunks,
            actual_doc_ids=doc_ids,
        )

    def _parse_dict(self, value) -> dict:
        """Coerce a value to a dict — handles plain dicts, JSON strings, and Python repr."""
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            import json as _json
            stripped = value.strip()
            # Try JSON
            try:
                parsed = _json.loads(stripped)
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, TypeError):
                pass
            # Try Python repr → JSON
            try:
                converted = (
                    stripped
                    .replace("'", '"')
                    .replace("True", "true")
                    .replace("False", "false")
                    .replace("None", "null")
                )
                parsed = _json.loads(converted)
                if isinstance(parsed, dict):
                    return parsed
            except (ValueError, TypeError):
                pass
        return {}

    def _adapt_aethen_trace(self, trace: dict, trace_name: str) -> Session:
        """Build a clean Session from Aethen's own LangGraph analysis traces.

        Reconstructs a human-readable LLMCall whose prompt describes what was
        being analysed and whose response is the analysis summary + root cause.
        This allows Aethen analysis traces to display like any other session.
        """
        # ── Determine failure type from trace name ─────────────────────────
        failure_type: FailureType | None = None
        name_lower = trace_name.lower()
        if "memory" in name_lower:
            failure_type = FailureType.MEMORY
        elif "hallucination" in name_lower:
            failure_type = FailureType.HALLUCINATION
        elif "blind_spot" in name_lower or "blind-spot" in name_lower:
            failure_type = FailureType.BLIND_SPOT
        elif "tool" in name_lower:
            failure_type = FailureType.TOOL_MISFIRE

        # ── Extract original session from trace input ──────────────────────
        raw_input = trace.get("input") or {}
        input_dict = self._parse_dict(raw_input)

        # LangGraph input is {"session": {...}} or the session dict directly
        original_session: dict = (
            input_dict.get("session") if isinstance(input_dict.get("session"), dict)
            else input_dict if "session_id" in input_dict
            else {}
        )

        original_id      = original_session.get("session_id", "")
        original_agent   = original_session.get("agent_id", "")
        original_summary = original_session.get("failure_summary", "")
        original_ft      = original_session.get("failure_type", "")
        if not failure_type and original_ft:
            try:
                failure_type = FailureType(original_ft)
            except ValueError:
                pass

        # ── Extract analysis report from trace output ──────────────────────
        raw_output = trace.get("output") or {}
        output_dict = self._parse_dict(raw_output)
        report: dict = output_dict.get("report", {}) if isinstance(output_dict.get("report"), dict) else {}

        # ── Build a clean LLMCall representing the full analysis ───────────
        prompt_lines = []
        if original_id:
            prompt_lines.append(f"Analyzing session: {original_id}")
        if original_agent:
            prompt_lines.append(f"Agent: {original_agent}")
        if failure_type:
            prompt_lines.append(f"Failure type: {failure_type.value.replace('_', ' ')}")
        if original_summary:
            prompt_lines.append(f"Issue: {original_summary}")
        prompt_text = "\n".join(prompt_lines) or f"Aethen analysis — {trace_name}"

        response_parts = []
        if report.get("summary"):
            response_parts.append(str(report["summary"]))
        if report.get("root_cause"):
            response_parts.append(f"Root cause: {report['root_cause']}")
        if report.get("confidence") is not None:
            pct = round(float(report["confidence"]) * 100)
            response_parts.append(f"Confidence: {pct}%")
        response_text = "\n\n".join(response_parts) or "Analysis completed — see findings for details."

        llm_call = LLMCall(
            call_id=f"aethen-{uuid.uuid4().hex[:8]}",
            model="Aethen LangGraph",
            prompt=prompt_text,
            response=response_text,
            latency_ms=self._calc_latency(trace),
        )

        failure_summary = original_summary or f"Aethen analysis of {original_id or trace_name}"

        return Session(
            session_id=trace.get("id", f"lf-{uuid.uuid4().hex[:8]}"),
            agent_id=f"aethen-analysis",
            **({"timestamp": trace["timestamp"]} if trace.get("timestamp") else {}),
            outcome="success",
            failure_type=failure_type,
            failure_summary=failure_summary,
            llm_calls=[llm_call],
            tool_calls=[],
            retrieval_events=[],
            metadata={
                "source": "langfuse",
                "langfuse_trace_id": trace.get("id"),
                "aethen_trace": True,
                "original_session_id": original_id,
            },
        )

    def _is_tool(self, name: str, obs: dict) -> bool:
        return any(kw in name for kw in self.TOOL_KEYWORDS)

    def _is_retrieval(self, name: str, obs: dict) -> bool:
        return any(kw in name for kw in self.RETRIEVAL_KEYWORDS)

    def _extract_text(self, value) -> str:
        """Extract a human-readable string from any Langfuse input/output format.

        Handles:
          - Plain strings
          - OpenAI message dicts: {"role": "user", "content": "..."}
          - LangChain serialized: {"type": "HumanMessage", "data": {"content": "..."}}
          - LangChain kwargs: {"id": [...], "kwargs": {"content": "..."}, "type": "..."}
          - Nested messages list: {"messages": [...]}
          - LangChain batch output: {"generations": [[{"text": "..."}]]}
          - Lists of any of the above
        """
        if value is None:
            return ""
        if isinstance(value, str):
            # Langfuse sometimes stores input/output as a serialised JSON string.
            # Try to parse it so the structured extraction below can run.
            stripped = value.strip()
            if stripped and stripped[0] in ("[", "{"):
                try:
                    import json as _json
                    parsed = _json.loads(stripped)
                    return self._extract_text(parsed)
                except (ValueError, TypeError):
                    pass
            return value

        if isinstance(value, dict):
            # Direct content fields
            if "content" in value and value["content"]:
                return str(value["content"])
            if "text" in value and value["text"]:
                return str(value["text"])

            # LangChain serialized message: {"type": "HumanMessage", "data": {"content": "..."}}
            if "data" in value and isinstance(value["data"], dict):
                inner = value["data"]
                c = inner.get("content") or inner.get("text") or ""
                if c:
                    return str(c)

            # LangChain kwargs message: {"id": [...], "kwargs": {"content": "..."}, "type": "..."}
            if "kwargs" in value and isinstance(value["kwargs"], dict):
                c = value["kwargs"].get("content") or value["kwargs"].get("text") or ""
                if c:
                    return str(c)

            # Nested messages list
            if "messages" in value and isinstance(value["messages"], list):
                return self._extract_text(value["messages"])

            # LangChain batch output: {"generations": [[{"text": "..."}]]}
            if "generations" in value:
                gens = value["generations"]
                if isinstance(gens, list) and gens:
                    first_batch = gens[0]
                    if isinstance(first_batch, list) and first_batch:
                        return str(first_batch[-1].get("text", "") or
                                   first_batch[-1].get("message", {}).get("content", ""))

            # Last resort — dump the whole dict as string (better than nothing)
            return str(value)

        if isinstance(value, list) and value:
            # Collect content from each message, skip system messages if human messages exist
            parts: list[str] = []
            for item in value:
                if not isinstance(item, dict):
                    parts.append(str(item))
                    continue
                # Try all known content locations in priority order
                c = (
                    item.get("content")
                    or (item.get("data") or {}).get("content")
                    or (item.get("data") or {}).get("text")
                    or (item.get("kwargs") or {}).get("content")
                    or (item.get("kwargs") or {}).get("text")
                    or item.get("text")
                    or ""
                )
                if c:
                    parts.append(str(c))

            if parts:
                # Return last non-empty part (most likely the user/assistant turn)
                return parts[-1]
            return str(value)

        return str(value)

    def _calc_latency(self, obs: dict) -> float:
        """Calculate latency in ms from start/end timestamps."""
        start = obs.get("startTime")
        end = obs.get("endTime")
        if start and end:
            try:
                from datetime import datetime

                if isinstance(start, str):
                    start = datetime.fromisoformat(start.replace("Z", "+00:00"))
                if isinstance(end, str):
                    end = datetime.fromisoformat(end.replace("Z", "+00:00"))
                return max(0.0, (end - start).total_seconds() * 1000)
            except (ValueError, TypeError):
                pass
        return obs.get("latency") or 0.0

    def _infer_failure_type(
        self,
        trace: dict,
        llm_calls: list[LLMCall],
        tool_calls: list[ToolCall],
        retrieval_events: list[RetrievalEvent],
    ) -> FailureType | None:
        """Heuristic failure type inference from trace signals."""
        # 1. Check trace-level tags
        tags = [t.lower() for t in (trace.get("tags") or [])]
        for tag in tags:
            if "hallucin" in tag:
                return FailureType.HALLUCINATION
            if "tool" in tag or "misfire" in tag:
                return FailureType.TOOL_MISFIRE
            if "memory" in tag or "retrieval" in tag:
                return FailureType.MEMORY
            if "blind" in tag or "gap" in tag:
                return FailureType.BLIND_SPOT

        # 2. Check trace name
        name = (trace.get("name") or "").lower()
        if "hallucin" in name:
            return FailureType.HALLUCINATION
        if "tool" in name or "misfire" in name:
            return FailureType.TOOL_MISFIRE
        if "memory" in name or "retrieval" in name:
            return FailureType.MEMORY
        if "blind" in name or "gap" in name or "knowledge" in name:
            return FailureType.BLIND_SPOT

        # 3. Scan input/output content of the trace
        content = " ".join([
            self._extract_text(trace.get("input")),
            self._extract_text(trace.get("output")),
            *(c.prompt for c in llm_calls),
            *(c.response for c in llm_calls),
        ]).lower()

        if any(k in content for k in ("hallucin", "fabricat", "not verified", "incorrect claim", "quantum encryption")):
            return FailureType.HALLUCINATION
        if any(k in content for k in ("permissionerror", "insufficient privileges", "tool failed", "tool call failed", "update_user_record")):
            return FailureType.TOOL_MISFIRE
        if any(k in content for k in ("wrong document", "stale embedding", "retrieval system", "wrong chunk", "metadata mismatch")):
            return FailureType.MEMORY
        if any(k in content for k in ("0 results", "no results", "knowledge gap", "zephyr module", "not found in knowledge")):
            return FailureType.BLIND_SPOT

        # 4. Structural heuristics
        if any(t.status == ToolCallStatus.FAILED for t in tool_calls):
            return FailureType.TOOL_MISFIRE
        if any(r.chunks_returned == 0 for r in retrieval_events):
            return FailureType.BLIND_SPOT
        for r in retrieval_events:
            if r.expected_doc_ids and r.actual_doc_ids and set(r.expected_doc_ids) != set(r.actual_doc_ids):
                return FailureType.MEMORY

        return None


class LangfuseProvider(TraceProvider):
    """Pulls live traces from Langfuse and converts them to Aethen Sessions.

    Uses the Langfuse REST API client (v4) to fetch recent traces, then applies
    LangfuseTraceAdapter to convert them to our canonical Session format.
    """

    def __init__(self, public_key: str, secret_key: str, host: str = "https://us.cloud.langfuse.com"):
        self._public_key = public_key
        self._secret_key = secret_key
        self._host = host.rstrip("/")
        self._adapter = LangfuseTraceAdapter()
        self._client = None

    def _get_client(self):
        """Lazy-initialize the Langfuse REST API client."""
        if self._client is None:
            from langfuse.api import LangfuseAPI
            self._client = LangfuseAPI(
                base_url=self._host,
                username=self._public_key,
                password=self._secret_key,
            )
        return self._client

    def _to_dict(self, obj) -> dict:
        """Convert a Pydantic/dataclass object to a plain dict."""
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        return obj if isinstance(obj, dict) else {}

    async def fetch_traces(self, limit: int = 50) -> list[Session]:
        """Fetch recent traces from Langfuse and convert to Aethen Sessions."""
        client = self._get_client()
        sessions: list[Session] = []

        try:
            traces_response = client.trace.list(limit=limit)
            traces = traces_response.data if hasattr(traces_response, "data") else []

            for trace in traces:
                trace_dict = self._to_dict(trace)
                trace_id = trace_dict.get("id")

                # Fetch observations for this trace
                obs_response = client.observations.get_many(trace_id=trace_id)
                observations = obs_response.data if hasattr(obs_response, "data") else []
                obs_dicts = [self._to_dict(o) for o in (observations or [])]

                session = self._adapter.adapt_trace(trace_dict, obs_dicts)
                sessions.append(session)

                logger.debug(
                    "langfuse_trace_adapted",
                    trace_id=trace_id,
                    llm_calls=len(session.llm_calls),
                    tool_calls=len(session.tool_calls),
                    retrieval_events=len(session.retrieval_events),
                )

        except Exception as e:
            logger.error("langfuse_fetch_error", error=str(e))
            raise

        logger.info("langfuse_traces_fetched", count=len(sessions))
        return sessions

    async def health_check(self) -> dict:
        """Check Langfuse connectivity."""
        try:
            client = self._get_client()
            client.trace.list(limit=1)
            return {"status": "ok", "detail": f"Connected to {self._host}"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}
