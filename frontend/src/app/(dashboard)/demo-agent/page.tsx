"use client";

import { useRef, useState } from "react";
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
} from "lucide-react";
import {
  runDemoScenario,
  sendDemoChat,
  type DemoRunResult,
  type DemoChatMessage,
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
// Chat message component
// ---------------------------------------------------------------------------

function ChatTurn({ result }: { result: DemoRunResult }) {
  const scenario = SCENARIO_MAP[result.scenario];
  const Icon = scenario?.icon ?? Bot;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-400">
      {/* Scenario label + trace badge */}
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

      {/* User bubble */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-base leading-relaxed shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
          {result.user_message}
        </div>
      </div>

      {/* Assistant bubble */}
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 size-7 rounded-full flex items-center justify-center border ${scenario?.bg.split(" ")[0] ?? "bg-muted"}`}>
          <Icon className={`size-3.5 ${scenario?.color ?? "text-muted-foreground"}`} />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm border bg-card px-4 py-2.5 text-base leading-relaxed shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
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
  const inputRef = useRef<HTMLInputElement>(null);

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

    // Optimistically add user bubble
    setChatTurns((prev) => [...prev, { role: "user", content: message }]);

    setChatLoading(true);
    try {
      const result = await sendDemoChat(message, chatHistory);
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
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Chat failed");
      // Remove the optimistic user bubble on error
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

      {/* Scenario error */}
      {scenarioError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {scenarioError}
        </div>
      )}

      {/* Chat log */}
      {turns.length > 0 ? (
        <div className="rounded-xl border bg-card shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
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
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/10 p-12 text-center">
          <Bot className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-base font-medium text-muted-foreground">No traces yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Click a scenario button above to generate your first trace.
          </p>
        </div>
      )}

      {/* ── Free-form Chat ────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h3 className="font-semibold tracking-tight">Free-form Chat</h3>
          <span className="ml-auto text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            Langfuse traced
          </span>
        </div>

        {/* Messages */}
        <div className="p-6 space-y-4 min-h-[180px] max-h-[420px] overflow-y-auto">
          {chatTurns.length === 0 ? (
            <p className="text-base text-muted-foreground text-center py-8">
              Type a message below to start a conversation. Every turn is traced to Langfuse.
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
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-base leading-relaxed shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ${
                    t.role === "user"
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm border bg-muted/40"
                  }`}
                >
                  {t.content}
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
            className="flex-1 rounded-xl border bg-card px-4 py-2.5 text-base shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
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
