"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";
import {
  Eye, BrainCircuit, Wrench, ShieldAlert, ScanSearch, Loader2,
  Search, AlertTriangle, CheckCircle2, Bot, Clock, Tag, XCircle,
  FileSearch, Cpu, ChevronDown, SlidersHorizontal,
} from "lucide-react";
import {
  fetchAllSessions, fetchSession, fetchSessionCount, analyzeSession,
  type SessionSummary, type AnalysisReport, type Finding,
} from "@/lib/api";
import { AILoadingOverlay } from "@/components/ui/ai-loader";
import { AnalysisMetrics } from "@/components/features/analysis/AnalysisMetrics";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const FAILURE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  memory:        { label: "Memory",       color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",    icon: BrainCircuit },
  tool_misfire:  { label: "Tool Misfire", color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20",  icon: Wrench },
  hallucination: { label: "Hallucination",color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20",    icon: ShieldAlert },
  blind_spot:    { label: "Blind Spot",   color: "text-purple-600 dark:text-purple-400",bg: "bg-purple-500/10 border-purple-500/20",icon: ScanSearch },
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

const TRACE_SOURCE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  langfuse:  { label: "Langfuse",  color: "text-indigo-600 dark:text-indigo-400",  bg: "bg-indigo-500/10 border border-indigo-500/20"  },
  langsmith: { label: "LangSmith", color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-500/10 border border-orange-500/20"  },
  demo:      { label: "Demo",      color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
  synthetic: { label: "Synthetic", color: "text-slate-600 dark:text-slate-400",    bg: "bg-slate-500/10 border border-slate-500/20"    },
};

function SourceBadge({ source }: { source?: string }) {
  const s = TRACE_SOURCE_STYLE[source ?? "langfuse"] ?? TRACE_SOURCE_STYLE.langfuse;
  return (
    <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${s.bg} ${s.color}`}>
      {s.label}
    </span>
  );
}

const SEVERITY_CONFIG: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  critical: { border:"border-rose-500",  bg:"bg-rose-500/5",  text:"text-rose-700 dark:text-rose-400",   badge:"bg-rose-500/10 text-rose-600 border-rose-500/20" },
  high:     { border:"border-rose-400",  bg:"bg-rose-500/5",  text:"text-rose-700 dark:text-rose-400",   badge:"bg-rose-500/10 text-rose-600 border-rose-500/20" },
  medium:   { border:"border-amber-400", bg:"bg-amber-500/5", text:"text-amber-700 dark:text-amber-400", badge:"bg-amber-500/10 text-amber-600 border-amber-500/20" },
  low:      { border:"border-blue-400",  bg:"bg-blue-500/5",  text:"text-blue-700 dark:text-blue-400",   badge:"bg-blue-500/10 text-blue-600 border-blue-500/20" },
};

// ── Main ───────────────────────────────────────────────────────────────────

export default function TracesPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const initialType = searchParams.get("type");
  const allowedTypes = ["all", "memory", "tool_misfire", "hallucination", "blind_spot"];
  const pinnedIds = useMemo(() => {
    const raw = searchParams.get("ids");
    return raw ? new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)) : null;
  }, [searchParams]);

  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [fullSession, setFullSession] = useState<Record<string, unknown> | null>(null);
  const [filterTypes, setFilterTypes] = useState<string[]>(
    initialType && allowedTypes.slice(1).includes(initialType) ? [initialType] : []
  );
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo]     = useState<string>("");
  const [sourcesFilter, setSourcesFilter] = useState<string[]>([]);
  const initialOutcome = searchParams.get("outcome");
  const [outcomeFilter, setOutcomeFilter] = useState<string>(
    initialOutcome && ["success", "failure"].includes(initialOutcome) ? initialOutcome : "all"
  );
  const [showFilters, setShowFilters] = useState(!!initialOutcome);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 200;

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisRefreshing, setAnalysisRefreshing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [activeTab, setActiveTab] = useState<"context" | "diagnosis" | "retrieval" | "llm_calls" | "tool_calls" | "findings">("context");

  useEffect(() => {
    fetchAllSessions(PAGE_SIZE, 0)
      .then((data) => { setSessions(data); setHasMore(data.length === PAGE_SIZE); })
      .catch((e) => setSessionsError(e.message))
      .finally(() => setLoadingSessions(false));
    fetchSessionCount().then(setTotalCount).catch(() => {});
  }, []);

  // Infinite scroll — load next page when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingSessions) {
        setLoadingMore(true);
        fetchAllSessions(PAGE_SIZE, sessions.length)
          .then((data) => {
            setSessions(prev => [...prev, ...data]);
            setHasMore(data.length === PAGE_SIZE);
          })
          .catch(() => {})
          .finally(() => setLoadingMore(false));
      }
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadingSessions, sessions.length]);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (pinnedIds) return pinnedIds.has(s.session_id);
      if (filterTypes.length > 0 && !filterTypes.includes(s.failure_type ?? "")) return false;
      if (sourcesFilter.length > 0 && !sourcesFilter.includes(s.trace_source ?? "langfuse")) return false;
      if (outcomeFilter === "failure" && s.failure_type === null) return false;
      if (outcomeFilter === "success" && s.failure_type !== null) return false;
      if (s.timestamp) {
        const d = new Date(s.timestamp).toISOString().slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo   && d > dateTo)   return false;
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
  }, [sessions, filterTypes, sourcesFilter, outcomeFilter, search, dateFrom, dateTo, pinnedIds]);

  const handleSelect = async (s: SessionSummary) => {
    setSelected(s);
    setFullSession(null);
    setReport(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    setAnalysisRefreshing(false);
    setActiveTab("context");
    try {
      const data = await fetchSession(s.session_id);
      if (data) {
        setFullSession(data as Record<string, unknown>);
        setReport(await analyzeSession(data, false));
      }
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleRerun = async () => {
    if (!selected) return;
    setAnalysisLoading(true);
    setAnalysisRefreshing(true);
    setAnalysisError(null);
    try {
      const data = await fetchSession(selected.session_id);
      if (!data) { setAnalysisError("Session data not found."); return; }
      setFullSession(data as Record<string, unknown>);
      setReport(await analyzeSession(data, true));
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
      setAnalysisRefreshing(false);
    }
  };

  const sess = fullSession ?? {};
  const retrieval_events = (sess.retrieval_events as Array<Record<string, unknown>>) ?? [];
  const llm_calls        = (sess.llm_calls        as Array<Record<string, unknown>>) ?? [];
  const tool_calls       = (sess.tool_calls        as Array<Record<string, unknown>>) ?? [];

  // Deduplicate retrieval events by query — keep first occurrence of each unique query
  const unique_retrievals = retrieval_events.filter((evt, idx) => {
    const q = String(evt.query ?? "").toLowerCase().trim();
    return retrieval_events.findIndex(e => String(e.query ?? "").toLowerCase().trim() === q) === idx;
  });
  const duplicate_count = retrieval_events.length - unique_retrievals.length;

  // Derive outcome — use failure_type as primary signal; fall back to stored outcome.
  const derivedOutcome = (sess.failure_type ?? selected?.failure_type) ? "failure" : "success";

  const TABS = [
    { key: "context"    as const, label: "Session Context" },
    { key: "diagnosis"  as const, label: "Diagnosis" },
    { key: "findings"   as const, label: "Findings" },
    { key: "llm_calls"  as const, label: "LLM Calls" },
    { key: "tool_calls" as const, label: "Tool Calls" },
    { key: "retrieval"  as const, label: "Retrieval Events" },
  ];


  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
            <Eye className="size-6" />
          </div>
          Trace Explorer
        </h2>
        <p className="text-muted-foreground text-sm">
          Global archive of all agent sessions. Filter, search, and deep-dive into the historical record.
        </p>
      </div>

      {pinnedIds && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="text-amber-700 dark:text-amber-400 font-medium">
            Showing {filtered.length} flagged session{filtered.length !== 1 ? "s" : ""} from Data Quality report
          </span>
          <Link href="/traces" className="text-xs text-primary hover:underline">Clear filter — show all</Link>
        </div>
      )}

      {sessionsError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sessionsError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,36%)_minmax(0,1fr)] gap-6 items-start">

        {/* ── Left: Session list ──────────────────────────────────────────── */}
        <div className="sticky top-6 flex flex-col rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden h-[calc(100vh-200px)]">
          <div className="border-b bg-muted/10" ref={filterBarRef}>
            {/* Search + filter toggle */}
            <div className="p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  type="text" placeholder="Search sessions…" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowFilters(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${showFilters ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <SlidersHorizontal className="size-3" />
                  Filters
                  {(() => {
                    const n = filterTypes.length + sourcesFilter.length + (outcomeFilter !== "all" ? 1 : 0) + (dateFrom || dateTo ? 1 : 0);
                    return n > 0 ? <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] leading-none">{n}</span> : null;
                  })()}
                  <ChevronDown className={`size-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
                </button>
                {(filterTypes.length > 0 || sourcesFilter.length > 0 || outcomeFilter !== "all" || dateFrom || dateTo) && (
                  <button
                    onClick={() => { setFilterTypes([]); setSourcesFilter([]); setOutcomeFilter("all"); setDateFrom(""); setDateTo(""); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <XCircle className="size-3" /> Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Expandable filter body */}
            {showFilters && (
              <div className="px-3 pb-3 space-y-3 border-t pt-3">

                {/* Failure Type — multi-select chips */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Failure Type</p>
                  <div className="flex flex-wrap gap-1">
                    {([
                      { key: "memory",        label: "Memory",        on: "border-blue-400/60 bg-blue-500/10 text-blue-600 dark:text-blue-400"   },
                      { key: "tool_misfire",  label: "Tool Misfire",  on: "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
                      { key: "hallucination", label: "Hallucination", on: "border-rose-400/60 bg-rose-500/10 text-rose-600 dark:text-rose-400"     },
                      { key: "blind_spot",    label: "Blind Spot",    on: "border-purple-400/60 bg-purple-500/10 text-purple-600 dark:text-purple-400" },
                    ] as { key: string; label: string; on: string }[]).map(opt => {
                      const active = filterTypes.includes(opt.key);
                      return (
                        <button
                          key={opt.key}
                          onClick={() => setFilterTypes(prev => active ? prev.filter(k => k !== opt.key) : [...prev, opt.key])}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${active ? opt.on : "border-border/50 bg-background text-foreground/60 hover:bg-muted/60 hover:text-foreground"}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Source — multi-select chips */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Source</p>
                  <div className="flex flex-wrap gap-1">
                    {([
                      { key: "langfuse",  label: "Langfuse",  on: "border-indigo-400/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"   },
                      { key: "langsmith", label: "LangSmith", on: "border-orange-400/60 bg-orange-500/10 text-orange-600 dark:text-orange-400" },
                      { key: "demo",      label: "Demo",      on: "border-emerald-400/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
                    ] as { key: string; label: string; on: string }[]).map(opt => {
                      const active = sourcesFilter.includes(opt.key);
                      return (
                        <button key={opt.key}
                          onClick={() => setSourcesFilter(prev => active ? prev.filter(k => k !== opt.key) : [...prev, opt.key])}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${active ? opt.on : "border-border/50 bg-background text-foreground/60 hover:bg-muted/60 hover:text-foreground"}`}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status — single select chips */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
                  <div className="flex gap-1">
                    {([["all","All"],["failure","Failure"],["success","Success"]] as [string,string][]).map(([v,l]) => (
                      <button key={v} onClick={() => setOutcomeFilter(v)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${outcomeFilter === v
                          ? v === "failure" ? "border-rose-400/60 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : v === "success" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/50 bg-background text-foreground/60 hover:bg-muted/60 hover:text-foreground"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date range */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Date Range</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <p className="text-[9px] text-muted-foreground mb-0.5">From</p>
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        className="w-full text-[11px] px-2 py-1 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground/80" />
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground mb-0.5">To</p>
                      <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}
                        className="w-full text-[11px] px-2 py-1 rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground/80" />
                    </div>
                  </div>
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                      Clear dates
                    </button>
                  )}
                </div>

              </div>
            )}
          </div>

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
              <FadeInStagger className="flex flex-col gap-1">
                {filtered.map((s) => (
                  <FadeInItem key={s.session_id}>
                    <button
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
                        <div className="flex items-center gap-1 shrink-0">
                          {s.has_report && (
                            <span title="Analysis cached" className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                          )}
                          <FailureBadge type={s.failure_type} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <SourceBadge source={s.trace_source} />
                          <span>{s.agent_id}</span>
                          <span className="flex items-center gap-0.5" title="LLM Calls"><Cpu className="size-3 text-blue-400" />{s.llm_calls}</span>
                          <span className="flex items-center gap-0.5" title="Tool Calls"><Wrench className="size-3 text-amber-400" />{s.tool_calls}</span>
                          <span className="flex items-center gap-0.5" title="Retrieval Events"><ScanSearch className="size-3 text-purple-400" />{s.retrieval_events}</span>
                        </div>
                        {s.timestamp && (
                          <span className="text-[10px] text-muted-foreground/50 shrink-0">{formatTimestamp(s.timestamp)}</span>
                        )}
                      </div>
                    </button>
                  </FadeInItem>
                ))}
              </FadeInStagger>
            )}

            {/* Sentinel must be inside the scrollable container — only visible when user scrolls to bottom */}
            <div ref={sentinelRef} className="h-2" />
            {loadingMore && (
              <div className="flex items-center justify-center py-2 gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading more…
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t bg-muted/10 text-xs text-muted-foreground text-center">
            {filtered.length} of {totalCount ?? sessions.length} sessions{hasMore ? " · scroll for more" : ""}
          </div>
        </div>

        {/* ── Right: Tabbed analysis card ─────────────────────────────────── */}
        <div>
          {!selected ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed rounded-2xl bg-muted/5 p-8">
              <div className="p-4 bg-muted/20 rounded-full mb-4">
                <Eye className="size-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Choose a trace from the left panel — the analysis loads automatically.
              </p>
            </div>
          ) : (
            <div className="relative">
              <AILoadingOverlay
                isLoading={analysisLoading}
                text={analysisRefreshing ? "Re-running pipeline…" : "Loading analysis…"}
                subtext={analysisRefreshing ? "Running LangGraph — this takes ~25s" : undefined}
              />

              {analysisError && (
                <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {analysisError}
                </div>
              )}

              <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">

                {/* Metrics bar */}
                {report && (
                  <AnalysisMetrics report={report} className="border-b" itemClassName="p-4 bg-muted/10" />
                )}

                {/* Tab bar + action button */}
                <div className="flex items-center justify-between border-b px-2">
                  <div className="flex overflow-x-auto scrollbar-none">
                    {TABS.map((tab) => (
                      <button
                        key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                          activeTab === tab.key
                            ? "text-primary border-primary"
                            : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleRerun} disabled={analysisLoading}
                    className="shrink-0 mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {analysisLoading
                      ? <><Loader2 className="size-3 animate-spin" />Analyzing…</>
                      : report ? "Re-run" : "Run Analysis"}
                  </button>
                </div>

                {/* Tab content */}
                <div className="overflow-auto" style={{ minHeight: "340px", maxHeight: "calc(100vh - 360px)" }}>

                  {/* ── Session Context ── */}
                  {activeTab === "context" && (
                    <div className="p-6 space-y-5">

                      {/* Identity card */}
                      <div className={`rounded-xl border-l-4 p-5 space-y-4 ${derivedOutcome === "failure" ? "border-rose-400 bg-rose-500/5" : "border-emerald-400 bg-emerald-500/5"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {derivedOutcome === "failure"
                              ? <XCircle className="size-5 text-rose-500 shrink-0 mt-0.5" />
                              : <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />}
                            <div className="min-w-0">
                              <h4 className={`text-base font-semibold ${derivedOutcome === "failure" ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                {String(sess.agent_id ?? selected.agent_id ?? "Agent")}
                              </h4>
                              <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{derivedOutcome} · {selected.timestamp ? formatTimestamp(selected.timestamp) : ""}</p>
                            </div>
                          </div>
                          {(sess.failure_type ?? selected.failure_type) && (
                            <FailureBadge type={String(sess.failure_type ?? selected.failure_type)} />
                          )}
                        </div>

                        {/* Session ID */}
                        <div className="pl-8 space-y-1">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Session ID</p>
                          <p className="text-xs font-mono text-foreground break-all">{selected.session_id}</p>
                        </div>

                      </div>

                      {/* Clickable event counts */}
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          { label: "LLM Calls",       value: llm_calls.length   || selected.llm_calls,             tab: "llm_calls"  as const, icon: Cpu,       color: "text-blue-600 dark:text-blue-400",    border: "border-blue-400",  bg: "bg-blue-500/5"  },
                          { label: "Tool Calls",       value: tool_calls.length  || selected.tool_calls,            tab: "tool_calls" as const, icon: Wrench,     color: "text-amber-600 dark:text-amber-400",  border: "border-amber-400", bg: "bg-amber-500/5" },
                          { label: "Retrieval Events", value: retrieval_events.length || selected.retrieval_events, tab: "retrieval"  as const, icon: ScanSearch, color: "text-purple-600 dark:text-purple-400", border: "border-purple-400",bg: "bg-purple-500/5"},
                        ] as { label: string; value: number; tab: "llm_calls"|"tool_calls"|"retrieval"; icon: React.ElementType; color: string; border: string; bg: string }[]).map(({ label, value, tab, icon: Icon, color, border, bg }) => (
                          <button
                            key={label}
                            onClick={() => setActiveTab(tab)}
                            className={`rounded-xl border-l-4 ${border} ${bg} p-4 text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-md hover:brightness-105 active:scale-[0.98] ${(activeTab as string) === tab ? "ring-1 ring-primary/20 shadow-sm" : ""}`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`size-4 ${color}`} />
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                            </div>
                            <p className={`text-2xl font-bold ${color}`}>{value}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Diagnosis ── */}
                  {activeTab === "diagnosis" && (
                    <div className="p-6">
                      {(() => {
                        const isSuccess = derivedOutcome === "success";
                        const s = (report?.summary ?? "").toLowerCase().trim();
                        const meaninglessSummary = !s || s.startsWith("unknown") || s.startsWith("no failure") || s.startsWith("no issues") || s === "n/a" || s === "none" || s === "no summary" || s.includes("without identifiable issues");

                        if (report && isSuccess && meaninglessSummary) {
                          return (
                            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                              <CheckCircle2 className="size-10 text-emerald-500/60" />
                              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Session completed successfully</p>
                              <p className="text-xs text-muted-foreground">No failures or anomalies detected in this trace.</p>
                            </div>
                          );
                        }

                        if (report) {
                          return (
                            <div className="space-y-5">
                              {/* Summary card */}
                              {!meaninglessSummary && (
                                <div className="rounded-xl border-l-4 border-indigo-400 bg-indigo-500/5 p-5 space-y-3">
                                  <div className="flex items-start gap-3">
                                    <Eye className="size-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1 min-w-0">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
                                      <p className="text-sm text-foreground/80 leading-relaxed">{report.summary}</p>
                                    </div>
                                    <FailureBadge type={report.failure_type} />
                                  </div>
                                </div>
                              )}

                              {/* Root cause card — only shown when populated */}
                              {report.root_cause && report.root_cause.trim() && (
                                <div className="rounded-xl border-l-4 border-amber-400 bg-amber-500/5 p-5 space-y-3">
                                  <div className="flex items-start gap-3">
                                    <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1 min-w-0">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Root Cause</p>
                                      <p className="text-sm font-medium text-foreground leading-relaxed">{report.root_cause}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                            <Eye className="size-10 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">Click <strong>Run Analysis</strong> to see the diagnosis and root cause.</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Findings ── */}
                  {activeTab === "findings" && (
                    <div className="p-6">
                      {report ? (
                        report.findings.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                            <CheckCircle2 className="size-10 text-emerald-500/60" />
                            <p className="text-sm text-muted-foreground">No issues detected in this session.</p>
                          </div>
                        ) : (
                          <div className="space-y-5">
                            {report.findings.map((f: Finding, i: number) => {
                              const cfg = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG.medium;
                              return (
                                <div key={i} className={`rounded-xl border-l-4 ${cfg.border} ${cfg.bg} p-5 space-y-3`}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0">
                                      <AlertTriangle className={`size-5 shrink-0 mt-0.5 ${cfg.text}`} />
                                      <h4 className={`text-base font-semibold leading-snug break-words ${cfg.text}`}>{f.title}</h4>
                                    </div>
                                    <span className={`shrink-0 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                                      {f.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-foreground leading-relaxed pl-8">{f.description}</p>
                                  {f.evidence.length > 0 && (
                                    <div className="pl-8 space-y-1.5">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evidence</p>
                                      {f.evidence.map((ev, j) => (
                                        <p key={j} className="text-xs font-mono text-muted-foreground bg-background/60 rounded px-2 py-1 border break-all">{ev}</p>
                                      ))}
                                    </div>
                                  )}
                                  {f.recommendation && (
                                    <div className="pl-8 pt-2 border-t border-current/10">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Recommendation</p>
                                      <p className="text-sm font-medium text-foreground leading-relaxed">{f.recommendation}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                          <FileSearch className="size-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">Run analysis to see findings.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── LLM Calls ── */}
                  {activeTab === "llm_calls" && (
                    <div className="p-6">
                      {llm_calls.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                          <Cpu className="size-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">No LLM calls recorded in this session.</p>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {llm_calls.map((lc, i) => (
                            <div key={i} className="rounded-xl border-l-4 border-blue-400 bg-blue-500/5 p-5 space-y-4">
                              {/* Header */}
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <Cpu className="size-5 text-blue-500 shrink-0" />
                                  <h4 className="text-base font-semibold text-blue-700 dark:text-blue-400">
                                    LLM Call {i + 1}
                                    {!!lc.model && <span className="ml-2 text-sm font-normal text-muted-foreground">· {String(lc.model)}</span>}
                                  </h4>
                                </div>
                                {!!lc.tokens_in && (
                                  <span className="shrink-0 text-xs font-medium text-muted-foreground bg-background/60 border rounded-full px-2 py-0.5">
                                    {Number(lc.tokens_in)}→{Number(lc.tokens_out ?? 0)} tokens
                                  </span>
                                )}
                              </div>
                              {/* Prompt */}
                              {!!lc.prompt && (
                                <div className="pl-8 space-y-1.5">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prompt</p>
                                  <div className="bg-background/60 rounded-lg px-4 py-3 border text-sm text-foreground leading-relaxed break-words">
                                    {String(lc.prompt).slice(0, 500)}{String(lc.prompt).length > 500 ? "…" : ""}
                                  </div>
                                </div>
                              )}
                              {/* Response */}
                              {!!lc.response && (
                                <div className="pl-8 space-y-1.5">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Response</p>
                                  <div className="bg-background/60 rounded-lg px-4 py-3 border text-sm text-foreground leading-relaxed break-words">
                                    {String(lc.response).slice(0, 500)}{String(lc.response).length > 500 ? "…" : ""}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Tool Calls ── */}
                  {activeTab === "tool_calls" && (
                    <div className="p-6">
                      {tool_calls.length === 0 ? (
                        (() => {
                          const isMisfire = String(sess.failure_type ?? selected?.failure_type ?? "").toLowerCase() === "tool_misfire";
                          const errText = String(sess.failure_summary ?? selected?.failure_summary ?? "").trim();
                          const isRealError = errText.toLowerCase().startsWith("error:");
                          return isMisfire && isRealError ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border-l-4 border-rose-500 bg-rose-500/5 p-5 space-y-3">
                                <div className="flex items-start gap-3">
                                  <Wrench className="size-5 text-rose-500 shrink-0 mt-0.5" />
                                  <div className="space-y-1 min-w-0">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Detected Tool Error</p>
                                    <p className="text-sm font-medium text-foreground leading-relaxed break-words">{errText}</p>
                                  </div>
                                  <span className="shrink-0 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-600">failed</span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground text-center pt-1">Tool call structure was not captured — error extracted from message history.</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                              <Wrench className="size-10 text-muted-foreground/30" />
                              <p className="text-sm text-muted-foreground">No tool calls recorded in this session.</p>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="space-y-5">
                          {tool_calls.map((tc, i) => {
                            const failed = ["failed", "timeout"].includes(String(tc.status ?? "").toLowerCase());
                            return (
                              <div key={i} className={`rounded-xl border-l-4 p-5 space-y-4 ${failed ? "border-rose-500 bg-rose-500/5" : "border-emerald-500 bg-emerald-500/5"}`}>
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <Wrench className={`size-5 shrink-0 mt-0.5 ${failed ? "text-rose-500" : "text-emerald-500"}`} />
                                    <div>
                                      <h4 className={`text-base font-semibold font-mono break-words ${failed ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                        {String(tc.tool_name ?? "")}
                                      </h4>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">Tool call {i + 1}</p>
                                    </div>
                                  </div>
                                  <span className={`shrink-0 text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${failed ? "text-rose-600 bg-rose-500/10 border-rose-500/20" : "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"}`}>
                                    {String(tc.status ?? "unknown")}
                                  </span>
                                </div>
                                {/* Parameters */}
                                {!!(tc.parameters) && Object.keys(tc.parameters as object).length > 0 && (
                                  <div className="pl-8 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Parameters</p>
                                    <pre className="text-xs font-mono text-foreground bg-background/60 rounded-lg px-4 py-3 border overflow-x-auto leading-relaxed">{JSON.stringify(tc.parameters, null, 2)}</pre>
                                  </div>
                                )}
                                {/* Error */}
                                {!!tc.error && (
                                  <div className="pl-8 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Error</p>
                                    <div className="bg-rose-500/5 rounded-lg px-4 py-3 border border-rose-500/20">
                                      <p className="text-sm font-mono text-rose-700 dark:text-rose-400 break-all leading-relaxed">{String(tc.error)}</p>
                                    </div>
                                  </div>
                                )}
                                {/* Result */}
                                {!!tc.result && !tc.error && (
                                  <div className="pl-8 pt-2 border-t border-emerald-500/10 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Result</p>
                                    <p className="text-sm text-foreground leading-relaxed break-words">{String(tc.result).slice(0, 300)}{String(tc.result).length > 300 ? "…" : ""}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Retrieval Events (deduplicated) ── */}
                  {activeTab === "retrieval" && (
                    <div className="p-6">
                      {retrieval_events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                          <FileSearch className="size-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">No retrieval events recorded in this session.</p>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {duplicate_count > 0 && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg px-4 py-2.5 border">
                              <FileSearch className="size-3.5 shrink-0" />
                              {retrieval_events.length} total searches · {duplicate_count} duplicate {duplicate_count === 1 ? "query" : "queries"} removed · showing {unique_retrievals.length} unique
                            </div>
                          )}
                          {unique_retrievals.map((evt, i) => {
                            const scores     = (evt.relevance_scores as number[]) ?? [];
                            const maxScore   = scores.length > 0 ? Math.max(...scores) : null;
                            const docIds     = (evt.actual_doc_ids as string[]) ?? [];
                            const docContent = (evt.doc_content as string[]) ?? [];
                            const good       = maxScore !== null && maxScore >= 0.5;
                            return (
                              <div key={i} className="rounded-xl border-l-4 border-purple-400 bg-purple-500/5 p-5 space-y-4">
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <ScanSearch className="size-5 shrink-0 mt-0.5 text-purple-500" />
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Query {i + 1}</p>
                                      <p className="text-base font-semibold text-foreground break-words leading-snug">{String(evt.query ?? "")}</p>
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right space-y-1">
                                    <span className={`block text-xs font-bold px-2 py-0.5 rounded-full border ${good ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" : "text-amber-600 bg-amber-500/10 border-amber-500/20"}`}>
                                      {maxScore !== null ? `score ${maxScore.toFixed(2)}` : "no score"}
                                    </span>
                                    <p className="text-xs text-muted-foreground">{Number(evt.chunks_returned ?? 0)} chunks</p>
                                  </div>
                                </div>
                                {/* All scores */}
                                {scores.length > 1 && (
                                  <div className="pl-8">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">All Scores</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {scores.map((s, j) => (
                                        <span key={j} className={`text-xs font-mono px-2 py-0.5 rounded border ${s >= 0.5 ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" : "text-amber-600 bg-amber-500/10 border-amber-500/20"}`}>{s.toFixed(3)}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Documents */}
                                {docIds.length > 0 && (
                                  <div className="pl-8 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Retrieved Documents</p>
                                    <div className="space-y-1">
                                      {docIds.map((id, j) => (
                                        <p key={j} className="text-xs font-mono text-muted-foreground bg-background/60 rounded px-3 py-1 border truncate">{id}</p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Content preview */}
                                {docContent.length > 0 && (
                                  <div className="pl-8 pt-2 border-t border-current/10 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Content Preview</p>
                                    <p className="text-sm text-muted-foreground italic leading-relaxed break-words">
                                      "{docContent[0].slice(0, 220)}{docContent[0].length > 220 ? "…" : ""}"
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Analysis Findings ── */}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
