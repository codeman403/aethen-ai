"use client";

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import {
  MessageSquare,
  BrainCircuit,
  Wrench,
  ShieldAlert,
  ScanSearch,
  Send,
  Loader2,
  Zap,
  AlertCircle,
  ChevronRight,
  Copy,
  Check,
  Plus,
  Clock,
} from "lucide-react";
import {
  sendFreeformQuery,
  analyzeSession,
  buildMemorySession,
  buildToolMisfireSession,
  buildHallucinationSession,
  buildBlindSpotSession,
  createChatSession,
  listChatSessions,
  loadChatSession,
  appendChatMessage,
  renameChatSession,
  type AnalysisReport,
  type Finding,
  type ChatHistoryMessage,
  type ChatSessionSummary,
  type ChatMessageRecord,
} from "@/lib/api";

// ── Copy button — appears on hover beside each message ─────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied
        ? <Check className="size-3 text-emerald-500" />
        : <Copy className="size-3" />}
    </button>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

type MessageKind = "user" | "assistant" | "analysis";

interface ChatEntry {
  id: string;
  kind: MessageKind;
  content: string;
  langfuseTraced?: boolean;
  report?: AnalysisReport;
  latency_ms?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
  high: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
  medium: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
  low: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
};

const FAILURE_TYPE_COLORS: Record<string, string> = {
  memory: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
  tool_misfire: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
  hallucination: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
  blind_spot: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
};

function renderText(text: string) {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {line}
      {i < text.split("\n").length - 1 && <br />}
    </span>
  ));
}

function AnalysisCard({ report }: { report: AnalysisReport }) {
  const [copied, setCopied] = useState(false);
  const typeColor = FAILURE_TYPE_COLORS[report.failure_type] ?? "bg-muted border-border text-muted-foreground";
  const showTypeBadge = report.failure_type !== "unknown";
  const showConfidence = report.confidence > 0;

  // Copy human-readable text, not raw JSON
  const handleCopy = () => {
    const lines: string[] = [report.summary];
    if (report.root_cause) lines.push(`\nRoot Cause: ${report.root_cause}`);
    if (report.findings.length > 0) {
      lines.push("\nFindings:");
      report.findings.forEach((f: Finding) => {
        lines.push(`• ${f.title}: ${f.description}`);
        if (f.recommendation) lines.push(`  → ${f.recommendation}`);
      });
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden mt-2">
      <div className="px-4 py-3 border-b bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showTypeBadge && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>
              {report.failure_type.replace(/_/g, " ")}
            </span>
          )}
          {showConfidence && (
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                report.confidence >= 0.7
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                  : report.confidence >= 0.4
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-600"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-600"
              }`}
            >
              {Math.round(report.confidence * 100)}% confidence
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Copy response"
        >
          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {report.summary && (
          <p className="text-sm">{report.summary}</p>
        )}
        {report.root_cause && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Root Cause</p>
            <p className="text-sm font-medium">{report.root_cause}</p>
          </div>
        )}
        {report.findings.slice(0, 10).map((f: Finding, i: number) => (
          <div
            key={i}
            className={`rounded-lg border p-3 ${SEVERITY_CONFIG[f.severity] ?? "border-border bg-muted/20"}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle className="size-3 flex-shrink-0" />
              <span className="text-xs font-medium">{f.title}</span>
            </div>
            <p className="text-xs opacity-80">{f.description}</p>
            {f.recommendation && (
              <p className="text-xs font-medium mt-1">→ {f.recommendation}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Suggested Query Definitions ────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  {
    icon: BrainCircuit,
    title: "Analyze Memory Retrieval Failure",
    description: "Why did the agent retrieve the wrong context from the knowledge base?",
    failureType: "memory",
    builder: buildMemorySession,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10",
    href: "/memory-debug",
  },
  {
    icon: Wrench,
    title: "Diagnose Tool Call Error",
    description: "Which tool calls failed and what caused the cascading errors?",
    failureType: "tool_misfire",
    builder: buildToolMisfireSession,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10",
    href: "/tool-misfire",
  },
  {
    icon: ShieldAlert,
    title: "Trace Hallucination to Root Cause",
    description: "What caused the agent to fabricate a claim not supported by sources?",
    failureType: "hallucination",
    builder: buildHallucinationSession,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10",
    href: "/hallucination-rca",
  },
  {
    icon: ScanSearch,
    title: "Discover Knowledge Gaps",
    description: "What topics does the agent consistently fail on due to missing docs?",
    failureType: "blind_spot",
    builder: buildBlindSpotSession,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10",
    href: "/blind-spots",
  },
];

// ── Main Component ─────────────────────────────────────────────────────────

// ── Convert a DB record back to a ChatEntry ────────────────────────────────
function recordToEntry(r: ChatMessageRecord): ChatEntry {
  return {
    id: r.id,
    kind: r.kind as ChatEntry["kind"],
    content: r.content,
    report: r.report ?? undefined,
    langfuseTraced: false,
    latency_ms: r.latency_ms ?? undefined,
  };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastReport, setLastReport] = useState<AnalysisReport | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Live elapsed timer ───────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isLoading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(p => p + 100), 100);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isLoading]);

  // ── Session state ────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const isFirstMessageRef = useRef(true);

  // Load session list on mount
  useEffect(() => {
    listChatSessions()
      .then(setSessions)
      .catch(() => {/* graceful — Postgres may not be running locally */})
      .finally(() => setLoadingSessions(false));
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const refreshSessionList = useCallback(async () => {
    const updated = await listChatSessions().catch(() => []);
    setSessions(updated);
  }, []);

  const handleNewChat = async () => {
    setMessages([]);
    setLastReport(null);
    setCurrentSessionId(null);
    isFirstMessageRef.current = true;
  };

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    isFirstMessageRef.current = false;
    const records = await loadChatSession(sessionId).catch(() => []);
    setMessages(records.map(recordToEntry));
    const lastAnalysis = records.filter(r => r.kind === "analysis" && r.report).pop();
    if (lastAnalysis?.report) setLastReport(lastAnalysis.report as AnalysisReport);
  };

  // Ensure a session exists before the first message; auto-name from first user text
  const ensureSession = async (firstMessage: string): Promise<string> => {
    if (currentSessionId) return currentSessionId;
    const title = firstMessage.length > 60 ? firstMessage.slice(0, 60) + "…" : firstMessage;
    const session = await createChatSession(title);
    setCurrentSessionId(session.id);
    setSessions(prev => [session, ...prev]);
    return session.id;
  };

  const saveMessage = async (sessionId: string, entry: ChatEntry) => {
    await appendChatMessage(sessionId, {
      id: entry.id,
      role: entry.kind === "user" ? "user" : "assistant",
      kind: entry.kind,
      content: entry.content,
      report: entry.report ?? null,
      latency_ms: entry.latency_ms ?? null,
    }).catch(() => {/* non-fatal */});
  };

  const addEntry = (entry: ChatEntry) => setMessages((prev) => [...prev, entry]);

  const buildHistory = (currentMessages: ChatEntry[]): ChatHistoryMessage[] =>
    currentMessages
      .filter((m) => m.kind === "user" || m.kind === "assistant" || (m.kind === "analysis" && m.report))
      .map((m) => ({
        role: (m.kind === "user" ? "user" : "assistant") as "user" | "assistant",
        content:
          m.kind === "analysis" && m.report
            ? m.report.confidence > 0 && m.report.root_cause
              ? `${m.report.summary} Root cause: ${m.report.root_cause}`
              : m.report.summary
            : m.content,
      }));

  const sendFreeform = async (text: string) => {
    const history = buildHistory(messages);
    const sessionId = await ensureSession(text);

    // If this is the first message in a brand-new session, auto-name it
    if (isFirstMessageRef.current) {
      isFirstMessageRef.current = false;
      const title = text.length > 60 ? text.slice(0, 60) + "…" : text;
      renameChatSession(sessionId, title).catch(() => {});
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
    }

    const userEntry: ChatEntry = { id: crypto.randomUUID(), kind: "user", content: text };
    addEntry(userEntry);
    saveMessage(sessionId, userEntry);
    setInput("");
    setIsLoading(true);
    const t0 = performance.now();

    try {
      const report = await sendFreeformQuery(text, history);
      const latency_ms = Math.round(performance.now() - t0);
      setLastReport(report);
      const analysisEntry: ChatEntry = { id: crypto.randomUUID(), kind: "analysis", content: report.summary ?? "", report, latency_ms };
      addEntry(analysisEntry);
      saveMessage(sessionId, analysisEntry);
      refreshSessionList();
    } catch (e) {
      const latency_ms = Math.round(performance.now() - t0);
      const errEntry: ChatEntry = {
        id: crypto.randomUUID(),
        kind: "assistant",
        content: `Analysis failed: ${e instanceof Error ? e.message : "Unknown error"}`,
        latency_ms,
      };
      addEntry(errEntry);
      saveMessage(sessionId, errEntry);
    } finally {
      setIsLoading(false);
    }
  };

  const runSuggestedQuery = async (query: (typeof SUGGESTED_QUERIES)[0]) => {
    const chatSessionId = await ensureSession(query.description);
    if (isFirstMessageRef.current) {
      isFirstMessageRef.current = false;
      renameChatSession(chatSessionId, query.title).catch(() => {});
      setSessions(prev => prev.map(s => s.id === chatSessionId ? { ...s, title: query.title } : s));
    }

    const traceSessionId = `chat-${query.failureType}-${Math.random().toString(36).slice(2, 8)}`;
    const traceSession = query.builder(traceSessionId);

    const userEntry: ChatEntry = { id: crypto.randomUUID(), kind: "user", content: query.description };
    addEntry(userEntry);
    saveMessage(chatSessionId, userEntry);
    setIsLoading(true);
    const t0 = performance.now();

    try {
      const report = await analyzeSession(traceSession);
      const latency_ms = Math.round(performance.now() - t0);
      setLastReport(report);
      const analysisEntry: ChatEntry = { id: crypto.randomUUID(), kind: "analysis", content: report.summary ?? "", report, latency_ms };
      addEntry(analysisEntry);
      saveMessage(chatSessionId, analysisEntry);
      refreshSessionList();
    } catch (e) {
      const latency_ms = Math.round(performance.now() - t0);
      const errEntry: ChatEntry = {
        id: crypto.randomUUID(),
        kind: "assistant",
        content: `Analysis failed: ${e instanceof Error ? e.message : "Unknown error"}`,
        latency_ms,
      };
      addEntry(errEntry);
      saveMessage(chatSessionId, errEntry);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) sendFreeform(input.trim());
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-5rem)] animate-in fade-in duration-500">

      {/* ── Sessions Panel ────────────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-3 py-3 border-b bg-muted/10 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
          <button
            onClick={handleNewChat}
            className="size-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="New chat"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
          {/* Current unsaved session */}
          {currentSessionId === null && messages.length > 0 && (
            <div className="px-2.5 py-2 rounded-lg text-xs bg-primary/10 text-primary font-medium truncate">
              Current session
            </div>
          )}
          {currentSessionId === null && messages.length === 0 && !loadingSessions && (
            <p className="text-[11px] text-muted-foreground text-center py-4 px-2">
              Start typing to begin a session
            </p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSession(s.id)}
              className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors group ${
                s.id === currentSessionId
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <p className="text-xs font-medium truncate">{s.title}</p>
              <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-60">
                <Clock className="size-2.5" />
                <span>{s.message_count} msg{s.message_count !== 1 ? "s" : ""}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat Interface ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-3">
          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageSquare className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold tracking-tight">Chat Debug</h2>
            <p className="text-xs text-muted-foreground">
              Freeform diagnostic queries · LangGraph analysis · Langfuse traced
            </p>
          </div>
        </div>

        {/* Message history */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <MessageSquare className="size-7 opacity-40" />
              </div>
              <p className="font-medium text-foreground">Start a debugging session</p>
              <p className="text-sm mt-1 max-w-xs">
                Ask anything about your agent failures — all responses are grounded in your real trace data via the LangGraph pipeline.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.kind === "user") {
              return (
                <div key={msg.id} className="flex justify-end group">
                  <div className="max-w-[80%] flex flex-col items-end gap-1">
                    {/* inline style guarantees selection even if a parent sets user-select:none */}
                    <div
                      className="rounded-2xl rounded-tr-sm px-4 py-3 bg-primary text-primary-foreground text-sm cursor-text"
                      style={{ userSelect: "text" }}
                    >
                      {msg.content}
                    </div>
                    <CopyButton text={msg.content} />
                  </div>
                </div>
              );
            }
            if (msg.kind === "analysis" && msg.report) {
              // confidence=0 = LLM catch-all / stats-only / conversational — render as plain text
              const isPlainText = msg.report.confidence === 0;
              const copyText = isPlainText
                ? msg.report.summary
                : `${msg.report.summary}\n\nRoot Cause: ${msg.report.root_cause}\n\n${
                    msg.report.findings.map((f: Finding) => `• ${f.title}: ${f.description}`).join("\n")
                  }`;

              return (
                <div key={msg.id} className="flex justify-start group">
                  <div className="max-w-[90%]">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="size-3 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">Aethen</span>
                      {!isPlainText && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ LangGraph Pipeline
                        </span>
                      )}
                      {msg.latency_ms != null && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                          {msg.latency_ms >= 1000
                            ? `${(msg.latency_ms / 1000).toFixed(1)}s`
                            : `${msg.latency_ms}ms`}
                        </span>
                      )}
                      <CopyButton text={copyText} />
                    </div>
                    {isPlainText ? (
                      <div
                        className="rounded-2xl rounded-tl-sm px-4 py-3 border bg-muted/30 text-sm leading-relaxed cursor-text"
                        style={{ userSelect: "text" }}
                      >
                        {renderText(msg.report.summary)}
                      </div>
                    ) : (
                      <AnalysisCard report={msg.report} />
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className="flex justify-start group">
                <div className="max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="size-3 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Aethen</span>
                    {msg.langfuseTraced && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <Zap className="size-2.5 inline mr-0.5" />
                        Traced to Langfuse ✓
                      </span>
                    )}
                    {msg.latency_ms != null && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                        {msg.latency_ms >= 1000
                          ? `${(msg.latency_ms / 1000).toFixed(1)}s`
                          : `${msg.latency_ms}ms`}
                      </span>
                    )}
                    <CopyButton text={msg.content} />
                  </div>
                  <div
                    className="rounded-2xl rounded-tl-sm px-4 py-3 border bg-muted/30 text-sm leading-relaxed cursor-text"
                    style={{ userSelect: "text" }}
                  >
                    {renderText(msg.content)}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 border bg-muted/30">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums font-medium">
                    {elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t bg-muted/5">
          <div className="flex items-end gap-2 rounded-xl border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-primary/40">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="e.g. 'show top tool failures' or 'why is retrieval failing?' — grounded in your real traces"
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground max-h-32 overflow-y-auto py-1"
              style={{ minHeight: "24px" }}
            />
            <button
              onClick={() => input.trim() && !isLoading && sendFreeform(input.trim())}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            AI-generated analysis. Verify before acting on any diagnosis.
          </p>
        </div>
      </div>

      {/* ── Right: Suggested Queries + Evidence ───────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-auto">
        {/* Suggested Queries */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/10">
            <h3 className="font-semibold tracking-tight text-sm">Suggested Queries</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click to run a structured LangGraph analysis
            </p>
          </div>
          <div className="p-3 space-y-2">
            {SUGGESTED_QUERIES.map((q) => {
              const Icon = q.icon;
              return (
                <button
                  key={q.failureType}
                  onClick={() => !isLoading && runSuggestedQuery(q)}
                  disabled={isLoading}
                  className={`w-full text-left rounded-lg border p-3 transition-all ${q.bg} disabled:opacity-50`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`size-4 flex-shrink-0 mt-0.5 ${q.color}`} />
                    <div>
                      <p className={`text-xs font-semibold ${q.color}`}>{q.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {q.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Evidence Panel */}
        {lastReport && (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/10 flex items-center justify-between">
              <h3 className="font-semibold tracking-tight text-sm">Evidence</h3>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  lastReport.confidence >= 0.7
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                    : lastReport.confidence >= 0.4
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-600"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-600"
                }`}
              >
                {Math.round(lastReport.confidence * 100)}%
              </span>
            </div>
            <div className="p-3 space-y-2">
              {lastReport.findings.slice(0, 3).map((f: Finding, i: number) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${SEVERITY_CONFIG[f.severity] ?? "border-border bg-muted/20"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertCircle className="size-3 flex-shrink-0" />
                    <span className="text-xs font-medium line-clamp-1">{f.title}</span>
                  </div>
                  <p className="text-xs opacity-70 line-clamp-2">{f.description}</p>
                </div>
              ))}
              {lastReport.findings.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{lastReport.findings.length - 3} more findings in the analysis above
                </p>
              )}
            </div>
            <div className="px-3 pb-3">
              <a
                href={
                  SUGGESTED_QUERIES.find((q) => q.failureType === lastReport.failure_type)?.href ??
                  "/"
                }
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
              >
                View Full Report
                <ChevronRight className="size-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
