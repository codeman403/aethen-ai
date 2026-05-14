"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";
import Link from "next/link";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";
import { AethenLogo } from "@/components/ui/logo";
import { createClient } from "@/lib/supabase/client";
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
  Trash2,
  X,
  LayoutDashboard,
  LogIn,
} from "lucide-react";
import {
  runDemoScenario,
  sendDemoChat,
  listDemoSessions,
  getDemoMessages,
  deleteDemoSession,
  fetchModelSettings,
  updateModelSetting,
  analyzeDemoChatSession,
  analyzeDirectly,
  type DemoRunResult,
  type DemoChatMessage,
  type DemoSession,
  type DemoStoredMessage,
  type ModelOption,
  type AethenAnalysisReport,
  type AethenFinding,
} from "@/lib/api";

const MAX_PUBLIC_MESSAGES = 10;

// ---------------------------------------------------------------------------
// Terminal analysis animation
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  { id: "init",     text: "Initializing Aethen diagnostic pipeline",    ms: 200  },
  { id: "connect",  text: "Connecting to data sources",                  ms: 600  },
  { id: "classify", text: "Classifying failure type",                    ms: 1400 },
  { id: "graph",    text: "Querying causal graph [Neo4j]",               ms: 2800 },
  { id: "vector",   text: "Retrieving semantic evidence [pgvector]",     ms: 4200 },
  { id: "rerank",   text: "Reranking evidence [Cohere Rerank v3]",       ms: 5800 },
  { id: "module",   text: "Running analysis module",                     ms: 7200 },
  { id: "synth",    text: "Synthesizing root cause & findings",          ms: 8800 },
  { id: "done",     text: "Pipeline complete",                           ms: 99999 },
];

// ── Analysis loading — same style as ScenarioLoading ─────────────────────────
// ── Shared floating bottom-up step text ───────────────────────────────────────
function FloatingStepText({ steps, elapsedMs }: {
  steps: { id: string; text: string; ms: number }[];
  elapsedMs: number;
}) {
  const visible = steps.filter(s => elapsedMs >= s.ms && s.id !== "done");
  const shown   = visible.slice(-3); // keep last 3

  return (
    <div className="flex flex-col gap-1 min-h-[52px] justify-end overflow-hidden">
      {shown.map((step, i) => {
        const isActive = i === shown.length - 1;
        return (
          <motion.p
            key={step.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: isActive ? 1 : 0.28, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="text-xs font-mono leading-snug"
            style={{
              color: isActive ? "#4ade80" : "hsl(var(--muted-foreground))",
              textShadow: isActive ? "0 0 12px rgba(74,222,128,0.7), 0 0 24px rgba(74,222,128,0.35)" : "none",
            }}
          >
            <span className="mr-1.5 opacity-60">{isActive ? "▶" : "✓"}</span>
            {step.text}{isActive ? "…" : ""}
          </motion.p>
        );
      })}
    </div>
  );
}

function AnalysisLoading({ elapsed }: { elapsed: number }) {
  return (
    <div className="flex items-start gap-3">
      <div className="size-7 rounded-full bg-muted border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="size-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 py-1">
        <FloatingStepText steps={PIPELINE_STEPS} elapsedMs={elapsed * 1000} />
      </div>
    </div>
  );
}

// Steps shown when no failure pattern is detected (early exit path)
const EARLY_EXIT_STEPS = [
  { id: "init",     text: "Initializing Aethen diagnostic pipeline",    ms: 200  },
  { id: "connect",  text: "Connecting to data sources",                  ms: 600  },
  { id: "classify", text: "Classifying failure type",                    ms: 1400 },
];

function TerminalAnalysis({ analyzing, elapsed, failureType, completedIn, earlyExit }: {
  analyzing: boolean;
  elapsed: number;
  failureType?: string;
  completedIn?: number | null;
  earlyExit?: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingIdx, setTypingIdx] = useState(0);
  const [typedChars, setTypedChars] = useState(0);

  // Reset when analysis starts
  useEffect(() => {
    if (!analyzing) return;
    setVisibleCount(0);
    setTypingIdx(0);
    setTypedChars(0);
  }, [analyzing]);

  // Reveal steps progressively based on elapsed time
  useEffect(() => {
    if (!analyzing) return;
    const steps = earlyExit ? EARLY_EXIT_STEPS : PIPELINE_STEPS;
    const now = elapsed * 1000;
    let count = 0;
    for (const step of steps) {
      if (now >= step.ms) count++;
      else break;
    }
    setVisibleCount(Math.min(count, steps.length - 1));
  }, [elapsed, analyzing, earlyExit]);

  // Typewriter on the latest visible step
  useEffect(() => {
    if (!analyzing) return;
    if (visibleCount === typingIdx) {
      setTypedChars(0);
    } else {
      setTypingIdx(visibleCount);
      setTypedChars(0);
    }
  }, [visibleCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const step = PIPELINE_STEPS[typingIdx];
    if (!step || !analyzing) return;
    if (typedChars >= step.text.length) return;
    const t = setTimeout(() => setTypedChars(c => c + 1), 18);
    return () => clearTimeout(t);
  }, [typedChars, typingIdx, analyzing]);

  const activeSteps = earlyExit ? EARLY_EXIT_STEPS : PIPELINE_STEPS;
  const shownSteps = analyzing
    ? activeSteps.slice(0, visibleCount + 1)
    : earlyExit
      ? EARLY_EXIT_STEPS
      : [...PIPELINE_STEPS.slice(0, PIPELINE_STEPS.length - 1), { ...PIPELINE_STEPS[PIPELINE_STEPS.length - 1], text: "Pipeline complete" }];

  const moduleLabel = failureType && failureType !== "unknown"
    ? ({ memory: "Memory Retrieval", tool_misfire: "Tool Misfire", hallucination: "Hallucination RCA", blind_spot: "Blind Spot" } as Record<string,string>)[failureType] ?? failureType
    : "Multi-Signal Diagnostic";

  return (
    <div className="rounded-2xl overflow-hidden border border-[#30363d] shadow-xl">
      {/* Terminal title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="flex-1 text-center text-[11px] font-mono text-[#7d8590]">aethen — diagnostic pipeline</span>
        {!analyzing && completedIn != null && completedIn > 0 && (
          <span className="text-[10px] font-mono text-[#3fb950]">{completedIn}s</span>
        )}
      </div>

      {/* Terminal body */}
      <div className="bg-[#0d1117] px-4 py-4 font-mono text-sm space-y-1 min-h-[180px]">
        {shownSteps.map((step, i) => {
          const isDone = !analyzing;
          const isLast = i === shownSteps.length - 1;
          const isComplete = !analyzing || !isLast;
          const text = step.id === "module"
            ? step.text.replace("analysis module", `${moduleLabel} module`)
            : step.text;
          const displayed = isLast && analyzing ? text.slice(0, typedChars) : text;

          return (
            <div key={step.id} className="flex items-start gap-2">
              <span className={`shrink-0 mt-px text-xs ${isComplete ? "text-[#3fb950]" : "text-[#58a6ff]"}`}>
                {isComplete ? "✓" : "▶"}
              </span>
              <span className={`${isComplete ? "text-[#e6edf3]" : "text-[#58a6ff]"}`}>
                {displayed}
                {isLast && analyzing && (
                  <span className="animate-pulse text-[#58a6ff]">█</span>
                )}
              </span>
            </div>
          );
        })}

        {/* Show final status line when complete */}
        {!analyzing && (
          <div className="mt-2 pt-2 border-t border-[#30363d] space-y-1">
            {earlyExit ? (
              <>
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-px text-xs text-[#f0883e]">→</span>
                  <span className="text-[#f0883e]">No failure pattern detected — early exit</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-px text-xs text-[#7d8590]">ℹ</span>
                  <span className="text-[#7d8590] text-xs">
                    Try asking the agent to perform a task that triggers a failure (e.g. search, query, or tool call).
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-px text-xs text-[#3fb950]">✓</span>
                <span className="text-[#3fb950] font-semibold">
                  Analysis complete{completedIn != null && completedIn > 0 ? ` in ${completedIn}s` : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Blinking prompt when still running */}
        {analyzing && (
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[#3fb950]">$</span>
            <span className="animate-pulse text-[#3fb950]">█</span>
          </div>
        )}
      </div>
    </div>
  );
}

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
    userMessage: "I can't reset my billing password. The retrieval system returned wrong documents about API keys instead of billing procedures.",
  },
  {
    key: "tool_misfire",
    label: "Tool Misfire",
    description: "Tool call hits a PermissionError",
    icon: Wrench,
    color: "text-amber-500",
    bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40",
    activeBg: "bg-amber-500/20 border-amber-500/50 ring-1 ring-amber-500/30",
    userMessage: "Please update my user profile. The update_user_record tool returned a PermissionError: insufficient privileges.",
  },
  {
    key: "hallucination",
    label: "Hallucination",
    description: "LLM generates an unsupported claim",
    icon: ShieldAlert,
    color: "text-rose-500",
    bg: "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 hover:border-rose-500/40",
    activeBg: "bg-rose-500/20 border-rose-500/50 ring-1 ring-rose-500/30",
    userMessage: "Explain how quantum encryption works for password resets.",
  },
  {
    key: "blind_spot",
    label: "Blind Spot",
    description: "Knowledge base returns 0 results",
    icon: ScanSearch,
    color: "text-purple-500",
    bg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20 hover:border-purple-500/40",
    activeBg: "bg-purple-500/20 border-purple-500/50 ring-1 ring-purple-500/30",
    userMessage: "How do I configure the experimental Zephyr module?",
  },
];

const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map((s) => [s.key, s]));

// ---------------------------------------------------------------------------
// Scenario loading animation — shown while the LLM generates the response
// ---------------------------------------------------------------------------

// Timed steps for the scenario run (no ms field — use index × duration)
const SCENARIO_RUN_STEPS = [
  { id: "route",    text: "Routing to inference endpoint",     ms: 0    },
  { id: "process",  text: "Agent processing your message",     ms: 1000 },
  { id: "tools",    text: "Resolving tool calls",              ms: 2400 },
  { id: "generate", text: "Generating response",               ms: 3800 },
  { id: "trace",    text: "Logging trace to Langfuse",         ms: 5400 },
];

function ScenarioLoading({ scenarioKey }: { scenarioKey: string }) {
  const scenario = SCENARIO_MAP[scenarioKey];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/20 flex items-center justify-between">
        <h3 className="font-semibold tracking-tight flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground" />
          Trace Log
        </h3>
        <span className="text-sm text-muted-foreground bg-muted px-2.5 py-1 rounded-xl border flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin" />
          Generating
        </span>
      </div>

      <div className="p-6 space-y-4">
        {/* User message — text-base to match ChatTurn */}
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-base leading-relaxed shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            {scenario?.userMessage ?? "Running scenario…"}
          </div>
        </div>

        {/* Floating bottom-up step text */}
        <div className="flex items-start gap-3">
          <div className="size-7 rounded-full bg-muted border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="size-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1 py-1">
            <FloatingStepText steps={SCENARIO_RUN_STEPS} elapsedMs={elapsed * 1000} />
          </div>
        </div>
      </div>
    </div>
  );
}

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
// Aethen Analysis Card
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
              <div className="space-y-3">
                {report.findings.map((f: AethenFinding, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.low}`}>
                      {f.severity}
                    </span>
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm text-muted-foreground">{f.title}</p>
                      {f.recommendation && (
                        <div className="flex items-start gap-1.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-2.5 py-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">Fix</span>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">{f.recommendation}</p>
                        </div>
                      )}
                    </div>
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
// Scenario chat turn
// ---------------------------------------------------------------------------

function ChatTurn({ result, analyzing, analysisReport, analysisFailed, onAnalyze, showTraceBadge }: {
  result: DemoRunResult;
  analyzing?: boolean;
  analysisReport?: AethenAnalysisReport | null;
  analysisFailed?: boolean;
  onAnalyze?: () => void;
  showTraceBadge?: boolean;
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
        {showTraceBadge && (result.langfuse_traced || result.langsmith_traced) && (
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
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-2.5 text-base leading-relaxed">
          {result.assistant_response}
        </div>
      </div>
      {!analyzing && !analysisReport && !analysisFailed && onAnalyze && (
        <button
          onClick={onAnalyze}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <SearchCode className="size-3.5" />
          Analyze with Aethen
        </button>
      )}
      {(analyzing || (analysisReport && !analysisFailed)) && (
        <div className="space-y-3">
          {analyzing && <AnalysisLoading elapsed={elapsed} />}
          {!analyzing && analysisReport && analysisReport.failure_type !== "unknown" && (
            <AethenAnalysisCard report={analysisReport} />
          )}
        </div>
      )}
      {!analyzing && analysisFailed && (
        <p className="text-xs text-muted-foreground px-1">
          Analysis unavailable — the pipeline returned no result. Try again.
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
  // Auth state — detected client-side
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = loading

  // Disable browser scroll restoration and force top before first paint
  useLayoutEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });
  }, []);

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

  // Session list state (authenticated only)
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Model + trace state (authenticated only)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [activeModel, setActiveModel] = useState<string>("gpt-4o-mini");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [traceDestination, setTraceDestination] = useState<"langfuse" | "langsmith">("langfuse");
  const [traceMenuOpen, setTraceMenuOpen] = useState(false);

  // End session & analyze
  const [latestTraceId, setLatestTraceId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [chatAnalysisReport, setChatAnalysisReport] = useState<AethenAnalysisReport | null>(null);
  const [chatAnalysisFailed, setChatAnalysisFailed] = useState(false);
  const [chatAnalysisDuration, setChatAnalysisDuration] = useState<number | null>(null);
  const chatElapsed = useElapsedSeconds(analyzing);
  const chatAnalysisStartRef = useRef<number>(0);

  const [scenarioAnalysis, setScenarioAnalysis] = useState<Record<string, { analyzing: boolean; report: AethenAnalysisReport | null; failed: boolean }>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Public message counter — user messages sent this session
  const publicMessageCount = chatHistory.filter(m => m.role === "user").length;
  const publicLimitReached = !isAuthenticated && publicMessageCount >= MAX_PUBLIC_MESSAGES;

  useEffect(() => {
    if (chatTurns.length === 0 && !chatLoading) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatTurns, chatLoading]);

  // Load session list and model settings for authenticated users only
  useEffect(() => {
    if (!isAuthenticated) return;
    setSessionsLoading(true);
    listDemoSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
    fetchModelSettings().then((data) => {
      const demoRole = data.roles.find((r) => r.role === "demo");
      if (demoRole) {
        setActiveModel(demoRole.current_model);
        setModelOptions(demoRole.options);
      }
      if ((data.available_providers ?? []).length === 0) {
        setModelOptions([]);
      }
    }).catch(() => {});
  }, [isAuthenticated]);

  const refreshSessions = () => {
    if (!isAuthenticated) return;
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

  const handleClearChat = () => {
    setChatTurns([]);
    setChatHistory([]);
    setActiveSessionId(null);
    setChatError(null);
    setLatestTraceId(null);
    setChatAnalysisReport(null);
    setChatAnalysisFailed(false);
    setChatAnalysisDuration(null);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await deleteDemoSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) handleNewConversation();
    } catch { /* silently ignore */ }
  };

  const handleSessionClick = async (session: DemoSession) => {
    if (session.id === activeSessionId) return;
    setActiveSessionId(session.id);
    setChatError(null);
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
      setChatHistory(messages.map((m: DemoStoredMessage) => ({ role: m.role, content: m.content })));
    } catch {
      setChatError("Failed to load session messages.");
    }
  };

  const handleRun = async (scenarioKey: string) => {
    if (loading) return;
    setLoading(scenarioKey);
    setScenarioError(null);
    try {
      const result = await runDemoScenario(scenarioKey, traceDestination);
      setTurns((prev) => [...prev, result]);
      // Always init analysis state so the Analyze button appears for every scenario
      setScenarioAnalysis((prev) => ({
        ...prev,
        [result.session_id]: { analyzing: false, report: null, failed: false },
      }));
    } catch (e) {
      setScenarioError(e instanceof Error ? e.message : "Scenario failed");
    } finally {
      setLoading(null);
    }
  };

  const handleChatSend = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading || publicLimitReached) return;
    setChatInput("");
    setChatError(null);

    setChatTurns((prev) => [...prev, { role: "user", content: message }]);
    setChatLoading(true);

    try {
      const result = await sendDemoChat(message, chatHistory, activeSessionId, traceDestination);
      if (!activeSessionId) setActiveSessionId(result.session_id);
      if (result.langfuse_trace_id) setLatestTraceId(result.langfuse_trace_id);

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
    if (analyzing) return;
    chatAnalysisStartRef.current = Date.now();
    setAnalyzing(true);
    setChatAnalysisReport(null);
    setChatAnalysisFailed(false);
    setChatAnalysisDuration(null);
    try {
      let report: AethenAnalysisReport;
      if (isAuthenticated && activeSessionId && latestTraceId) {
        // Authenticated: use Langfuse trace
        report = await analyzeDemoChatSession(activeSessionId, latestTraceId);
      } else {
        // Public: use last user/assistant turn directly
        const lastUser = [...chatTurns].reverse().find(t => t.role === "user");
        const lastAssistant = [...chatTurns].reverse().find(t => t.role === "assistant");
        if (!lastUser || !lastAssistant) throw new Error("Not enough messages");
        report = await analyzeDirectly("unknown", lastUser.content, lastAssistant.content);
      }
      setChatAnalysisReport(report);
    } catch {
      setChatAnalysisFailed(true);
    } finally {
      setChatAnalysisDuration(Math.floor((Date.now() - chatAnalysisStartRef.current) / 1000));
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top navbar */}
      <nav className="sticky top-0 z-30 h-14 border-b border-border/30 bg-background/80 backdrop-blur-xl flex items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <AethenLogo size={24} />
          <span className="font-bold tracking-tight bg-gradient-to-r from-[#6D28D9] to-[#059669] bg-clip-text text-transparent">
            Aethen AI
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {isAuthenticated === null ? null : isAuthenticated ? (
            <Link
              href="/overview"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border hover:bg-muted/60 transition-colors"
            >
              <LayoutDashboard className="size-3.5" />
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login?next=/demo-agent"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <LogIn className="size-3.5" />
              Sign In
            </Link>
          )}
        </div>
      </nav>

      {/* Page content */}
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
                <Bot className="size-6" />
              </div>
              Demo Agent
            </h2>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase border border-amber-400/40 bg-amber-400/10 text-amber-600">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Simulated · Not a real agent
            </span>
          </div>
          <p className="text-muted-foreground text-base">
            Generate real failure traces directly from the browser. Each scenario fires a live LLM call and displays the response below.
            {!isAuthenticated && (
              <span className="ml-1 text-muted-foreground/70">
                <Link href="/login?next=/demo-agent" className="text-primary hover:underline">Sign in</Link> to save conversations and run full analysis.
              </span>
            )}
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

        {/* Scenario loading animation — shown while awaiting LLM response */}
        {loading && <ScenarioLoading scenarioKey={loading} />}

        {/* Scenario trace log */}
        {turns.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
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
                    showTraceBadge={!!isAuthenticated}
                    onAnalyze={() => {
                      const sid = t.session_id;
                      setScenarioAnalysis((prev) => ({ ...prev, [sid]: { analyzing: true, report: null, failed: false } }));
                      // Always use analyzeDirectly for demo scenarios — it runs the pipeline
                      // directly on the scenario data without needing a Langfuse trace.
                      analyzeDirectly(t.scenario, t.user_message, t.assistant_response)
                        .then((report) => setScenarioAnalysis((prev) => ({ ...prev, [sid]: { analyzing: false, report, failed: false } })))
                        .catch(() => setScenarioAnalysis((prev) => ({ ...prev, [sid]: { analyzing: false, report: null, failed: true } })));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Free-form chat */}
        <div className={`grid grid-cols-1 gap-4 ${isAuthenticated ? "xl:grid-cols-12" : ""}`}>
          {/* Session list — authenticated only */}
          {isAuthenticated && (
            <div className="xl:col-span-3 flex flex-col rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden h-[520px]">
              <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <MessageSquare className="size-3.5 text-muted-foreground" />
                  Past Chats
                </span>
                <div className="flex items-center gap-1">
                  {chatTurns.length > 0 && (
                    <button onClick={handleClearChat} title="Clear current chat"
                      className="size-6 rounded-xl flex items-center justify-center hover:bg-rose-500/10 transition-colors text-muted-foreground hover:text-rose-500">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                  <button onClick={handleNewConversation} title="New chat"
                    className="size-6 rounded-xl flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Plus className="size-3.5" />
                  </button>
                </div>
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
                  <FadeInStagger key={sessions.length} className="flex flex-col gap-1">
                    {sessions.map((s) => (
                      <FadeInItem key={s.id}>
                        <div className={`group relative rounded-xl border transition-all duration-150 ${
                          activeSessionId === s.id
                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                            : "border-transparent hover:border-border hover:bg-muted/40"
                        }`}>
                          <button onClick={() => handleSessionClick(s)} className="w-full text-left px-3 py-2 pr-8">
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
                          <button
                            onClick={(e) => handleDeleteSession(e, s.id)}
                            title="Delete session"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground transition-all"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </FadeInItem>
                    ))}
                  </FadeInStagger>
                )}
              </div>
            </div>
          )}

          {/* Chat panel */}
          <div className={`${isAuthenticated ? "xl:col-span-9" : ""} rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col h-[520px]`}>
            <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-2 flex-wrap">
              <MessageSquare className="size-4 text-muted-foreground shrink-0" />
              <h3 className="font-semibold tracking-tight">Free-form Chat</h3>

              {/* Public message counter */}
              {!isAuthenticated && (
                <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${
                  publicMessageCount >= MAX_PUBLIC_MESSAGES
                    ? "text-rose-500 bg-rose-500/10 border-rose-500/20"
                    : publicMessageCount >= MAX_PUBLIC_MESSAGES * 0.7
                    ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                    : "text-muted-foreground bg-muted border-border/50"
                }`}>
                  {publicMessageCount}/{MAX_PUBLIC_MESSAGES} messages
                </span>
              )}

              {/* Trace + model selectors — authenticated only */}
              {isAuthenticated && (
                <>
                  <div className="relative ml-auto">
                    <button
                      onClick={() => setTraceMenuOpen((v) => !v)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-background hover:bg-muted/50 transition-colors text-xs font-medium"
                    >
                      <span className="text-muted-foreground">Trace →</span>
                      <span className={`size-2 rounded-full shrink-0 ${traceDestination === "langsmith" ? "bg-orange-500" : "bg-indigo-500"}`} />
                      <span>{traceDestination === "langsmith" ? "LangSmith" : "Langfuse"}</span>
                      <ChevronDown className={`size-3 text-muted-foreground transition-transform ${traceMenuOpen ? "rotate-180" : ""}`} />
                    </button>
                    {traceMenuOpen && (
                      <div className="absolute z-50 top-full mt-1 right-0 w-52 rounded-xl border bg-card shadow-xl overflow-hidden">
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
                  {modelOptions.length === 0 && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/8 border border-amber-500/20 px-2 py-1 rounded-lg">
                      <a href="/settings/integrations" className="underline">Configure LLM Keys</a> to select models
                    </span>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setModelOpen((v) => !v)}
                      disabled={modelSaving || modelOptions.length === 0}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-background hover:bg-muted/50 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                </>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatTurns.length === 0 ? (
                <p className="text-base text-muted-foreground text-center py-8">
                  {isAuthenticated
                    ? `Type a message below to start a conversation. Every turn is traced to ${traceDestination === "langsmith" ? "LangSmith" : "Langfuse"}.`
                    : "Ask any question to explore Aethen's AI debugging capabilities."}
                </p>
              ) : (
                chatTurns.map((t, i) => (
                  <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "items-start gap-2.5"}`}>
                    {t.role === "assistant" && (
                      <div className="shrink-0 size-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Bot className="size-3.5 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${
                      t.role === "user"
                        ? "rounded-tr-sm bg-primary text-primary-foreground text-base leading-relaxed"
                        : "rounded-tl-sm border bg-muted/40"
                    }`}>
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
              {(analyzing || chatAnalysisReport) && (
                <div className="px-4 pb-4 space-y-3">
                  <TerminalAnalysis
                    analyzing={analyzing}
                    elapsed={chatElapsed}
                    failureType={chatAnalysisReport?.failure_type}
                    completedIn={chatAnalysisDuration}
                    earlyExit={!analyzing && chatAnalysisReport?.failure_type === "unknown" && chatAnalysisReport?.confidence === 0}
                  />
                  {!analyzing && chatAnalysisReport && chatAnalysisReport.failure_type !== "unknown" && (
                    <AethenAnalysisCard report={chatAnalysisReport} />
                  )}
                </div>
              )}
              {chatAnalysisFailed && !chatAnalysisReport && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-muted-foreground">
                    Analysis unavailable — connect Langfuse in{" "}
                    <Link href="/settings/integrations" className="underline underline-offset-2 hover:text-foreground transition-colors">
                      Integrations
                    </Link>.
                  </p>
                </div>
              )}
            </div>

            {/* Public limit reached banner */}
            {publicLimitReached && (
              <div className="mx-4 mb-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">
                  You&apos;ve used all {MAX_PUBLIC_MESSAGES} demo messages.
                </p>
                <Link
                  href="/login?next=/demo-agent"
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                >
                  Sign in to continue →
                </Link>
              </div>
            )}

            {/* Chat error */}
            {chatError && !publicLimitReached && (
              <div className="mx-6 mb-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {chatError}
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t bg-muted/10 flex gap-2">
              {chatTurns.length >= 2 && !chatLoading && (
                <button
                  onClick={handleAnalyzeSession}
                  disabled={analyzing}
                  title="Analyze this conversation with Aethen"
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
                placeholder={publicLimitReached ? "Message limit reached — sign in to continue" : "Type a message…"}
                disabled={chatLoading || publicLimitReached}
                className="flex-1 rounded-2xl border border-border/50 bg-card px-4 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim() || publicLimitReached}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {chatLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Workflow hint — authenticated only */}
        {isAuthenticated && (turns.length > 0 || chatTurns.length > 0) && (
          <div className="rounded-2xl border bg-muted/20 px-5 py-4 text-base text-muted-foreground flex items-start gap-3">
            <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>
              Traces sent to {traceDestination === "langsmith" ? "LangSmith" : "Langfuse"}.{" "}
              Go to the{" "}
              <Link href="/overview" className="font-medium text-foreground underline underline-offset-2">Dashboard</Link>{" "}
              → click <strong>Pull Traces</strong> → then open a module page to run the full analysis.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
