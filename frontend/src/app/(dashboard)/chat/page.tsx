"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare,
  BrainCircuit,
  Wrench,
  ShieldAlert,
  ScanSearch,
  Send,
  Loader2,
  Zap,
  ChevronDown,
  AlertCircle,
  ChevronRight,
  Copy,
  Check,
  Plus,
  Clock,
  CheckCircle2,
  Cpu,
  Trash2,
  Search,
  Sparkles,
} from "lucide-react";
import {
  sendFreeformQuery,
  analyzeSession,
  buildMemorySession,
  buildToolMisfireSession,
  buildHallucinationSession,
  buildBlindSpotSession,
  fetchSessionsByType,
  createChatSession,
  listChatSessions,
  loadChatSession,
  appendChatMessage,
  renameChatSession,
  fetchModelSettings,
  type AnalysisReport,
  type Finding,
  type ChatHistoryMessage,
  type ChatSessionSummary,
  type ChatMessageRecord,
  type ModelOption,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

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
  model?: string;
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

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <code className="block bg-background/80 border rounded-lg px-3 py-2 text-xs font-mono my-2 overflow-x-auto">{children}</code>
            : <code className="bg-background/80 border rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
        },
        pre: ({ children }) => <pre className="my-2">{children}</pre>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h3: ({ children }) => <h3 className="font-semibold text-sm mt-3 mb-1">{children}</h3>,
        h4: ({ children }) => <h4 className="font-semibold text-sm mt-2 mb-1">{children}</h4>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-2">{children}</blockquote>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
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
    <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 overflow-hidden mt-2">
      <div className="px-4 py-3 border-b bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showTypeBadge && (
            <span className={`text-sm font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>
              {report.failure_type.replace(/_/g, " ")}
            </span>
          )}
          {showConfidence && (
            <span
              className={`text-sm font-bold px-2 py-0.5 rounded-full border ${
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
          <p className="text-base">{report.summary}</p>
        )}
        {report.root_cause && (
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Root Cause</p>
            <p className="text-base font-medium">{report.root_cause}</p>
          </div>
        )}
        {report.findings.slice(0, 10).map((f: Finding, i: number) => (
          <div
            key={i}
            className={`rounded-2xl border p-3 ${SEVERITY_CONFIG[f.severity] ?? "border-border bg-muted/20"}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle className="size-3 flex-shrink-0" />
              <span className="text-sm font-medium">{f.title}</span>
            </div>
            <p className="text-sm opacity-80">{f.description}</p>
            {f.recommendation && (
              <p className="text-sm font-medium mt-1">→ {f.recommendation}</p>
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
    href: "/traces?type=memory",
  },
  {
    icon: Wrench,
    title: "Diagnose Tool Call Error",
    description: "Which tool calls failed and what caused the cascading errors?",
    failureType: "tool_misfire",
    builder: buildToolMisfireSession,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10",
    href: "/traces?type=tool_misfire",
  },
  {
    icon: ShieldAlert,
    title: "Trace Hallucination to Root Cause",
    description: "What caused the agent to fabricate a claim not supported by sources?",
    failureType: "hallucination",
    builder: buildHallucinationSession,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10",
    href: "/traces?type=hallucination",
  },
  {
    icon: ScanSearch,
    title: "Discover Knowledge Gaps",
    description: "What topics does the agent consistently fail on due to missing docs?",
    failureType: "blind_spot",
    builder: buildBlindSpotSession,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10",
    href: "/traces?type=blind_spot",
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
  const [selectedModel, setSelectedModel] = useState<string>("claude-sonnet-4-6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [lastReport, setLastReport] = useState<AnalysisReport | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Live elapsed timer ───────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    if (isLoading) {
      setTimeout(() => setElapsed(0), 0);
      intervalId = setInterval(() => {
        setElapsed((p) => p + 100);
      }, 100);
      timerRef.current = intervalId;
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
    fetchModelSettings().then((data) => {
      const synthesisRole = data.roles.find((r) => r.role === "synthesis");
      if (synthesisRole) {
        setModelOptions(synthesisRole.options);
        setSelectedModel(synthesisRole.current_model);
      }
    }).catch(() => {});
  }, []);

  // Close model dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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

     
    const userEntry: ChatEntry = {  
        id: crypto.randomUUID(), kind: "user", content: text };
    addEntry(userEntry);
    saveMessage(sessionId, userEntry);
    setInput("");
    setIsLoading(true);
    const t0 = performance.now();

    try {
      const report = await sendFreeformQuery(text, history, selectedModel || undefined);
      const latency_ms = Math.round(performance.now() - t0);
      setLastReport(report);
      const analysisEntry: ChatEntry = {
        id: crypto.randomUUID(), kind: "analysis", content: report.summary ?? "", report, latency_ms,
        model: selectedModel,
      };
      addEntry(analysisEntry);
      saveMessage(sessionId, analysisEntry);
      refreshSessionList();
    } catch (e) {
       
      const latency_ms = Math.round(Date.now() - t0);
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

    // Try to fetch a real session of this failure type first; fall back to synthetic
    let traceSession: ReturnType<typeof query.builder>;
    try {
      const realSessions = await fetchSessionsByType(query.failureType);
      if (realSessions.length > 0) {
        traceSession = realSessions[0] as ReturnType<typeof query.builder>;
      } else {
        const traceSessionId = `chat-${query.failureType}-${crypto.randomUUID().slice(0, 8)}`;
        traceSession = query.builder(traceSessionId);
      }
    } catch {
      const traceSessionId = `chat-${query.failureType}-${crypto.randomUUID().slice(0, 8)}`;
      traceSession = query.builder(traceSessionId);
    }

     
    const userEntry: ChatEntry = {  
        id: crypto.randomUUID(), kind: "user", content: query.description };
    addEntry(userEntry);
    saveMessage(chatSessionId, userEntry);
    setIsLoading(true);
    // eslint-disable-next-line
    const t0 = Date.now();

    try {
      const report = await analyzeSession(traceSession);
      // eslint-disable-next-line
      const latency_ms = Math.round(Date.now() - t0);
      setLastReport(report);
       
      const analysisEntry: ChatEntry = {  
        id: crypto.randomUUID(), kind: "analysis", content: report.summary ?? "", report, latency_ms };
      addEntry(analysisEntry);
      saveMessage(chatSessionId, analysisEntry);
      refreshSessionList();
    } catch (e) {
      // eslint-disable-next-line
      const latency_ms = Math.round(Date.now() - t0);
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

  const handleEditSubmit = async (msgId: string) => {
    if (!editText.trim() || isLoading) return;
    // Truncate messages up to (not including) this user message, then resend
    const idx = messages.findIndex(m => m.id === msgId);
    const trimmed = messages.slice(0, idx);
    setMessages(trimmed);
    setEditingId(null);
    await sendFreeform(editText.trim());
  };

  const handleClearChat = () => {
    setMessages([]);
    setLastReport(null);
    setCurrentSessionId(null);
    isFirstMessageRef.current = true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) sendFreeform(input.trim());
    }
  };

  const filtered = sessions.filter(s =>
    !sessionSearch || s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
              <MessageSquare className="size-6" />
            </div>
            Chat Debug
          </h2>
          <p className="text-muted-foreground text-base">
            Freeform diagnostic queries powered by the LangGraph pipeline.
          </p>
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100vh-15rem)]">

      {/* ── Sessions Panel ────────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 flex flex-col rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        {/* Header */}
        <div className="px-3 py-3 border-b bg-muted/10 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={handleClearChat} title="Clear current chat"
                className="size-6 rounded-xl flex items-center justify-center hover:bg-rose-500/10 transition-colors text-muted-foreground hover:text-rose-500">
                <Trash2 className="size-3.5" />
              </button>
            )}
            <button onClick={handleNewChat} title="New chat"
              className="size-6 rounded-xl flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 py-1.5 border-b bg-muted/5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <input type="text" placeholder="Search…" value={sessionSearch}
              onChange={e => setSessionSearch(e.target.value)}
              className="w-full pl-6 pr-2 py-1 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-1.5">
          {currentSessionId === null && messages.length > 0 && (
            <div className="px-2.5 py-2 mb-1 rounded-md border border-primary/50 bg-primary/5 ring-1 ring-primary/20 text-xs font-medium text-primary truncate">
              Current session
            </div>
          )}
          {loadingSessions && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingSessions && filtered.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-6 px-2">
              {sessionSearch ? "No sessions match" : "Start typing to begin"}
            </p>
          )}
          <FadeInStagger key={sessions.length} className="flex flex-col gap-1">
            {filtered.map((s) => (
              <FadeInItem key={s.id}>
                <button
                  onClick={() => handleSelectSession(s.id)}
                  className={`group w-full text-left p-2.5 rounded-md border transition-all duration-150 ${
                    s.id === currentSessionId
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-muted/40"
                  }`}
                >
                  {/* Row 1 — title */}
                  <p className={`text-[11px] font-medium truncate leading-tight mb-1 ${
                    s.id === currentSessionId ? "text-primary" : "text-foreground"
                  }`}>
                    {s.title}
                  </p>
                  {/* Row 2 — message count · relative time */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MessageSquare className="size-2.5" />
                      <span>{s.message_count} msg{s.message_count !== 1 ? "s" : ""}</span>
                    </div>
                    {(s.updated_at || s.created_at) && (
                      <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
                        {formatRelativeTime(s.updated_at ?? s.created_at)}
                      </span>
                    )}
                  </div>
                </button>
              </FadeInItem>
            ))}
          </FadeInStagger>
        </div>

        {/* Footer count */}
        <div className="px-3 py-2 border-t bg-muted/10 text-[10px] text-muted-foreground text-center">
          {filtered.length} session{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Chat Interface ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-3">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="size-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold tracking-tight text-sm">Conversation</h3>
            <p className="text-xs text-muted-foreground">
              Ask about agent failures or run a structured analysis
            </p>
          </div>
        </div>

        {/* Message history */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <MessageSquare className="size-7 opacity-40" />
              </div>
              <p className="font-medium text-foreground">Start a debugging session</p>
              <p className="text-base mt-1 max-w-xs">
                Ask anything about your agent failures — all responses are grounded in your real trace data via the LangGraph pipeline.
              </p>
            </div>
          )}

          <FadeInStagger key={currentSessionId ?? "new"} className="flex flex-col gap-4" stagger={0.45} delay={0.1}>
          {messages.map((msg) => {
            if (msg.kind === "user") {
              const isEditing = editingId === msg.id;
              return (
                <FadeInItem key={msg.id} slow>
                <div className="flex justify-end group">
                  <div className="max-w-[80%] flex flex-col items-end gap-1">
                    {isEditing ? (
                      <div className="w-full space-y-1.5">
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSubmit(msg.id); } if (e.key === "Escape") setEditingId(null); }}
                          className="w-full rounded-2xl rounded-tr-sm px-4 py-3 bg-primary/10 border border-primary/40 text-base resize-none focus:outline-none focus:ring-1 focus:ring-primary/60"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setEditingId(null)} className="text-xs px-2.5 py-1 rounded-lg border hover:bg-muted transition-colors text-muted-foreground">Cancel</button>
                          <button onClick={() => handleEditSubmit(msg.id)} className="text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Resend</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-2xl rounded-tr-sm px-4 py-3 bg-primary text-primary-foreground text-base cursor-text" style={{ userSelect: "text" }}>
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border hover:bg-muted transition-colors">
                            Edit
                          </button>
                          <CopyButton text={msg.content} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                </FadeInItem>
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
                <FadeInItem key={msg.id} slow>
                <div className="flex justify-start group">
                  <div className="max-w-[90%]">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <MessageSquare className="size-3 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">Aethen</span>
                      {!isPlainText && (
                        <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ LangGraph Pipeline
                        </span>
                      )}
                      {msg.latency_ms != null && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-xl">
                          {msg.latency_ms >= 1000 ? `${(msg.latency_ms / 1000).toFixed(1)}s` : `${msg.latency_ms}ms`}
                          {msg.model && ` · ${msg.model}`}
                        </span>
                      )}
                      <CopyButton text={copyText} />
                    </div>
                    {isPlainText ? (
                      <div
                        className="rounded-2xl rounded-tl-sm px-4 py-3 border bg-muted/30 text-base leading-relaxed cursor-text"
                        style={{ userSelect: "text" }}
                      >
                        <MarkdownContent text={msg.report.summary} />
                      </div>
                    ) : (
                      <AnalysisCard report={msg.report} />
                    )}
                  </div>
                </div>
                </FadeInItem>
              );
            }
            return (
              <FadeInItem key={msg.id} slow>
              <div className="flex justify-start group">
                <div className="max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="size-3 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Aethen</span>
                    {msg.latency_ms != null && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-xl">
                        {msg.latency_ms >= 1000 ? `${(msg.latency_ms / 1000).toFixed(1)}s` : `${msg.latency_ms}ms`}
                        {msg.model && ` · ${msg.model}`}
                      </span>
                    )}
                    <CopyButton text={msg.content} />
                  </div>
                  <div
                    className="rounded-2xl rounded-tl-sm px-4 py-3 border bg-muted/30 text-base leading-relaxed cursor-text"
                    style={{ userSelect: "text" }}
                  >
                    <MarkdownContent text={msg.content} />
                  </div>
                </div>
              </div>
              </FadeInItem>
            );
          })}
          </FadeInStagger>

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 border bg-muted/30">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <div className="size-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums font-medium">
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
          <div className="flex items-end gap-2 rounded-2xl border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-primary/40">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask about your agent failures…"
              className="flex-1 resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground max-h-32 overflow-y-auto py-1"
              style={{ minHeight: "24px" }}
            />
            <button
              onClick={() => input.trim() && !isLoading && sendFreeform(input.trim())}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 size-8 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <p className="text-[10px] text-muted-foreground">
              AI-generated analysis. Verify before acting on any diagnosis.
            </p>
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setModelOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-background hover:bg-muted/50 transition-colors text-xs font-medium"
              >
                <Cpu className="size-3 text-muted-foreground" />
                <span className="max-w-[120px] truncate">{modelOptions.find(o => o.id === selectedModel)?.label ?? selectedModel}</span>
                <ChevronDown className={`size-3 text-muted-foreground transition-transform ${modelOpen ? "rotate-180" : ""}`} />
              </button>
              {modelOpen && modelOptions.length > 0 && (
                <div className="absolute z-50 bottom-full mb-1 right-0 w-64 rounded-xl border bg-card shadow-xl overflow-hidden">
                  {(["anthropic", "openai"] as const).map((prov) => {
                    const provModels = modelOptions.filter((o) => o.provider === prov);
                    if (!provModels.length) return null;
                    const provLabel = prov === "openai" ? "OpenAI" : "Anthropic";
                    const provColor = prov === "openai"
                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      : "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20";
                    return (
                      <div key={prov}>
                        <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${provColor} border-b`}>
                          {provLabel}
                        </div>
                        {provModels.map((opt) => (
                          <button key={opt.id}
                            onClick={() => { setSelectedModel(opt.id); setModelOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors border-b last:border-0 ${opt.id === selectedModel ? "bg-primary/5" : ""}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{opt.label}</p>
                              <p className="text-muted-foreground truncate">{opt.description}</p>
                            </div>
                            {opt.id === selectedModel && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Suggested Queries + Evidence ───────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4">
        {/* Structured Analysis shortcuts */}
        <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/10">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="font-semibold tracking-tight text-sm">Structured Analysis</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              One click → full LangGraph pipeline on a synthetic trace
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
                  className={`w-full text-left rounded-2xl border p-3 transition-all ${q.bg} disabled:opacity-50`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`size-4 flex-shrink-0 mt-0.5 ${q.color}`} />
                    <div>
                      <p className={`text-sm font-semibold ${q.color}`}>{q.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                        {q.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      </div>{/* end flex row */}
    </div>
  );
}
