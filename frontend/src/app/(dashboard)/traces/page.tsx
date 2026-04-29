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
  AlertCircle,
  ChevronRight,
  Target,
  FileText,
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

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const FAILURE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  memory:       { label: "Memory",       color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",   icon: BrainCircuit },
  tool_misfire: { label: "Tool Misfire", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: Wrench },
  hallucination:{ label: "Hallucination",color: "text-rose-600 dark:text-rose-400",   bg: "bg-rose-500/10 border-rose-500/20",   icon: ShieldAlert },
  blind_spot:   { label: "Blind Spot",   color: "text-purple-600 dark:text-purple-400",bg:"bg-purple-500/10 border-purple-500/20",icon: ScanSearch },
};

function FailureBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-xs text-muted-foreground">—</span>;
  const cfg = FAILURE_TYPE_CONFIG[type];
  if (!cfg) return <span className="text-xs text-muted-foreground">{type}</span>;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="size-3" />{cfg.label}
    </span>
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
  const [dateFilter, setDateFilter] = useState<string>("");

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [fullSession, setFullSession] = useState<object | null>(null);

  useEffect(() => {
    fetchAllSessions()
      .then(setSessions)
      .catch((e) => setSessionsError(e.message))
      .finally(() => setLoadingSessions(false));
  }, []);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filterType !== "all" && s.failure_type !== filterType) return false;
      if (dateFilter && s.timestamp) {
        if (new Date(s.timestamp).toISOString().slice(0, 10) !== dateFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.session_id.toLowerCase().includes(q) &&
          !(s.failure_summary ?? "").toLowerCase().includes(q) &&
          !s.agent_id.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [sessions, filterType, search, dateFilter]);

  const handleSelect = (s: SessionSummary) => {
    setSelected(s);
    setReport(null);
    setFullSession(null);
    setAnalysisError(null);
    fetchSession(s.session_id).then((data) => { if (data) setFullSession(data); }).catch(() => {});
  };

  const handleAnalyze = async () => {
    if (!selected) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    setReport(null);
    try {
      const data = await fetchSession(selected.session_id);
      if (!data) { setAnalysisError("Session data not found."); return; }
      setFullSession(data);
      setReport(await analyzeSession(data));
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const filterChips = [
    { key: "all",           label: "All" },
    { key: "memory",        label: "Memory" },
    { key: "tool_misfire",  label: "Tool Misfire" },
    { key: "hallucination", label: "Hallucination" },
    { key: "blind_spot",    label: "Blind Spot" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
            <Eye className="size-6" />
          </div>
          Trace Explorer
        </h2>
        <p className="text-muted-foreground text-sm">
          Browse all agent sessions, filter by type or date, and run full diagnostic analysis.
        </p>
      </div>

      {sessionsError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sessionsError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

        {/* ── Left: Session List ─────────────────────────────────────────── */}
        <div className="xl:col-span-4 sticky top-6 flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden h-[calc(100vh-200px)]">
          <div className="p-4 border-b bg-muted/10 space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search sessions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            {/* Date filter */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="flex-1 py-1.5 px-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground/80"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter("")} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:bg-muted transition-colors">
                  Clear
                </button>
              )}
            </div>
            {/* Failure type chips */}
            <div className="flex flex-wrap gap-1">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => setFilterType(chip.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                    filterType === chip.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground/70 border-border hover:bg-muted"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Session cards */}
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {loadingSessions ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="size-4 animate-spin mr-2" /><span className="text-sm">Loading…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground px-4">
                <Eye className="size-7 mb-2 opacity-30" />
                <p className="text-sm font-medium">No sessions found</p>
                <p className="text-xs mt-1 opacity-70">Pull traces from the dashboard first</p>
              </div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => handleSelect(s)}
                  className={`group w-full text-left p-2.5 rounded-md border transition-all duration-200 ${
                    selected?.session_id === s.session_id
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-[11px] font-mono truncate ${selected?.session_id === s.session_id ? "text-primary font-medium" : "text-muted-foreground"}`}>
                      {s.session_id}
                    </span>
                    <FailureBadge type={s.failure_type} />
                  </div>
                  <div className="text-xs text-muted-foreground mb-1 line-clamp-1">
                    {s.failure_summary ?? s.agent_id}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{s.llm_calls} LLM</span><span>·</span>
                      <span>{s.tool_calls} tools</span><span>·</span>
                      <span>{s.retrieval_events} retrievals</span>
                    </div>
                    {s.timestamp && (
                      <span className="text-[10px] text-muted-foreground/50">{formatTimestamp(s.timestamp)}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t bg-muted/10 text-xs text-muted-foreground text-center">
            {filtered.length} of {sessions.length} sessions
          </div>

        </div>

        {/* ── Right: Analysis Panel ──────────────────────────────────────── */}
        <div className="xl:col-span-8 space-y-6">
          {!selected ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed rounded-xl bg-muted/5 p-8">
              <div className="p-4 bg-muted/20 rounded-full mb-4">
                <Eye className="size-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Choose a trace from the left panel, then click <strong>Run Full Analysis</strong> to see the diagnosis.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {analysisError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {analysisError}
                </div>
              )}

              {/* ── Analysis card — FIRST thing, session info in header ── */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                {/* Session info row — compact, inside the card */}
                <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <FailureBadge type={selected.failure_type} />
                    <span className="font-mono text-xs text-muted-foreground truncate">{selected.session_id}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">· {selected.agent_id}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {selected.timestamp && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />{formatTimestamp(selected.timestamp)}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Cpu className="size-3" />{selected.llm_calls}
                      <Zap className="size-3 ml-1" />{selected.tool_calls}
                      <ScanSearch className="size-3 ml-1" />{selected.retrieval_events}
                    </span>
                    <button
                      onClick={handleAnalyze}
                      disabled={analysisLoading}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {analysisLoading
                        ? <><Loader2 className="size-3 animate-spin" /> Analyzing…</>
                        : "Run Full Analysis"}
                    </button>
                  </div>
                </div>

                {selected.failure_summary && (
                  <div className="px-5 py-2 border-b bg-amber-500/5">
                    <p className="text-xs text-amber-700 dark:text-amber-400">{selected.failure_summary}</p>
                  </div>
                )}

                {/* Metrics row */}
                <div className="grid grid-cols-2 md:grid-cols-4 border-b divide-x">
                  {[
                    {
                      label: "Confidence",
                      value: report ? `${Math.round(report.confidence * 100)}%` : "—",
                      cls: report
                        ? report.confidence >= 0.7 ? "text-emerald-600"
                        : report.confidence >= 0.4 ? "text-amber-600"
                        : "text-rose-600"
                        : "text-muted-foreground/40",
                    },
                    { label: "Findings", value: report ? String(report.findings.length) : "—", cls: "text-foreground" },
                    {
                      label: "High / Critical",
                      value: report ? String(report.findings.filter(f => f.severity === "high" || f.severity === "critical").length) : "—",
                      cls: "text-rose-600",
                    },
                    {
                      label: "Medium / Low",
                      value: report ? String(report.findings.filter(f => f.severity === "medium" || f.severity === "low").length) : "—",
                      cls: "text-amber-600",
                    },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="p-5 bg-muted/10">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                      <span className={`text-2xl font-bold ${cls}`}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* 2-col: Summary + Root Cause | Findings */}
                <div className="p-6 grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <Target className="size-4 text-primary" />
                      <h3 className="font-semibold tracking-tight text-sm">Analysis Summary</h3>
                    </div>
                    <div className="p-4 bg-muted/30 border rounded-xl text-sm leading-relaxed shadow-inner">
                      {report?.summary ?? (
                        analysisLoading
                          ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Running analysis…</span>
                          : "Select a session and click Run Full Analysis to see the root cause assessment."
                      )}
                    </div>
                    {report && (
                      <div className="pt-3 border-t space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Root Cause</p>
                        <p className="text-sm font-medium text-foreground leading-relaxed">{report.root_cause}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <FileText className="size-4 text-primary" />
                      <h3 className="font-semibold tracking-tight text-sm">
                        {report ? `Findings (${report.findings.length})` : "Findings"}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {report ? (
                        report.findings.length === 0 ? (
                          <div className="p-4 border rounded-xl text-sm border-l-4 border-l-emerald-500 bg-emerald-500/5">
                            <p className="text-muted-foreground">No issues detected.</p>
                          </div>
                        ) : (
                          report.findings.map((f: Finding, i: number) => (
                            <div key={i} className={`p-4 bg-background border rounded-xl text-sm border-l-4 ${
                              f.severity === "high" || f.severity === "critical"
                                ? "border-l-rose-500"
                                : "border-l-amber-400"
                            }`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-foreground">{f.title}</span>
                                <span className="text-xs font-semibold uppercase tracking-wider opacity-60">{f.severity}</span>
                              </div>
                              <p className="text-muted-foreground leading-relaxed text-xs">{f.description}</p>
                              {f.recommendation && (
                                <p className="mt-1.5 text-xs font-medium text-foreground/80">→ {f.recommendation}</p>
                              )}
                            </div>
                          ))
                        )
                      ) : (
                        <div className="p-4 border rounded-xl text-sm border-l-4 border-l-muted">
                          <p className="text-muted-foreground">Findings will appear here after analysis.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Session Context — below analysis, requires scroll */}
              {fullSession && (
                <SessionContext session={fullSession as Record<string, unknown>} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
