"use client";

import { useState, ReactNode } from "react";
import { MessageSquare, Cpu, Zap, ScanSearch, ChevronDown } from "lucide-react";

function CollapsibleSection({ 
  title, 
  icon: Icon, 
  count, 
  children, 
  defaultOpen = false 
}: { 
  title: string; 
  icon: any; 
  count?: number; 
  children: ReactNode; 
  defaultOpen?: boolean; 
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t first:border-t-0 border-border/50">
      <button 
        onClick={() => setOpen(!open)} 
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/5 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-muted rounded-md group-hover:bg-primary/10 group-hover:text-primary transition-colors">
            <Icon className="size-4" />
          </div>
          <span className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {title} {count !== undefined && `(${count})`}
          </span>
        </div>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="px-6 pb-6 pt-2 space-y-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className="rounded-xl border bg-card shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <div>
          <h3 className="font-semibold tracking-tight text-base">Session Context</h3>
          <p className="text-sm text-muted-foreground">Original agent interaction — what was asked and how the agent responded</p>
        </div>
      </div>

      <div className="flex flex-col">
        {/* Failure summary */}
        {failureSummary && (
          <div className="px-6 py-5 border-b border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <MessageSquare className="size-3.5" /> Failure Summary
            </p>
            <p className="text-base text-amber-700 dark:text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 shadow-inner">
              {failureSummary}
            </p>
          </div>
        )}

        {/* LLM calls — prompt + response */}
        {agentLlmCalls.length > 0 && (
          <CollapsibleSection title="LLM Calls" icon={Cpu} count={agentLlmCalls.length} defaultOpen={false}>
            {agentLlmCalls.map((call, i) => {
              const modelName  = extractPlainText(call.model);
              const promptText = extractPlainText(call.prompt);
              const replyText  = extractPlainText(call.response);
              return (
                <div key={i} className="space-y-3 pb-6 border-b border-border/50 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <span className="uppercase tracking-wider">Call {agentLlmCalls.length > 1 ? `#${i + 1}` : ""}</span>
                    {modelName && modelName !== "unknown" && (
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-md border">
                        {modelName}
                      </span>
                    )}
                    {Boolean(call.hallucination_flag) && (
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium shadow-sm">
                        ⚠ Hallucination flagged
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 ml-1">
                      User Prompt
                    </p>
                    <div className="bg-primary/5 border border-primary/10 rounded-xl px-4 py-3 text-sm leading-relaxed select-text whitespace-pre-wrap shadow-inner" style={{ userSelect: "text" }}>
                      {promptText || <span className="text-muted-foreground italic">Not captured</span>}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 ml-1">
                      Agent Response
                    </p>
                    <div className="bg-card border rounded-xl px-4 py-3 text-sm leading-relaxed select-text whitespace-pre-wrap shadow-sm" style={{ userSelect: "text" }}>
                      {replyText || <span className="text-muted-foreground italic">Not captured</span>}
                    </div>
                  </div>

                  {Boolean(call.tokens_in ?? call.tokens_out ?? call.latency_ms) && (
                    <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg w-fit">
                      {call.tokens_in != null && <span>{call.tokens_in as number}↑ in</span>}
                      {call.tokens_out != null && <span>{call.tokens_out as number}↓ out</span>}
                      {call.latency_ms != null && <span>{(call.latency_ms as number).toLocaleString()}ms</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </CollapsibleSection>
        )}

        {/* Tool calls */}
        {toolCalls.length > 0 && (
          <CollapsibleSection title="Tool Executions" icon={Zap} count={toolCalls.length} defaultOpen={false}>
            <div className="grid gap-3 sm:grid-cols-2">
              {toolCalls.map((tc, i) => {
                const status = tc.status as string;
                const borderColor = status === "success"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : status === "timeout"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-rose-500/20 bg-rose-500/5";
                return (
                  <div key={i} className={`rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${borderColor}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold truncate pr-2">{tc.tool_name as string}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        status === "success" ? "bg-emerald-500/10 text-emerald-600" :
                        status === "timeout" ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600"
                      }`}>{status}</span>
                    </div>
                    {Boolean(tc.error) && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 bg-rose-500/10 p-2 rounded-md border border-rose-500/20">{extractPlainText(tc.error)}</p>}
                    {tc.latency_ms != null && (
                      <div className="mt-2 text-right">
                        <span className="text-[10px] font-mono text-muted-foreground bg-background/50 px-2 py-0.5 rounded">{(tc.latency_ms as number).toLocaleString()}ms</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Retrieval events */}
        {retrievals.length > 0 && (
          <CollapsibleSection title="Vector Retrievals" icon={ScanSearch} count={retrievals.length} defaultOpen={false}>
            <div className="space-y-3">
              {retrievals.map((ev, i) => {
                const scores = (ev.relevance_scores as number[]) ?? [];
                const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                const noResults = (ev.chunks_returned as number) === 0;
                return (
                  <div key={i} className={`rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md ${noResults ? "border-rose-500/20 bg-rose-500/5" : "border-border bg-card"}`}>
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-muted rounded-md shrink-0">
                        <ScanSearch className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium mb-2 leading-relaxed text-foreground">{extractPlainText(ev.query)}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`font-medium px-2 py-0.5 rounded-md border ${noResults ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' : 'bg-muted text-muted-foreground border-border/50'}`}>
                            {ev.chunks_returned as number} chunks
                          </span>
                          {avg != null && (
                            <span className="font-mono px-2 py-0.5 rounded-md bg-muted/50 border border-border/50 text-muted-foreground">
                              {Math.round(avg * 100)}% match
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
