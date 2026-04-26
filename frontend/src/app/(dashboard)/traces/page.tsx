"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Eye,
  BrainCircuit,
  Wrench,
  ShieldAlert,
  ScanSearch,
  Loader2,
  Search,
  Clock,
  Cpu,
  Zap,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import {
  fetchAllSessions,
  fetchSession,
  analyzeSession,
  type SessionSummary,
  type AnalysisReport,
  type Finding,
} from "@/lib/api";
import { SessionContext } from "@/components/features/SessionContext";

// ── Helpers ────────────────────────────────────────────────────────────────

const FAILURE_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  memory: {
    label: "Memory",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    icon: BrainCircuit,
  },
  tool_misfire: {
    label: "Tool Misfire",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: Wrench,
  },
  hallucination: {
    label: "Hallucination",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    icon: ShieldAlert,
  },
  blind_spot: {
    label: "Blind Spot",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    icon: ScanSearch,
  },
};

const SEVERITY_CONFIG = {
  critical: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
  high: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
  medium: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
  low: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
};

function FailureBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-xs text-muted-foreground">—</span>;
  const cfg = FAILURE_TYPE_CONFIG[type];
  if (!cfg) return <span className="text-xs text-muted-foreground">{type}</span>;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="size-3" />
      {cfg.label}
    </span>
  );
}

function LatencyBar({ ms, maxMs }: { ms: number; maxMs: number }) {
  const pct = Math.max(4, Math.round((ms / Math.max(maxMs, 1)) * 100));
  const color =
    ms > 10000 ? "bg-rose-500" : ms > 3000 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{ms.toLocaleString()}ms</span>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "bg-emerald-500" : value >= 0.4 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function TracesPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [fullSession, setFullSession] = useState<object | null>(null);

  useEffect(() => {
    setLoadingSessions(true);
    fetchAllSessions()
      .then(setSessions)
      .catch((e) => setSessionsError(e.message))
      .finally(() => setLoadingSessions(false));
  }, []);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filterType !== "all" && s.failure_type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.session_id.toLowerCase().includes(q) &&
          !(s.failure_summary ?? "").toLowerCase().includes(q) &&
          !s.agent_id.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [sessions, filterType, search]);

  const handleSelect = (s: SessionSummary) => {
    setSelected(s);
    setReport(null);
    setFullSession(null);
    setAnalysisError(null);
    // Auto-fetch full session so prompt/response appear immediately
    fetchSession(s.session_id).then((data) => {
      if (data) setFullSession(data);
    }).catch(() => {});
  };

  const handleAnalyze = async () => {
    if (!selected) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    setReport(null);
    try {
      const data = await fetchSession(selected.session_id);
      if (!data) {
        setAnalysisError(
          "Session data not found in store. Run this session through a module page first to populate the store."
        );
        setAnalysisLoading(false);
        return;
      }
      setFullSession(data);
      const result = await analyzeSession(data);
      setReport(result);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const filterChips = [
    { key: "all", label: "All" },
    { key: "memory", label: "Memory" },
    { key: "tool_misfire", label: "Tool Misfire" },
    { key: "hallucination", label: "Hallucination" },
    { key: "blind_spot", label: "Blind Spot" },
  ];

  // Compute max latency for timeline bars
  const sessionAsAny = fullSession as Record<string, unknown> | null;
  const llmCalls = (sessionAsAny?.llm_calls as Record<string, unknown>[]) ?? [];
  const toolCalls = (sessionAsAny?.tool_calls as Record<string, unknown>[]) ?? [];
  const retrievalEvents = (sessionAsAny?.retrieval_events as Record<string, unknown>[]) ?? [];
  const allLatencies = [
    ...llmCalls.map((c) => Number(c.latency_ms ?? 0)),
    ...toolCalls.map((c) => Number(c.latency_ms ?? 0)),
  ];
  const maxLatency = Math.max(...allLatencies, 1);

  return (
    <div className="flex gap-6 h-[calc(100vh-5rem)] animate-in fade-in duration-500">
      {/* ── Left: Session List ─────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/10">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="size-4 text-primary" />
            <h2 className="font-semibold tracking-tight">Trace Explorer</h2>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search sessions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() => setFilterType(chip.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                  filterType === chip.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {loadingSessions ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" />
              <span className="text-sm">Loading sessions…</span>
            </div>
          ) : sessionsError ? (
            <div className="p-4 text-sm text-destructive">{sessionsError}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground px-4">
              <Eye className="size-8 mb-2 opacity-30" />
              <p className="text-sm font-medium">No sessions found</p>
              <p className="text-xs mt-1">Pull traces from the dashboard to populate this list</p>
            </div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.session_id}
                onClick={() => handleSelect(s)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected?.session_id === s.session_id
                    ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs truncate text-foreground">
                    {s.session_id}
                  </span>
                  <FailureBadge type={s.failure_type} />
                </div>
                <div className="text-xs text-muted-foreground mb-1.5 line-clamp-2">
                  {s.failure_summary ?? s.agent_id}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{s.llm_calls} LLM</span>
                  <span>·</span>
                  <span>{s.tool_calls} tools</span>
                  <span>·</span>
                  <span>{s.retrieval_events} retrievals</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t bg-muted/10 text-xs text-muted-foreground text-center">
          {filtered.length} of {sessions.length} sessions
        </div>
      </div>

      {/* ── Right: Detail Panel ────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Eye className="size-8 opacity-40" />
            </div>
            <p className="font-medium text-foreground">Select a session to inspect</p>
            <p className="text-sm mt-1">Choose a trace from the list to view its execution details</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Session Header */}
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-muted/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Eye className="size-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-mono text-sm font-medium">{selected.session_id}</div>
                    <div className="text-xs text-muted-foreground">Agent: {selected.agent_id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <FailureBadge type={selected.failure_type} />
                  {selected.timestamp && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {new Date(selected.timestamp).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              {selected.failure_summary && (
                <div className="px-6 py-3 border-b bg-amber-500/5 border-amber-500/20">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {selected.failure_summary}
                  </p>
                </div>
              )}

              <div className="px-6 py-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: "LLM Calls", value: selected.llm_calls, icon: Cpu },
                    { label: "Tool Calls", value: selected.tool_calls, icon: Zap },
                    { label: "Retrievals", value: selected.retrieval_events, icon: ScanSearch },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-lg border bg-muted/20 p-4 text-center">
                      <Icon className="size-5 text-muted-foreground mx-auto mb-1" />
                      <div className="text-2xl font-bold">{value}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={analysisLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {analysisLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  {analysisLoading ? "Running Analysis…" : "Run Full Analysis"}
                </button>
              </div>
            </div>

            {analysisError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-destructive">
                {analysisError}
              </div>
            )}

            {/* Session Context — prompt, response, tool calls, retrievals */}
            {fullSession && (
              <SessionContext session={fullSession as Record<string, unknown>} />
            )}

            {/* Execution Timeline (from full session data) */}
            {fullSession && (llmCalls.length > 0 || toolCalls.length > 0 || retrievalEvents.length > 0) && (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/10">
                  <h3 className="font-semibold tracking-tight">Execution Timeline</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Step-by-step trace with latency and status
                  </p>
                </div>
                <div className="p-6">
                  <div className="relative border-l border-muted ml-3 space-y-6">
                    {retrievalEvents.map((ev, i) => {
                      const scores = (ev.relevance_scores as number[]) ?? [];
                      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                      return (
                        <div key={`ret-${i}`} className="relative pl-6">
                          <div className="absolute -left-[9px] top-1 size-4 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                            <ScanSearch className="size-2.5 text-blue-600" />
                          </div>
                          <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                                Retrieval Event
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {ev.chunks_returned as number} chunks
                              </span>
                            </div>
                            <p className="text-sm font-medium mb-2 line-clamp-2">{ev.query as string}</p>
                            <div className="flex items-center gap-4">
                              <div>
                                <span className="text-xs text-muted-foreground">Avg relevance</span>
                                <ScoreBar value={avg} />
                              </div>
                              {(ev.chunks_returned as number) === 0 && (
                                <span className="text-xs font-medium text-rose-600 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                                  No results
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {llmCalls.map((call, i) => (
                      <div key={`llm-${i}`} className="relative pl-6">
                        <div className="absolute -left-[9px] top-1 size-4 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                          <Cpu className="size-2.5 text-primary" />
                        </div>
                        <div className="rounded-lg border bg-card p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              LLM Call
                            </span>
                            <div className="flex items-center gap-2">
                              {Boolean(call.hallucination_flag) && (
                                <span className="text-xs font-medium text-rose-600 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                                  Hallucination ⚠
                                </span>
                              )}
                              <span className="text-xs font-mono text-muted-foreground">
                                {call.model as string}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {call.prompt as string}
                          </p>
                          <div className="flex items-center gap-6">
                            <LatencyBar ms={Number(call.latency_ms ?? 0)} maxMs={maxLatency} />
                            <span className="text-xs text-muted-foreground">
                              {call.tokens_in as number}↑ / {call.tokens_out as number}↓ tokens
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {toolCalls.map((call, i) => {
                      const status = call.status as string;
                      const statusIcon =
                        status === "success" ? (
                          <CheckCircle className="size-3 text-emerald-500" />
                        ) : status === "timeout" ? (
                          <Clock className="size-3 text-amber-500" />
                        ) : (
                          <XCircle className="size-3 text-rose-500" />
                        );
                      const borderColor =
                        status === "success"
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : status === "timeout"
                          ? "border-amber-500/20 bg-amber-500/5"
                          : "border-rose-500/20 bg-rose-500/5";
                      return (
                        <div key={`tool-${i}`} className="relative pl-6">
                          <div className="absolute -left-[9px] top-1 size-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                            <Zap className="size-2.5 text-amber-600" />
                          </div>
                          <div className={`rounded-lg border p-4 ${borderColor}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                {statusIcon}
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  Tool Call
                                </span>
                              </div>
                              <span className="font-mono text-xs">{call.tool_name as string}</span>
                            </div>
                            {Boolean(call.error) && (
                              <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
                                {call.error as string}
                              </p>
                            )}
                            <LatencyBar ms={Number(call.latency_ms ?? 0)} maxMs={maxLatency} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Report */}
            {report && (
              <>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b bg-muted/10 flex items-center justify-between">
                    <h3 className="font-semibold tracking-tight">Root Cause Analysis</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Confidence</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          report.confidence >= 0.7
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                            : report.confidence >= 0.4
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-600"
                            : "bg-rose-500/10 border-rose-500/20 text-rose-600"
                        }`}
                      >
                        {Math.round(report.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="px-6 py-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Summary
                      </p>
                      <p className="text-sm">{report.summary}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Root Cause
                      </p>
                      <p className="text-sm font-medium">{report.root_cause}</p>
                    </div>
                  </div>
                </div>

                {report.findings.length > 0 && (
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b bg-muted/10">
                      <h3 className="font-semibold tracking-tight">
                        Findings ({report.findings.length})
                      </h3>
                    </div>
                    <div className="p-4 space-y-3">
                      {report.findings.map((f: Finding, i: number) => (
                        <div
                          key={i}
                          className={`rounded-lg border p-4 ${SEVERITY_CONFIG[f.severity] ?? "border-border bg-muted/20 text-foreground"}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="size-4 flex-shrink-0" />
                              <span className="font-medium text-sm">{f.title}</span>
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                              {f.severity}
                            </span>
                          </div>
                          <p className="text-xs mb-2 opacity-80">{f.description}</p>
                          {f.recommendation && (
                            <p className="text-xs font-medium">→ {f.recommendation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
