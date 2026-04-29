"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Wrench,
  ShieldAlert,
  ScanSearch,
  Bot,
  Loader2,
  CheckCircle2,
  ChevronRight,
  Send,
  MessageSquare,
  Plus,
  Clock,
} from "lucide-react";
import {
  runDemoScenario,
  sendDemoChat,
  listDemoSessions,
  getDemoMessages,
  type DemoRunResult,
  type DemoChatMessage,
  type DemoSession,
  type DemoStoredMessage,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Scenario button config
// ---------------------------------------------------------------------------

const SCENARIOS = [
  {
    key: "memory",
    label: "Memory Debug",
    description: "Retrieval returns wrong documents",
    icon: BrainCircuit,
    color: "text-blue-500",
    bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 hover:border-blue-500/40",
    activeBg: "bg-blue-500/20 border-blue-500/50 ring-1 ring-blue-500/30",
  },
  {
    key: "tool_misfire",
    label: "Tool Misfire",
    description: "Tool call hits a PermissionError",
    icon: Wrench,
    color: "text-amber-500",
    bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40",
    activeBg: "bg-amber-500/20 border-amber-500/50 ring-1 ring-amber-500/30",
  },
  {
    key: "hallucination",
    label: "Hallucination",
    description: "LLM generates an unsupported claim",
    icon: ShieldAlert,
    color: "text-rose-500",
    bg: "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 hover:border-rose-500/40",
    activeBg: "bg-rose-500/20 border-rose-500/50 ring-1 ring-rose-500/30",
  },
  {
    key: "blind_spot",
    label: "Blind Spot",
    description: "Knowledge base returns 0 results",
    icon: ScanSearch,
    color: "text-purple-500",
    bg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20 hover:border-purple-500/40",
    activeBg: "bg-purple-500/20 border-purple-500/50 ring-1 ring-purple-500/30",
  },
];

const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map((s) => [s.key, s]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function renderContent(text: string) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {paragraphs.map((para, i) => {
        const lines = para.split("\n").filter(Boolean);
        const isBullet = lines.length > 0 && lines.every(l => /^[-*•]\s/.test(l));
        const isNumbered = lines.length > 0 && lines.every(l => /^\d+\.\s/.test(l));
        if (isBullet) {
          return (
            <ul key={i} className="list-disc list-inside space-y-1 pl-1">
              {lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^[-*•]\s/, ""))}</li>)}
            </ul>
          );
        }
        if (isNumbered) {
          return (
            <ol key={i} className="list-decimal list-inside space-y-1 pl-1">
              {lines.map((l, j) => <li key={j}>{renderInline(l.replace(/^\d+\.\s/, ""))}</li>)}
            </ol>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>{renderInline(l)}{j < lines.length - 1 && <br />}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function formatRelativeTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Chat turn component (scenario runs)
// ---------------------------------------------------------------------------

function ChatTurn({ result }: { result: DemoRunResult }) {
  const scenario = SCENARIO_MAP[result.scenario];
  const Icon = scenario?.icon ?? Bot;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider ${scenario?.color ?? "text-muted-foreground"}`}>
          <Icon className="size-3.5" />
          {result.scenario_name}
        </span>
        {result.langfuse_traced && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="size-3" />
            Traced to Langfuse
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-base leading-relaxed shadow-md">
          {result.user_message}
        </div>
      </div>
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 size-7 rounded-full flex items-center justify-center border ${scenario?.bg.split(" ")[0] ?? "bg-muted"}`}>
          <Icon className={`size-3.5 ${scenario?.color ?? "text-muted-foreground"}`} />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm border bg-card px-4 py-2.5 text-base leading-relaxed shadow-md">
          {result.assistant_response}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface ChatTurnData {
  role: "user" | "assistant";
  content: string;
  langfuse_traced?: boolean;
}

export default function DemoAgentPage() {
  // Scenario state
  const [loading, setLoading] = useState<string | null>(null);
  const [turns, setTurns] = useState<DemoRunResult[]>([]);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  // Free-form chat state
  const [chatHistory, setChatHistory] = useState<DemoChatMessage[]>([]);
  const [chatTurns, setChatTurns] = useState<ChatTurnData[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Session list state
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns, chatLoading]);

  // Load session list on mount
  useEffect(() => {
    listDemoSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  const refreshSessions = () => {
    listDemoSessions().then(setSessions).catch(() => {});
  };

  const handleNewConversation = () => {
    setActiveSessionId(null);
    setChatTurns([]);
    setChatHistory([]);
    setChatInput("");
    setChatError(null);
    inputRef.current?.focus();
  };

  const handleSessionClick = async (session: DemoSession) => {
    if (session.id === activeSessionId) return;
    setActiveSessionId(session.id);
    setChatError(null);
    try {
      const messages = await getDemoMessages(session.id);
      const turns: ChatTurnData[] = messages.map((m: DemoStoredMessage) => ({
        role: m.role,
        content: m.content,
        langfuse_traced: m.langfuse_traced,
      }));
      setChatTurns(turns);
      // Rebuild history for LLM context
      setChatHistory(
        messages.map((m: DemoStoredMessage) => ({ role: m.role, content: m.content }))
      );
    } catch {
      setChatError("Failed to load session messages.");
    }
  };

  const handleRun = async (scenarioKey: string) => {
    if (loading) return;
    setLoading(scenarioKey);
    setScenarioError(null);
    try {
      const result = await runDemoScenario(scenarioKey);
      setTurns((prev) => [...prev, result]);
    } catch (e) {
      setScenarioError(e instanceof Error ? e.message : "Scenario failed");
    } finally {
      setLoading(null);
    }
  };

  const handleChatSend = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    setChatInput("");
    setChatError(null);

    setChatTurns((prev) => [...prev, { role: "user", content: message }]);
    setChatLoading(true);

    try {
      const result = await sendDemoChat(message, chatHistory, activeSessionId);

      // On first turn, store the new session_id returned by backend
      if (!activeSessionId) {
        setActiveSessionId(result.session_id);
      }

      const newHistory: DemoChatMessage[] = [
        ...chatHistory,
        { role: "user", content: message },
        { role: "assistant", content: result.assistant_response },
      ];
      setChatHistory(newHistory);
      setChatTurns((prev) => [
        ...prev,
        { role: "assistant", content: result.assistant_response, langfuse_traced: result.langfuse_traced },
      ]);

      // Refresh session list to reflect new/updated session
      refreshSessions();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Chat failed");
      setChatTurns((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
            <Bot className="size-6" />
          </div>
          Demo Agent
        </h2>
        <p className="text-muted-foreground text-base">
          Generate real failure traces directly from the browser. Each scenario fires a live LLM call, sends the trace to Langfuse, and displays the response below.
        </p>
      </div>

      {/* Scenario buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SCENARIOS.map((s) => {
          const Icon = s.icon;
          const isRunning = loading === s.key;
          return (
            <button
              key={s.key}
              onClick={() => handleRun(s.key)}
              disabled={!!loading}
              className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isRunning ? s.activeBg : s.bg
              }`}
            >
              <div className={`p-2 rounded-xl border ${s.bg.split(" ")[0]} ${s.color}`}>
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icon className="size-4" />
                )}
              </div>
              <div>
                <p className={`text-base font-semibold ${s.color}`}>{s.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>
              </div>
              {!loading && (
                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
              )}
            </button>
          );
        })}
      </div>

      {scenarioError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {scenarioError}
        </div>
      )}

      {/* Scenario trace log */}
      {turns.length > 0 && (
        <div className="rounded-xl border bg-card shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/20 flex items-center justify-between">
            <h3 className="font-semibold tracking-tight flex items-center gap-2">
              <Bot className="size-4 text-muted-foreground" />
              Trace Log
            </h3>
            <span className="text-sm text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border">
              {turns.length} scenario{turns.length !== 1 ? "s" : ""} run
            </span>
          </div>
          <div className="p-6 space-y-8">
            {turns.map((t, i) => (
              <div key={i}>
                {i > 0 && <hr className="border-border mb-8" />}
                <ChatTurn result={t} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Free-form Chat with session panel ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Session list panel */}
        <div className="xl:col-span-3 flex flex-col rounded-xl border bg-card shadow-md overflow-hidden h-[520px]">
          <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              Past Chats
            </span>
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border bg-background hover:bg-muted transition-colors"
            >
              <Plus className="size-3" />
              New
            </button>
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1">
            {sessionsLoading ? (
              <div className="flex items-center justify-center h-20 text-muted-foreground">
                <Loader2 className="size-4 animate-spin mr-2" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-2">
                No demo chats yet. Start a conversation below.
              </p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSessionClick(s)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-all duration-150 ${
                    activeSessionId === s.id
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${activeSessionId === s.id ? "text-primary" : ""}`}>
                    {s.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                    <Clock className="size-2.5" />
                    <span>{formatRelativeTime(s.updated_at)}</span>
                    <span>·</span>
                    <span>{s.message_count} msgs</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="xl:col-span-9 rounded-xl border bg-card shadow-md overflow-hidden flex flex-col h-[520px]">
          <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            <h3 className="font-semibold tracking-tight">Free-form Chat</h3>
            {activeSessionId && (
              <span className="ml-2 text-[10px] font-mono text-muted-foreground/60 truncate max-w-[180px]">
                {activeSessionId}
              </span>
            )}
            <span className="ml-auto text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Langfuse traced
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatTurns.length === 0 ? (
              <p className="text-base text-muted-foreground text-center py-8">
                {activeSessionId
                  ? "No messages in this session yet."
                  : "Type a message below to start a conversation. Every turn is traced to Langfuse."}
              </p>
            ) : (
              chatTurns.map((t, i) => (
                <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "items-start gap-2.5"}`}>
                  {t.role === "assistant" && (
                    <div className="shrink-0 size-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Bot className="size-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-md ${
                      t.role === "user"
                        ? "rounded-tr-sm bg-primary text-primary-foreground text-base leading-relaxed"
                        : "rounded-tl-sm border bg-muted/40"
                    }`}
                  >
                    {t.role === "user" ? t.content : renderContent(t.content)}
                    {t.role === "assistant" && t.langfuse_traced && (
                      <span className="flex items-center gap-1 mt-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" /> Traced to Langfuse
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 size-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Bot className="size-3.5 text-primary" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border bg-muted/40 px-4 py-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {chatError && (
            <div className="mx-6 mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {chatError}
            </div>
          )}
          <div className="p-4 border-t bg-muted/10 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
              placeholder="Type a message…"
              disabled={chatLoading}
              className="flex-1 rounded-xl border bg-card px-4 py-2.5 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
            />
            <button
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {chatLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Workflow hint */}
      {(turns.length > 0 || chatTurns.length > 0) && (
        <div className="rounded-xl border bg-muted/20 px-5 py-4 text-base text-muted-foreground flex items-start gap-3">
          <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
          <span>
            Traces sent to Langfuse. Go to the{" "}
            <a href="/" className="font-medium text-foreground underline underline-offset-2">
              Dashboard
            </a>{" "}
            → click <strong>Pull Langfuse</strong> → then open a module page to run the full analysis.
          </span>
        </div>
      )}
    </div>
  );
}
