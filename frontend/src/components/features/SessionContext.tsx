"use client";

import { MessageSquare, Cpu, Zap, ScanSearch } from "lucide-react";

// ── Text extraction ──────────────────────────────────────────────────────────
// Langfuse stores prompts/responses in many formats (JSON strings, message
// arrays, nested objects). This function converts any format to plain text.

function extractPlainText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      // 1. Try standard JSON
      try { return extractPlainText(JSON.parse(trimmed)); } catch { /* not JSON */ }

      // 2. Try Python repr → JSON (single quotes, True/False/None)
      try {
        const asJson = trimmed
          .replace(/'/g, '"')
          .replace(/\bTrue\b/g, "true")
          .replace(/\bFalse\b/g, "false")
          .replace(/\bNone\b/g, "null");
        return extractPlainText(JSON.parse(asJson));
      } catch { /* not Python repr */ }

      // 3. Regex: pull a natural-language value from known content keys
      const keyMatch = trimmed.match(
        /['"](?:content|text|prompt|message|query|response|output)['"]:\s*['"]([^'"\\]{1,800})/
      );
      if (keyMatch) return keyMatch[1].trim();

      // 4. Last resort: truncate so we don't dump huge blobs into the UI
      return trimmed.length > 300
        ? "[ complex internal data — re-pull from Langfuse to refresh ]"
        : trimmed;
    }

    // Handle "Query: {json} | Response: {json}" pattern built by the Langfuse adapter
    if (trimmed.startsWith("Query:") && trimmed.includes("| Response:")) {
      const qMatch = trimmed.match(/^Query:\s*([\s\S]+?)\s*\|\s*Response:/);
      if (qMatch) return extractPlainText(qMatch[1].trim());
    }

    return trimmed;
  }

  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => extractPlainText(item))
      .filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.content)                            return extractPlainText(obj.content);
    if (obj.text)                               return extractPlainText(obj.text);
    if (obj.data && typeof obj.data === "object") return extractPlainText(obj.data);
    if (obj.kwargs && typeof obj.kwargs === "object") return extractPlainText(obj.kwargs);
    if (obj.messages)                           return extractPlainText(obj.messages);
    if (obj.generations) {
      const g = obj.generations as unknown[][];
      const first = g?.[0]?.[0];
      if (first) return extractPlainText(first);
    }
    // Fallback: join all string values
    const vals = Object.values(obj).filter((v) => typeof v === "string" && v.trim());
    return vals.length ? String(vals[0]) : "";
  }

  return String(raw);
}

interface SessionContextProps {
  session: Record<string, unknown>;
}

/**
 * Shows the original agent interaction from a session:
 * failure summary, LLM prompts/responses, tool calls, retrieval events.
 * Used on all module pages and the Trace Explorer to give context
 * alongside the analysis report.
 */
/** True when the prompt is an internal LangGraph state blob, not a user query. */
function isInternalState(prompt: unknown): boolean {
  if (typeof prompt !== "string") return false;
  const t = prompt.trim();
  // LangGraph AgentState starts with the session key or is very long internal JSON
  return (
    t.startsWith("{'session'") ||
    t.startsWith('{"session"') ||
    t.startsWith("{'failure_type'") ||
    (t.length > 800 && (t.includes("'session_id'") || t.includes('"session_id"')))
  );
}

export function SessionContext({ session }: SessionContextProps) {
  const agentId        = session.agent_id as string | undefined;
  const failureSummary = session.failure_summary as string | undefined;
  const llmCalls       = (session.llm_calls  as Record<string, unknown>[]) ?? [];
  const toolCalls      = (session.tool_calls as Record<string, unknown>[]) ?? [];
  const retrievals     = (session.retrieval_events as Record<string, unknown>[]) ?? [];

  // Filter out any llm calls whose prompt is a LangGraph internal state blob.
  // The backend now builds clean calls for all trace types including Aethen's
  // own analysis traces, so this is only a safety net for old Postgres data.
  const agentLlmCalls = llmCalls.filter(
    (call) => !isInternalState(call.prompt)
  );

  const hasContent =
    failureSummary || agentLlmCalls.length > 0 || toolCalls.length > 0 || retrievals.length > 0;
  if (!hasContent) return null;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <div>
          <h3 className="font-semibold tracking-tight text-sm">Session Context</h3>
          <p className="text-xs text-muted-foreground">Original agent interaction — what was asked and how the agent responded</p>
        </div>
      </div>

      <div className="divide-y">
        {/* Failure summary */}
        {failureSummary && (
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Failure Summary
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3">
              {failureSummary}
            </p>
          </div>
        )}

        {/* LLM calls — prompt + response */}
        {agentLlmCalls.map((call, i) => {
          const modelName  = extractPlainText(call.model);
          const promptText = extractPlainText(call.prompt);
          const replyText  = extractPlainText(call.response);
          return (
            <div key={i} className="px-6 py-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Cpu className="size-3" />
                LLM Call {agentLlmCalls.length > 1 ? `#${i + 1}` : ""}
                {modelName && modelName !== "unknown" && (
                  <span className="font-mono normal-case font-normal text-muted-foreground/70">
                    · {modelName}
                  </span>
                )}
                {Boolean(call.hallucination_flag) && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 normal-case font-medium">
                    ⚠ Hallucination flagged
                  </span>
                )}
              </div>

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  User Prompt
                </p>
                <div className="bg-primary/5 border border-primary/10 rounded-lg px-4 py-3 text-sm leading-relaxed select-text whitespace-pre-wrap" style={{ userSelect: "text" }}>
                  {promptText || <span className="text-muted-foreground italic">Not captured</span>}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Agent Response
                </p>
                <div className="bg-muted/40 border rounded-lg px-4 py-3 text-sm leading-relaxed select-text whitespace-pre-wrap" style={{ userSelect: "text" }}>
                  {replyText || <span className="text-muted-foreground italic">Not captured</span>}
                </div>
              </div>

              {Boolean(call.tokens_in ?? call.tokens_out ?? call.latency_ms) && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {call.tokens_in != null && <span>{call.tokens_in as number}↑ tokens in</span>}
                  {call.tokens_out != null && <span>{call.tokens_out as number}↓ tokens out</span>}
                  {call.latency_ms != null && <span>{(call.latency_ms as number).toLocaleString()}ms</span>}
                </div>
              )}
            </div>
          );
        })}

        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              <Zap className="size-3" />
              Tool Calls ({toolCalls.length})
            </div>
            <div className="space-y-2">
              {toolCalls.map((tc, i) => {
                const status = tc.status as string;
                const borderColor = status === "success"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : status === "timeout"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-rose-500/20 bg-rose-500/5";
                return (
                  <div key={i} className={`rounded-lg border px-4 py-3 text-sm ${borderColor}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-medium">{tc.tool_name as string}</span>
                      <span className={`text-xs font-medium ${
                        status === "success" ? "text-emerald-600" :
                        status === "timeout" ? "text-amber-600" : "text-rose-600"
                      }`}>{status}</span>
                    </div>
                    {Boolean(tc.error) && <p className="text-xs text-rose-600 dark:text-rose-400">{extractPlainText(tc.error)}</p>}
                    {tc.latency_ms != null && (
                      <p className="text-xs text-muted-foreground mt-1">{(tc.latency_ms as number).toLocaleString()}ms</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Retrieval events */}
        {retrievals.length > 0 && (
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              <ScanSearch className="size-3" />
              Retrieval Events ({retrievals.length})
            </div>
            <div className="space-y-2">
              {retrievals.map((ev, i) => {
                const scores = (ev.relevance_scores as number[]) ?? [];
                const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                const noResults = (ev.chunks_returned as number) === 0;
                return (
                  <div key={i} className={`rounded-lg border px-4 py-3 text-sm ${noResults ? "border-rose-500/20 bg-rose-500/5" : "border-border bg-muted/20"}`}>
                    <p className="text-xs font-medium mb-1 line-clamp-2">{extractPlainText(ev.query)}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{ev.chunks_returned as number} chunks returned</span>
                      {avg != null && <span>avg relevance: {Math.round(avg * 100)}%</span>}
                      {noResults && <span className="text-rose-600 font-medium">No results found</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
