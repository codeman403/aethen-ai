"""Langfuse live trace provider — pulls and adapts real traces from Langfuse API."""

import uuid
from datetime import datetime

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
        # obs_id → (startTime, endTime) for temporal linking
        obs_timestamps: dict[str, tuple] = {}

        for obs in observations:
            obs_id = obs.get("id") or ""
            obs_type = (obs.get("type") or "").upper()
            obs_name = (obs.get("name") or "").lower()

            # Collect timestamps keyed by observation ID
            if obs_id:
                start_dt = self._parse_dt(obs.get("startTime"))
                end_dt = self._parse_dt(obs.get("endTime"))
                if start_dt or end_dt:
                    obs_timestamps[obs_id] = (start_dt, end_dt)

            if obs_type == "GENERATION":
                llm_calls.append(self._to_llm_call(obs))
            elif self._is_retrieval(obs_name, obs):
                retrieval_events.append(self._to_retrieval_event(obs))
            elif obs_type == "SPAN" or self._is_tool(obs_name, obs):
                tool_calls.append(self._to_tool_call(obs))

        # Backfill LLMCall.source_documents from retrieval events that preceded each call
        if retrieval_events and llm_calls and obs_timestamps:
            self._link_retrieval_to_llm(llm_calls, retrieval_events, obs_timestamps)

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
            name = trace.get("name") or ""
            failure_summary = "Demo Agent — Free Form Chat" if name.startswith("demo-") else name.replace("-", " ").title()
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

    def _extract_human_prompt(self, value) -> str:
        """Extract the last human/user message from a messages list.

        When tool calls are present, the messages list includes ToolMessages and
        AIMessages with empty content. We want the actual human question, not the
        tool result or a dict dump of the tool call structure.
        """
        if not isinstance(value, list):
            return self._extract_text(value)

        # Walk in reverse — find the last human/user message
        human_roles = {"user", "human"}
        for item in reversed(value):
            if not isinstance(item, dict):
                continue
            role = (
                item.get("role")
                or (item.get("data") or {}).get("type", "")
                or (item.get("kwargs") or {}).get("type", "")
                or ""
            ).lower()
            if role in human_roles or "human" in role:
                c = (
                    item.get("content")
                    or (item.get("data") or {}).get("content")
                    or (item.get("kwargs") or {}).get("content")
                    or ""
                )
                if c:
                    return str(c)

        # No human message found — fall back to generic extraction
        return self._extract_text(value)

    def _extract_tool_call_response(self, value) -> str:
        """Synthesize a readable string when the LLM output is a tool call.

        When the LLM decides to call a tool, the GENERATION output has
        content=null/empty and tool_calls=[...]. _extract_text falls through to
        str(value) which dumps the raw dict and makes SessionContext show garbage.
        This method detects that pattern and returns a clean description instead.
        """
        if not isinstance(value, dict):
            return ""

        # Detect tool-call output: content is empty but tool_calls is present
        content = value.get("content") or ""
        tool_calls = (
            value.get("tool_calls")
            or (value.get("additional_kwargs") or {}).get("tool_calls")
            or []
        )
        if content or not tool_calls:
            return ""  # not a tool-call output — let _extract_text handle it

        parts = []
        for tc in tool_calls[:3]:
            # LangChain format: {"name": "...", "args": {...}, "type": "tool_call"}
            # OpenAI format:    {"type": "function", "function": {"name": "...", "arguments": "..."}}
            name = (
                tc.get("name")
                or (tc.get("function") or {}).get("name")
                or "unknown_tool"
            )
            args = tc.get("args") or tc.get("arguments") or (tc.get("function") or {}).get("arguments") or {}
            if isinstance(args, str):
                import json as _json
                try:
                    args = _json.loads(args)
                except (ValueError, TypeError):
                    pass
            args_str = str(args)[:120] if args else ""
            parts.append(f"Called tool: {name}({args_str})")

        return " | ".join(parts) if parts else ""

    def _to_llm_call(self, obs: dict) -> LLMCall:
        """Map a GENERATION observation to LLMCall."""
        usage = obs.get("usage") or {}
        model = obs.get("model") or obs.get("modelId") or "unknown"

        # Extract prompt — prefer the actual human message over tool results
        prompt = self._extract_human_prompt(obs.get("input"))

        # Extract response — handle tool-call outputs (content=null + tool_calls)
        output = obs.get("output")
        response = self._extract_tool_call_response(output) or self._extract_text(output)

        # Extract source documents from observation metadata or input context
        source_documents = self._extract_source_documents(obs)

        # Infer hallucination flag from observation-level signals
        hallucination_flag = self._infer_hallucination_flag(obs, response, source_documents)

        return LLMCall(
            call_id=obs.get("id", f"llm-{uuid.uuid4().hex[:8]}"),
            model=model,
            prompt=prompt,
            response=response,
            tokens_in=usage.get("input") or usage.get("promptTokens") or 0,
            tokens_out=usage.get("output") or usage.get("completionTokens") or 0,
            latency_ms=self._calc_latency(obs),
            hallucination_flag=hallucination_flag,
            source_documents=source_documents,
        )

    def _to_tool_call(self, obs: dict) -> ToolCall:
        """Map a SPAN observation to ToolCall."""
        error = None
        status = ToolCallStatus.SUCCESS
        level = (obs.get("level") or "").upper()
        latency = self._calc_latency(obs)
        metadata = obs.get("metadata") or {}

        if level == "ERROR" or obs.get("statusMessage"):
            error = obs.get("statusMessage") or "Tool execution failed"
            status = ToolCallStatus.FAILED
        elif latency > 30_000:
            # Flag likely timeouts based on high latency (>30s)
            status = ToolCallStatus.TIMEOUT
            error = f"High latency detected: {latency:.0f}ms (possible timeout)"

        # Extract error from output if not already captured
        if not error:
            output = obs.get("output")
            if isinstance(output, dict) and output.get("error"):
                error = str(output["error"])
                status = ToolCallStatus.FAILED
            elif isinstance(output, str) and any(
                sig in output.lower() for sig in ("error", "traceback", "exception", "failed")
            ):
                error = output[:500]
                status = ToolCallStatus.FAILED

        return ToolCall(
            call_id=obs.get("id", f"tool-{uuid.uuid4().hex[:8]}"),
            tool_name=obs.get("name", "unknown_tool"),
            parameters=obs.get("input") if isinstance(obs.get("input"), dict) else {},
            result=self._extract_text(obs.get("output")),
            error=error,
            status=status,
            latency_ms=latency,
        )

    def _to_retrieval_event(self, obs: dict) -> RetrievalEvent:
        """Map a retrieval-like observation to RetrievalEvent."""
        output = obs.get("output")
        metadata = obs.get("metadata") or {}
        input_data = obs.get("input")
        chunks = 0
        doc_ids: list[str] = []
        relevance_scores: list[float] = []

        if isinstance(output, list):
            chunks = len(output)
            # Try LangChain Document format first (most common from LangChain agents)
            if output and isinstance(output[0], dict) and self._is_langchain_document(output[0]):
                doc_ids, relevance_scores = self._extract_langchain_documents(output)
            else:
                for item in output:
                    if not isinstance(item, dict):
                        continue
                    # Extract doc IDs
                    doc_id = item.get("id") or item.get("doc_id") or item.get("document_id") or ""
                    if doc_id:
                        doc_ids.append(str(doc_id))
                    # Extract relevance/similarity scores from result items
                    score = (
                        item.get("score")
                        or item.get("relevance_score")
                        or item.get("similarity")
                        or item.get("distance")
                        or item.get("_score")
                    )
                    if score is not None:
                        try:
                            relevance_scores.append(float(score))
                        except (ValueError, TypeError):
                            pass
        elif isinstance(output, dict):
            results = output.get("results") or output.get("documents") or output.get("matches") or []
            chunks = len(results)
            for r in results:
                if not isinstance(r, dict):
                    continue
                doc_id = r.get("id") or r.get("doc_id") or r.get("document_id") or ""
                if doc_id:
                    doc_ids.append(str(doc_id))
                score = (
                    r.get("score")
                    or r.get("relevance_score")
                    or r.get("similarity")
                    or r.get("distance")
                    or r.get("_score")
                )
                if score is not None:
                    try:
                        relevance_scores.append(float(score))
                    except (ValueError, TypeError):
                        pass

        # Extract scores from observation metadata if not found in output
        if not relevance_scores:
            meta_scores = metadata.get("relevance_scores") or metadata.get("scores") or []
            for s in meta_scores:
                try:
                    relevance_scores.append(float(s))
                except (ValueError, TypeError):
                    pass

        # Extract metadata filters from input
        metadata_filters: dict = {}
        if isinstance(input_data, dict):
            metadata_filters = (
                input_data.get("filter")
                or input_data.get("filters")
                or input_data.get("metadata_filter")
                or input_data.get("where")
                or {}
            )
            if not isinstance(metadata_filters, dict):
                metadata_filters = {}

        # Extract namespace from input or metadata
        namespace = "default"
        if isinstance(input_data, dict):
            namespace = input_data.get("namespace") or input_data.get("index") or "default"
        if metadata.get("namespace"):
            namespace = metadata["namespace"]

        return RetrievalEvent(
            event_id=obs.get("id", f"ret-{uuid.uuid4().hex[:8]}"),
            query=self._extract_text(obs.get("input")),
            namespace=namespace,
            chunks_returned=chunks,
            relevance_scores=sorted(relevance_scores, reverse=True),
            metadata_filters=metadata_filters,
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

    def _extract_source_documents(self, obs: dict) -> list[str]:
        """Extract source document references from a GENERATION observation.

        Looks in multiple locations where frameworks store source/context docs:
        - observation metadata (e.g., metadata.source_documents)
        - input context (e.g., documents passed as context to the LLM)
        - output metadata (e.g., citations in structured output)
        """
        sources: list[str] = []
        metadata = obs.get("metadata") or {}

        # Check metadata for source document references
        for key in ("source_documents", "sources", "context_documents", "documents", "references"):
            docs = metadata.get(key) or []
            if isinstance(docs, list):
                for doc in docs:
                    doc_id = doc.get("id") if isinstance(doc, dict) else str(doc)
                    if doc_id:
                        sources.append(str(doc_id))

        # Check input for context documents (common in RAG pipelines)
        input_data = obs.get("input")
        if isinstance(input_data, dict):
            for key in ("context", "documents", "sources", "retrieved_chunks"):
                ctx = input_data.get(key) or []
                if isinstance(ctx, list):
                    for item in ctx:
                        if isinstance(item, dict):
                            doc_id = item.get("id") or item.get("doc_id") or item.get("source") or ""
                            if doc_id:
                                sources.append(str(doc_id))
                        elif isinstance(item, str) and len(item) < 200:
                            sources.append(item)
        elif isinstance(input_data, list):
            # Messages list — scan for context/source references in system messages
            for msg in input_data:
                if not isinstance(msg, dict):
                    continue
                role = msg.get("role") or (msg.get("data") or {}).get("role") or ""
                content = msg.get("content") or (msg.get("data") or {}).get("content") or ""
                if role == "system" and isinstance(content, str) and "source" in content.lower():
                    # Extract doc IDs mentioned in system prompt (e.g., "Sources: doc-123, doc-456")
                    import re
                    doc_refs = re.findall(r'doc[-_]?[a-zA-Z0-9]{4,}', content)
                    sources.extend(doc_refs[:10])

        return list(dict.fromkeys(sources))[:20]  # Deduplicate, cap at 20

    def _infer_hallucination_flag(self, obs: dict, response: str, source_documents: list[str]) -> bool:
        """Infer whether a response is likely hallucinated using content heuristics.

        Checks for common hallucination patterns without requiring an explicit flag.
        """
        metadata = obs.get("metadata") or {}

        # Explicit flags in metadata
        if metadata.get("hallucination") or metadata.get("hallucination_flag"):
            return True
        if metadata.get("verification_status") == "failed":
            return True

        # Content-based heuristics
        if not response:
            return False

        response_lower = response.lower()

        # Pattern: Claims grounding without sources
        grounding_claims = (
            "based on the documents", "according to the sources",
            "the retrieved context shows", "as stated in the",
            "the documentation says", "per the knowledge base",
        )
        if any(claim in response_lower for claim in grounding_claims) and not source_documents:
            return True

        # Pattern: Very specific numerical claims in short responses (often fabricated)
        # e.g., "The refund policy allows 90 days" when no source backs this
        import re
        has_specific_numbers = bool(re.search(r'\b\d{2,}\s*(days?|hours?|percent|%|\$|USD|GB|MB)\b', response))
        if has_specific_numbers and not source_documents and len(response) > 100:
            return True

        return False

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

    def _is_langchain_document(self, item: dict) -> bool:
        """Return True if the dict looks like a serialized LangChain Document."""
        return "page_content" in item or (item.get("type") == "Document" and "metadata" in item)

    def _extract_langchain_documents(self, output: list) -> tuple[list[str], list[float]]:
        """Extract doc IDs and scores from a list of LangChain Document objects.

        LangChain's VectorStoreRetriever logs retrieval output as:
            [{"page_content": "...", "metadata": {"source": "file.pdf", "score": 0.87}, "type": "Document"}]
        """
        doc_ids: list[str] = []
        scores: list[float] = []
        for item in output:
            if not isinstance(item, dict) or not self._is_langchain_document(item):
                continue
            meta = item.get("metadata") or {}
            # Doc ID: prefer explicit ID fields, fall back to source path
            doc_id = (
                meta.get("id")
                or meta.get("doc_id")
                or meta.get("document_id")
                or meta.get("source")
                or meta.get("file_path")
                or ""
            )
            if doc_id:
                # For file paths use just the filename as a stable identifier
                doc_id = str(doc_id).replace("\\", "/").split("/")[-1]
                doc_ids.append(doc_id)
            # Score: LangChain may store it in metadata under various keys
            score = (
                meta.get("score")
                or meta.get("relevance_score")
                or meta.get("_score")
                or meta.get("similarity")
                or meta.get("rank_score")
            )
            # distance fields are inverted (lower = better) — skip to avoid confusion
            if score is not None:
                try:
                    scores.append(float(score))
                except (ValueError, TypeError):
                    pass
        return doc_ids, scores

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

    def _parse_dt(self, value) -> datetime | None:
        """Parse a Langfuse timestamp (ISO string or datetime) into a datetime object."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        return None

    def _calc_latency(self, obs: dict) -> float:
        """Calculate latency in ms from start/end timestamps."""
        start = self._parse_dt(obs.get("startTime"))
        end = self._parse_dt(obs.get("endTime"))
        if start and end:
            return max(0.0, (end - start).total_seconds() * 1000)
        return obs.get("latency") or 0.0

    def _link_retrieval_to_llm(
        self,
        llm_calls: list[LLMCall],
        retrieval_events: list[RetrievalEvent],
        obs_timestamps: dict[str, tuple],
    ) -> None:
        """Backfill LLMCall.source_documents from retrieval events that preceded it.

        In RAG pipelines, the retrieval SPAN always completes before the generation
        GENERATION begins. The GENERATION observation rarely logs which documents
        it received as context; the retrieval SPAN always does. Temporal ordering
        lets us make that link without relying on parentObservationId (unreliable
        in LangChain's Langfuse callback).
        """
        for llm_call in llm_calls:
            if llm_call.source_documents:
                continue  # Already populated from the observation itself

            llm_start = (obs_timestamps.get(llm_call.call_id) or (None, None))[0]
            if not llm_start:
                continue

            # Collect doc IDs from all retrieval events that finished before this LLM call
            preceding_docs: list[str] = []
            for ret_event in retrieval_events:
                ret_end = (obs_timestamps.get(ret_event.event_id) or (None, None))[1]
                if ret_end and ret_end <= llm_start and ret_event.actual_doc_ids:
                    preceding_docs.extend(ret_event.actual_doc_ids)

            if not preceding_docs:
                continue

            # Deduplicate while preserving order, cap at 20
            seen: set[str] = set()
            unique_docs: list[str] = []
            for doc in preceding_docs:
                if doc not in seen:
                    seen.add(doc)
                    unique_docs.append(doc)
            llm_call.source_documents = unique_docs[:20]

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

        # 3. Scan input/output content of the trace for generic failure signals
        content = " ".join([
            self._extract_text(trace.get("input")),
            self._extract_text(trace.get("output")),
            *(c.prompt for c in llm_calls),
            *(c.response for c in llm_calls),
        ]).lower()

        # Content-based signals (generic, not demo-specific)
        hallucination_signals = (
            "hallucin", "fabricat", "not verified", "incorrect claim",
            "unsupported by source", "contradicts the", "made up", "not grounded",
        )
        tool_failure_signals = (
            "permissionerror", "insufficient privileges", "tool failed",
            "tool call failed", "connectionerror", "timeouterror",
            "valueerror", "tool execution error", "api error",
        )
        memory_signals = (
            "wrong document", "stale embedding", "wrong chunk",
            "metadata mismatch", "irrelevant context", "outdated embedding",
            "retrieval mismatch", "incorrect retrieval",
        )
        blind_spot_signals = (
            "knowledge gap", "not found in knowledge", "no relevant",
            "i don't have information", "outside my knowledge",
            "no documentation available", "unable to find",
        )

        if any(k in content for k in hallucination_signals):
            return FailureType.HALLUCINATION
        if any(k in content for k in tool_failure_signals):
            return FailureType.TOOL_MISFIRE
        if any(k in content for k in memory_signals):
            return FailureType.MEMORY
        if any(k in content for k in blind_spot_signals):
            return FailureType.BLIND_SPOT

        # 4. Structural heuristics — multi-signal scoring for better accuracy
        score: dict[FailureType, float] = {
            FailureType.TOOL_MISFIRE: 0.0,
            FailureType.BLIND_SPOT: 0.0,
            FailureType.MEMORY: 0.0,
            FailureType.HALLUCINATION: 0.0,
        }

        # Tool failure signals
        failed_tools = [t for t in tool_calls if t.status == ToolCallStatus.FAILED]
        timed_out_tools = [t for t in tool_calls if t.status == ToolCallStatus.TIMEOUT]
        if failed_tools:
            score[FailureType.TOOL_MISFIRE] += 0.6
        if timed_out_tools:
            score[FailureType.TOOL_MISFIRE] += 0.4
        if len(failed_tools) > 1:
            score[FailureType.TOOL_MISFIRE] += 0.2  # Cascading failures

        # Blind spot signals
        zero_chunk_retrievals = [r for r in retrieval_events if r.chunks_returned == 0]
        if zero_chunk_retrievals:
            score[FailureType.BLIND_SPOT] += 0.6
        if len(zero_chunk_retrievals) > 1:
            score[FailureType.BLIND_SPOT] += 0.2  # Repeated gaps

        # Memory signals
        for r in retrieval_events:
            if r.expected_doc_ids and r.actual_doc_ids and set(r.expected_doc_ids) != set(r.actual_doc_ids):
                score[FailureType.MEMORY] += 0.6
            if r.relevance_scores and max(r.relevance_scores) < 0.5:
                score[FailureType.MEMORY] += 0.4
            if r.relevance_scores and r.chunks_returned > 0 and sum(r.relevance_scores) / len(r.relevance_scores) < 0.4:
                score[FailureType.MEMORY] += 0.3  # Low average relevance

        # Hallucination signals
        for lc in llm_calls:
            if lc.hallucination_flag:
                score[FailureType.HALLUCINATION] += 0.8
            if lc.response and not lc.source_documents:
                # Long response with no source docs is suspicious
                if len(lc.response) > 200:
                    score[FailureType.HALLUCINATION] += 0.2

        # Return highest-scoring type if it exceeds threshold
        if score:
            best_type = max(score, key=score.get)
            if score[best_type] >= 0.4:
                return best_type

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

    async def fetch_traces(
        self,
        limit: int = 50,
        since: "datetime | None" = None,
    ) -> list[Session]:
        """Fetch non-internal traces from Langfuse and convert to Aethen Sessions.

        Args:
            limit: Maximum real agent sessions to return.
            since: Only fetch traces created after this timestamp (incremental pull).

        Paginates through results, skipping aethen-* internal traces, until `limit`
        real sessions are collected or there are no more pages.
        """
        client = self._get_client()
        sessions: list[Session] = []
        page = 1
        page_size = 50

        try:
            while len(sessions) < limit:
                list_kwargs: dict = {"limit": page_size, "page": page}
                if since:
                    list_kwargs["from_timestamp"] = since

                traces_response = client.trace.list(**list_kwargs)
                traces = traces_response.data if hasattr(traces_response, "data") else []

                if not traces:
                    break

                for trace in traces:
                    if len(sessions) >= limit:
                        break

                    trace_dict = self._to_dict(trace)
                    trace_id = trace_dict.get("id")
                    trace_name = (trace_dict.get("name") or "")

                    # Skip Aethen's own internal analysis traces.
                    if trace_name.startswith("aethen-"):
                        logger.debug("langfuse_skipping_internal_trace", trace_id=trace_id, name=trace_name)
                        continue

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

                if len(traces) < page_size:
                    break

                page += 1

        except Exception as e:
            logger.error("langfuse_fetch_error", error=str(e))
            raise

        logger.info(
            "langfuse_traces_fetched",
            count=len(sessions),
            pages=page,
            since=since.isoformat() if since else "all",
        )
        return sessions

    async def health_check(self) -> dict:
        """Check Langfuse connectivity."""
        try:
            client = self._get_client()
            client.trace.list(limit=1)
            return {"status": "ok", "detail": f"Connected to {self._host}"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}
