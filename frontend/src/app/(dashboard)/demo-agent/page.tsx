"use client";

import React, { useEffect, useRef, useState } from "react";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";
import Link from "next/link";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";
import {
  BrainCircuit,
  Wrench,
  ShieldAlert,
  ScanSearch,
  Bot,
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Send,
  MessageSquare,
  Plus,
  Clock,
  SearchCode,
  AlertTriangle,
  ChevronUp,
} from "lucide-react";
import {
  runDemoScenario,
  sendDemoChat,
  listDemoSessions,
  getDemoMessages,
  fetchModelSettings,
  updateModelSetting,
  analyzeDemoChatSession,
  type DemoRunResult,
  type DemoChatMessage,
  type DemoSession,
  type DemoStoredMessage,
  type ModelOption,
  type AethenAnalysisReport,
  type AethenFinding,
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
// ---------------------------------------------------------------------------
// Aethen Analysis Card — inline diagnosis from the pipeline
// ---------------------------------------------------------------------------

const SEVERITY_STYLE: Record<string, string> = {
  critical: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
  high:     "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium:   "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  low:      "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const FAILURE_TYPE_STYLE: Record<string, string> = {
  memory:       "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  tool_misfire: "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20",
  hallucination:"text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
  blind_spot:   "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20",
  unknown:      "text-muted-foreground bg-muted border-border/50",
};

function AethenAnalysisCard({ report }: { report: AethenAnalysisReport }) {
  const [expanded, setExpanded] = useState(false);
  const typeStyle = FAILURE_TYPE_STYLE[report.failure_type] ?? FAILURE_TYPE_STYLE.unknown;
  const pct = Math.round(report.confidence * 100);

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <SearchCode className="size-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-primary">Aethen Diagnosis</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeStyle}`}>
            {report.failure_type.replace("_", " ")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{pct}% confidence</span>
          {expanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-primary/10 pt-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Root Cause</p>
            <p className="text-sm leading-relaxed">{report.root_cause || report.summary}</p>
          </div>
          {report.findings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Findings ({report.findings.length})
              </p>
              <div className="space-y-1.5">
                {report.findings.map((f: AethenFinding, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.low}`}>
                      {f.severity}
                    </span>
                    <p className="text-sm text-muted-foreground">{f.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat turn component (scenario runs)
// ---------------------------------------------------------------------------

function ChatTurn({ result, analyzing, analysisReport, analysisFailed, onAnalyze }: {
  result: DemoRunResult;
  analyzing?: boolean;
  analysisReport?: AethenAnalysisReport | null;
  analysisFailed?: boolean;
  onAnalyze?: () => void;
}) {
  const elapsed = useElapsedSeconds(analyzing ?? false);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    if (analyzing) durationRef.current = 0;
    else if (durationRef.current === 0 && elapsed > 0) durationRef.current = elapsed;
  }, [analyzing, elapsed]);

  const completedIn = !analyzing && (analysisReport || analysisFailed) ? durationRef.current : null;
  const scenario = SCENARIO_MAP[result.scenario];
  const Icon = scenario?.icon ?? Bot;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider ${scenario?.color ?? "text-muted-foreground"}`}>
          <Icon className="size-3.5" />
          {result.scenario_name}
        </span>
        {(result.langfuse_traced || result.langsmith_traced) && (
          <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            result.trace_destination === "langsmith"
              ? "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20"
              : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          }`}>
            <CheckCircle2 className="size-3" />
            {result.trace_destination === "langsmith" ? "Traced to LangSmith" : "Traced to Langfuse"}
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-base leading-relaxed shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {result.user_message}
        </div>
      </div>
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 size-7 rounded-full flex items-center justify-center border ${scenario?.bg.split(" ")[0] ?? "bg-muted"}`}>
          <Icon className={`size-3.5 ${scenario?.color ?? "text-muted-foreground"}`} />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 px-4 py-2.5 text-base leading-relaxed shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {result.assistant_response}
        </div>
      </div>
      {/* Analyze button — shown when trace exists but analysis not yet triggered */}
      {!analyzing && !analysisReport && !analysisFailed && onAnalyze && result.langfuse_traced && (
        <button
          onClick={onAnalyze}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <SearchCode className="size-3.5" />
          Analyze with Aethen
        </button>
      )}

      {analyzing && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-primary/20 bg-primary/5 text-sm text-primary">
          <Loader2 className="size-3.5 animate-spin shrink-0" />
          <span>Aethen is diagnosing… <span className="tabular-nums font-mono">{elapsed}s</span></span>
        </div>
      )}
      {!analyzing && analysisReport && (
        <div className="space-y-1">
          {completedIn != null && completedIn > 0 && (
            <p className="text-[10px] text-muted-foreground/60 px-1">Diagnosed in {completedIn}s</p>
          )}
          <AethenAnalysisCard report={analysisReport} />
        </div>
      )}
      {!analyzing && analysisFailed && (
        <p className="text-xs text-muted-foreground px-1">
          Analysis unavailable for this trace — check the{" "}
          <a href="/traces" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Trace Explorer
          </a>{" "}
          for more details.
        </p>
      )}
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
  trace_destination?: string;
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

  // Model selector state
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [activeModel, setActiveModel] = useState<string>("gpt-4o-mini");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);

  // Trace destination state
  const [traceDestination, setTraceDestination] = useState<"langfuse" | "langsmith">("langfuse");
  const [traceMenuOpen, setTraceMenuOpen] = useState(false);

  // End session & analyze state
  const [latestTraceId, setLatestTraceId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [chatAnalysisReport, setChatAnalysisReport] = useState<AethenAnalysisReport | null>(null);
  const [chatAnalysisFailed, setChatAnalysisFailed] = useState(false);
  const [chatAnalysisDuration, setChatAnalysisDuration] = useState<number | null>(null);
  const chatElapsed = useElapsedSeconds(analyzing);
  const chatAnalysisStartRef = useRef<number>(0);

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

  // Load demo model setting on mount
  useEffect(() => {
    fetchModelSettings().then((data) => {
      const demoRole = data.roles.find((r) => r.role === "demo");
      if (demoRole) {
        setActiveModel(demoRole.current_model);
        setModelOptions(demoRole.options);
      }
    }).catch(() => {});
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
    setLatestTraceId(null);
    setChatAnalysisReport(null);
    setChatAnalysisFailed(false);
    setChatAnalysisDuration(null);
    inputRef.current?.focus();
  };

  const handleSessionClick = async (session: DemoSession) => {
    if (session.id === activeSessionId) return;
    setActiveSessionId(session.id);
    setChatError(null);
    // Sync the destination selector to match the session's stored destination
    if (session.trace_destination && ["langfuse", "langsmith"].includes(session.trace_destination)) {
      setTraceDestination(session.trace_destination as "langfuse" | "langsmith");
    }
    try {
      const messages = await getDemoMessages(session.id);
      const turns: ChatTurnData[] = messages.map((m: DemoStoredMessage) => ({
        role: m.role,
        content: m.content,
        langfuse_traced: m.langfuse_traced,
        trace_destination: session.trace_destination,
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

  // Per-scenario analysis state: session_id → { analyzing, report, failed }
  const [scenarioAnalysis, setScenarioAnalysis] = useState<Record<string, { analyzing: boolean; report: AethenAnalysisReport | null; failed: boolean }>>({});

  const handleRun = async (scenarioKey: string) => {
    if (loading) return;
    setLoading(scenarioKey);
    setScenarioError(null);
    try {
      const result = await runDemoScenario(scenarioKey, traceDestination);
      setTurns((prev) => [...prev, result]);

      // Initialise analysis state so the Analyze button appears — user triggers manually
      if (result.langfuse_traced && result.session_id) {
        setScenarioAnalysis((prev) => ({
          ...prev,
          [result.session_id]: { analyzing: false, report: null, failed: false },
        }));
      }
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
      const result = await sendDemoChat(message, chatHistory, activeSessionId, traceDestination);

      // On first turn, store the new session_id returned by backend
      if (!activeSessionId) {
        setActiveSessionId(result.session_id);
      }

      // Track latest trace_id — enables "End Session & Analyze"
      if (result.langfuse_trace_id) {
        setLatestTraceId(result.langfuse_trace_id);
      }

      const newHistory: DemoChatMessage[] = [
        ...chatHistory,
        { role: "user", content: message },
        { role: "assistant", content: result.assistant_response },
      ];
      setChatHistory(newHistory);
      setChatTurns((prev) => [
        ...prev,
        { role: "assistant", content: result.assistant_response, langfuse_traced: result.langfuse_traced, trace_destination: result.trace_destination },
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

  const handleAnalyzeSession = async () => {
    if (!activeSessionId || analyzing) return;
    chatAnalysisStartRef.current = Date.now();
    setAnalyzing(true);
    setChatAnalysisReport(null);
    setChatAnalysisFailed(false);
    setChatAnalysisDuration(null);
    try {
      const report = await analyzeDemoChatSession(activeSessionId, latestTraceId);
      setChatAnalysisReport(report);
    } catch {
      setChatAnalysisFailed(true);
    } finally {
      setChatAnalysisDuration(Math.floor((Date.now() - chatAnalysisStartRef.current) / 1000));
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
            <Bot className="size-6" />
          </div>
          Demo Agent
        </h2>
        <p className="text-muted-foreground text-base">
          Generate real failure traces directly from the browser. Each scenario fires a live LLM call, sends the trace to{" "}
          {traceDestination === "langsmith" ? "LangSmith" : "Langfuse"}, and displays the response below.
        </p>
      </div>

      {/* Scenario buttons */}
      <FadeInStagger className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SCENARIOS.map((s) => {
          const Icon = s.icon;
          const isRunning = loading === s.key;
          return (
            <FadeInItem key={s.key}>
              <button
                onClick={() => handleRun(s.key)}
                disabled={!!loading}
                className={`relative w-full flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isRunning ? s.activeBg : s.bg
                }`}
              >
                <div className={`p-2 rounded-2xl border ${s.bg.split(" ")[0]} ${s.color}`}>
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
            </FadeInItem>
          );
        })}
      </FadeInStagger>

      {scenarioError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {scenarioError}
        </div>
      )}

      {/* Scenario trace log */}
      {turns.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/20 flex items-center justify-between">
            <h3 className="font-semibold tracking-tight flex items-center gap-2">
              <Bot className="size-4 text-muted-foreground" />
              Trace Log
            </h3>
            <span className="text-sm text-muted-foreground bg-muted px-2.5 py-1 rounded-xl border">
              {turns.length} scenario{turns.length !== 1 ? "s" : ""} run
            </span>
          </div>
          <div className="p-6 space-y-8">
            {turns.map((t, i) => (
              <div key={i}>
                {i > 0 && <hr className="border-border mb-8" />}
                <ChatTurn
                  result={t}
                  analyzing={scenarioAnalysis[t.session_id]?.analyzing}
                  analysisReport={scenarioAnalysis[t.session_id]?.report}
                  analysisFailed={scenarioAnalysis[t.session_id]?.failed}
                  onAnalyze={() => {
                    const sid = t.session_id;
                    const traceId = t.langfuse_trace_id;
                    setScenarioAnalysis((prev) => ({ ...prev, [sid]: { analyzing: true, report: null, failed: false } }));
                    analyzeDemoChatSession(sid, traceId)
                      .then((report) => setScenarioAnalysis((prev) => ({ ...prev, [sid]: { analyzing: false, report, failed: false } })))
                      .catch(() => setScenarioAnalysis((prev) => ({ ...prev, [sid]: { analyzing: false, report: null, failed: true } })));
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Free-form Chat with session panel ───────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Session list panel */}
        <div className="xl:col-span-3 flex flex-col rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden h-[520px]">
          <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              Past Chats
            </span>
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-xl border bg-background hover:bg-muted transition-colors"
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
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-all duration-150 ${
                    activeSessionId === s.id
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className={`text-sm font-medium truncate ${activeSessionId === s.id ? "text-primary" : ""}`}>
                      {s.title}
                    </p>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                      s.trace_destination === "langsmith" ? "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20" :
                      s.trace_destination === "both"      ? "text-primary bg-primary/10 border-primary/20" :
                      "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
                    }`}>
                      {s.trace_destination === "langsmith" ? "LS" : s.trace_destination === "both" ? "Both" : "LF"}
                    </span>
                  </div>
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
        <div className="xl:col-span-9 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col h-[520px]">
          <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-2 flex-wrap">
            <MessageSquare className="size-4 text-muted-foreground shrink-0" />
            <h3 className="font-semibold tracking-tight">Free-form Chat</h3>
            {activeSessionId && (
              <span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[120px]">
                {activeSessionId}
              </span>
            )}

            {/* Trace destination selector */}
            <div className="relative ml-auto">
              <button
                onClick={() => setTraceMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-background hover:bg-muted/50 transition-colors text-xs font-medium"
              >
                <span className={`size-2 rounded-full shrink-0 ${traceDestination === "langsmith" ? "bg-orange-500" : "bg-indigo-500"}`} />
                <span>{traceDestination === "langsmith" ? "LangSmith" : "Langfuse"}</span>
                <ChevronDown className={`size-3 text-muted-foreground transition-transform ${traceMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {traceMenuOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 w-44 rounded-xl border bg-card shadow-xl overflow-hidden">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b">
                    Send traces to
                  </div>
                  {[
                    { key: "langfuse" as const,  label: "Langfuse",  dot: "bg-indigo-500" },
                    { key: "langsmith" as const, label: "LangSmith", dot: "bg-orange-500" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setTraceDestination(opt.key); setTraceMenuOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors border-b last:border-0 ${traceDestination === opt.key ? "bg-primary/5" : ""}`}
                    >
                      <span className={`size-2 rounded-full shrink-0 ${opt.dot}`} />
                      <span className="font-medium">{opt.label}</span>
                      {traceDestination === opt.key && <CheckCircle2 className="size-3 text-primary ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setModelOpen((v) => !v)}
                disabled={modelSaving}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-background hover:bg-muted/50 transition-colors text-xs font-medium disabled:opacity-50"
              >
                <Bot className="size-3 text-muted-foreground" />
                <span className="max-w-[120px] truncate">{activeModel}</span>
                {modelSaving ? <Loader2 className="size-3 animate-spin" /> : <ChevronDown className={`size-3 text-muted-foreground transition-transform ${modelOpen ? "rotate-180" : ""}`} />}
              </button>
              {modelOpen && modelOptions.length > 0 && (
                <div className="absolute z-50 top-full mt-1 right-0 w-64 rounded-xl border bg-card shadow-xl overflow-hidden">
                  {(["openai", "anthropic"] as const).map((prov) => {
                    const provModels = modelOptions.filter((o) => o.provider === prov);
                    if (!provModels.length) return null;
                    const provLabel = prov === "openai" ? "OpenAI" : "Anthropic";
                    const provColor = prov === "openai" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20";
                    return (
                      <div key={prov}>
                        <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${provColor} border-b`}>
                          {provLabel}
                        </div>
                        {provModels.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={async () => {
                              setModelOpen(false);
                              if (opt.id === activeModel) return;
                              setModelSaving(true);
                              try {
                                await updateModelSetting("demo", opt.id);
                                setActiveModel(opt.id);
                              } finally {
                                setModelSaving(false);
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors border-b last:border-0 ${opt.id === activeModel ? "bg-primary/5" : ""}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{opt.label}</p>
                              <p className="text-muted-foreground truncate">{opt.description}</p>
                            </div>
                            {opt.id === activeModel && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
              traceDestination === "langsmith" ? "text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20" :
              "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            }`}>
              {traceDestination === "langsmith" ? "LangSmith traced" : "Langfuse traced"}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatTurns.length === 0 ? (
              <p className="text-base text-muted-foreground text-center py-8">
                {activeSessionId
                  ? "No messages in this session yet."
                  : `Type a message below to start a conversation. Every turn is traced to ${
                      traceDestination === "langsmith" ? "LangSmith" : "Langfuse"
                    }.`}
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
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${
                      t.role === "user"
                        ? "rounded-tr-sm bg-primary text-primary-foreground text-base leading-relaxed"
                        : "rounded-tl-sm border bg-muted/40"
                    }`}
                  >
                    {t.role === "user" ? t.content : renderContent(t.content)}
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

            {/* Aethen inline analysis — shown after "Analyze" */}
            {chatAnalysisReport && (
              <div className="px-4 pb-4 space-y-1">
                {chatAnalysisDuration != null && chatAnalysisDuration > 0 && (
                  <p className="text-[10px] text-muted-foreground/60">Diagnosed in {chatAnalysisDuration}s</p>
                )}
                <AethenAnalysisCard report={chatAnalysisReport} />
              </div>
            )}
            {chatAnalysisFailed && !chatAnalysisReport && (
              <div className="px-4 pb-3">
                <p className="text-xs text-muted-foreground">
                  Analysis unavailable for this trace — check the{" "}
                  <a href="/traces" className="underline underline-offset-2 hover:text-foreground transition-colors">
                    Trace Explorer
                  </a>{" "}
                  for more details.
                </p>
              </div>
            )}
          </div>

          {/* Input */}
          {chatError && (
            <div className="mx-6 mb-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {chatError}
            </div>
          )}
          <div className="p-4 border-t bg-muted/10 flex gap-2">
            {/* End Session & Analyze — production pattern: analyze at session end */}
            {(activeSessionId && latestTraceId) && (
              <button
                onClick={handleAnalyzeSession}
                disabled={analyzing || chatLoading}
                title="Analyze this session with Aethen"
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border border-primary/30 text-primary text-sm font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 shrink-0"
              >
                {analyzing
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <SearchCode className="size-3.5" />}
                {analyzing
                  ? <span>Diagnosing… <span className="tabular-nums font-mono">{chatElapsed}s</span></span>
                  : chatAnalysisReport ? "Re-analyze" : "Analyze"}
              </button>
            )}
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
              placeholder="Type a message…"
              disabled={chatLoading}
              className="flex-1 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 px-4 py-2.5 text-base shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
            />
            <button
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {chatLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Workflow hint */}
      {(turns.length > 0 || chatTurns.length > 0) && (
        <div className="rounded-2xl border bg-muted/20 px-5 py-4 text-base text-muted-foreground flex items-start gap-3">
          <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
          <span>
            Traces sent to{" "}
            {traceDestination === "langsmith" ? "LangSmith" : "Langfuse"}.
            {" "}Go to the{" "}
            <Link href="/overview" className="font-medium text-foreground underline underline-offset-2">
              Dashboard
            </Link>{" "}
            → click <strong>Pull Traces</strong> → then open a module page to run the full analysis.
          </span>
        </div>
      )}
    </div>
  );
}
