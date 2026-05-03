"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Timer, Cpu, Wrench, ScanSearch, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, RefreshCw, Search, Loader2,
  ArrowRight, BrainCircuit, ShieldAlert, ChevronsDownUp, ChevronsUpDown,
  Info,
} from "lucide-react";
import { fetchAllSessions, fetchSession, type SessionSummary } from "@/lib/api";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";

// ── Types ──────────────────────────────────────────────────────────────────

interface LLMCall        { call_id?: string; model?: string; prompt?: string; response?: string; latency_ms?: number; hallucination_flag?: boolean; tokens_in?: number; tokens_out?: number }
interface ToolCall        { call_id?: string; tool_name?: string; parameters?: unknown; result?: string; error?: string; status?: string; latency_ms?: number }
interface RetrievalEvent  { event_id?: string; query?: string; chunks_returned?: number; relevance_scores?: number[]; doc_content?: string[]; latency_ms?: number }

type EventKind = "llm" | "tool" | "retrieval";
interface TimelineEvent {
  id: string; kind: EventKind; index: number;
  label: string; sublabel?: string;
  status: "success" | "warning" | "failure" | "neutral";
  latency_ms?: number;
  detail: Record<string, unknown>;
}

// ── Config ─────────────────────────────────────────────────────────────────

const FAILURE_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  memory:        { label: "Memory",        color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: BrainCircuit },
  tool_misfire:  { label: "Tool Misfire",  color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-500/10",   border: "border-amber-500/20",   icon: Wrench       },
  hallucination: { label: "Hallucination", color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    icon: ShieldAlert  },
  blind_spot:    { label: "Blind Spot",    color: "text-purple-600 dark:text-purple-400",bg: "bg-purple-500/10",  border: "border-purple-500/20",  icon: ScanSearch   },
};

function FailureBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const cfg = FAILURE_TYPE_CONFIG[type];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon className="size-2.5" />{cfg.label}
    </span>
  );
}

const STATUS_ICON: Record<TimelineEvent["status"], React.ElementType> = {
  success: CheckCircle2, warning: AlertTriangle, failure: XCircle, neutral: Timer,
};
const STATUS_COLOR: Record<TimelineEvent["status"], string> = {
  success: "text-emerald-500", warning: "text-amber-500", failure: "text-rose-500", neutral: "text-muted-foreground",
};
const STATUS_BG: Record<TimelineEvent["status"], string> = {
  success:  "border-emerald-400/40 bg-emerald-500/5",
  warning:  "border-amber-400/40 bg-amber-500/5",
  failure:  "border-rose-400/40 bg-rose-500/5",
  neutral:  "border-border/50 bg-muted/10",
};
const KIND_COLOR: Record<EventKind, string> = {
  llm: "bg-blue-500", tool: "bg-amber-500", retrieval: "bg-purple-500",
};
const KIND_LABEL: Record<EventKind, string> = {
  llm: "LLM Call", tool: "Tool Call", retrieval: "Retrieval",
};
const KIND_ICON: Record<EventKind, React.ElementType> = {
  llm: Cpu, tool: Wrench, retrieval: ScanSearch,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function statusOf(kind: EventKind, raw: Record<string, unknown>): TimelineEvent["status"] {
  if (kind === "tool") {
    const s = String(raw.status ?? "").toLowerCase();
    if (s === "failed" || s === "timeout") return "failure";
    if (s === "success") return "success";
    return "neutral";
  }
  if (kind === "llm") return raw.hallucination_flag ? "warning" : "success";
  if (kind === "retrieval") {
    const n = Number(raw.chunks_returned ?? 0);
    const scores = (raw.relevance_scores as number[]) ?? [];
    if (n === 0) return "failure";
    if (scores.length && Math.max(...scores) < 0.5) return "warning";
    return "success";
  }
  return "neutral";
}

function buildTimeline(sess: Record<string, unknown>): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const llm  = (sess.llm_calls          as LLMCall[])         ?? [];
  const tool = (sess.tool_calls         as ToolCall[])         ?? [];
  const ret  = (sess.retrieval_events   as RetrievalEvent[])   ?? [];

  ret.forEach((c, i) => events.push({
    id: c.event_id ?? `ret-${i}`, kind: "retrieval", index: i + 1,
    label: `Retrieval ${i + 1}`,
    sublabel: c.query ? `"${c.query.slice(0, 60)}${c.query.length > 60 ? "…" : ""}"` : undefined,
    status: statusOf("retrieval", c as unknown as Record<string, unknown>),
    latency_ms: c.latency_ms,
    detail: c as unknown as Record<string, unknown>,
  }));
  llm.forEach((c, i) => events.push({
    id: c.call_id ?? `llm-${i}`, kind: "llm", index: i + 1,
    label: `LLM Call ${i + 1}`,
    sublabel: c.model ?? undefined,
    status: statusOf("llm", c as unknown as Record<string, unknown>),
    latency_ms: c.latency_ms,
    detail: c as unknown as Record<string, unknown>,
  }));
  tool.forEach((c, i) => events.push({
    id: c.call_id ?? `tool-${i}`, kind: "tool", index: i + 1,
    label: c.tool_name ?? `Tool Call ${i + 1}`,
    status: statusOf("tool", c as unknown as Record<string, unknown>),
    latency_ms: c.latency_ms,
    detail: c as unknown as Record<string, unknown>,
  }));
  return events;
}

function formatMs(ms?: number) {
  if (!ms) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatTs(ts: string | null | undefined) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Structured detail panels ───────────────────────────────────────────────

function LLMDetail({ ev }: { ev: TimelineEvent }) {
  const d = ev.detail as LLMCall;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {d.model && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-600 dark:text-blue-400">{d.model}</span>}
        {(d.tokens_in || d.tokens_out) && (
          <span className="text-xs text-muted-foreground">{d.tokens_in ?? 0} → {d.tokens_out ?? 0} tokens</span>
        )}
        {d.hallucination_flag && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-600 dark:text-amber-400">⚠ Hallucination flag</span>
        )}
      </div>
      {d.prompt && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prompt</p>
          <div className="bg-background/60 border rounded-lg px-3 py-2.5 text-xs text-foreground leading-relaxed max-h-32 overflow-y-auto break-words">
            {String(d.prompt).slice(0, 600)}{String(d.prompt).length > 600 ? "…" : ""}
          </div>
        </div>
      )}
      {d.response && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Response</p>
          <div className="bg-background/60 border rounded-lg px-3 py-2.5 text-xs text-foreground leading-relaxed max-h-32 overflow-y-auto break-words">
            {String(d.response).slice(0, 600)}{String(d.response).length > 600 ? "…" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolDetail({ ev }: { ev: TimelineEvent }) {
  const d = ev.detail as ToolCall;
  const isError = !!d.error;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
          d.status === "failed" || d.status === "timeout"
            ? "bg-rose-500/10 border-rose-400/30 text-rose-600 dark:text-rose-400"
            : "bg-emerald-500/10 border-emerald-400/30 text-emerald-600 dark:text-emerald-400"
        }`}>{d.status ?? "unknown"}</span>
      </div>
      {(() => {
        const params = d.parameters as Record<string, unknown> | null | undefined;
        if (!params || typeof params !== "object" || Object.keys(params).length === 0) return null;
        return (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Parameters</p>
            <pre className="bg-background/60 border rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words max-h-24">
              {JSON.stringify(params, null, 2)}
            </pre>
          </div>
        );
      })()}
      {isError ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Error</p>
          <div className="bg-rose-500/5 border border-rose-400/30 rounded-lg px-3 py-2 text-xs text-rose-600 dark:text-rose-400 break-words">{d.error}</div>
        </div>
      ) : d.result ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Result</p>
          <div className="bg-background/60 border rounded-lg px-3 py-2 text-xs text-foreground break-words max-h-24 overflow-y-auto">{String(d.result).slice(0, 400)}</div>
        </div>
      ) : null}
    </div>
  );
}

function RetrievalDetail({ ev }: { ev: TimelineEvent }) {
  const d = ev.detail as RetrievalEvent;
  const scores = d.relevance_scores ?? [];
  const maxScore = scores.length ? Math.max(...scores) : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-background/60 p-3 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Chunks</p>
          <p className={`text-xl font-bold ${(d.chunks_returned ?? 0) === 0 ? "text-rose-600" : "text-foreground"}`}>{d.chunks_returned ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-background/60 p-3 text-center">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Best Score</p>
          <p className={`text-xl font-bold ${maxScore >= 0.5 ? "text-emerald-600" : maxScore > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
            {scores.length ? maxScore.toFixed(2) : "—"}
          </p>
        </div>
      </div>
      {scores.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Relevance Scores</p>
          <div className="flex flex-col gap-1">
            {scores.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-4">{i + 1}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${s >= 0.5 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${s * 100}%` }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{s.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.doc_content && d.doc_content.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Top Retrieved Chunk</p>
          <div className="bg-background/60 border rounded-lg px-3 py-2 text-xs text-foreground leading-relaxed break-words max-h-20 overflow-y-auto italic">
            "{d.doc_content[0].slice(0, 300)}{d.doc_content[0].length > 300 ? "…" : ""}"
          </div>
        </div>
      )}
    </div>
  );
}

function EventDetail({ ev }: { ev: TimelineEvent }) {
  if (ev.kind === "llm")       return <LLMDetail ev={ev} />;
  if (ev.kind === "tool")      return <ToolDetail ev={ev} />;
  if (ev.kind === "retrieval") return <RetrievalDetail ev={ev} />;
  return null;
}

// ── Page ───────────────────────────────────────────────────────────────────

const FAILURE_TYPES = ["memory", "tool_misfire", "hallucination", "blind_spot"] as const;

export default function TimelinePage() {
  const searchParams = useSearchParams();
  const preloadId = searchParams.get("session");

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [fullSession, setFullSession] = useState<Record<string, unknown> | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [showOrderNote, setShowOrderNote] = useState(true);

  useEffect(() => {
    fetchAllSessions()
      .then(s => {
        setSessions(s);
        if (preloadId) {
          const found = s.find(x => x.session_id === preloadId);
          if (found) handleSelect(found);
        }
      })
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (s: SessionSummary) => {
    setSelected(s);
    setExpandedIds(new Set());
    setAllExpanded(false);
    setLoadingSession(true);
    try {
      const data = await fetchSession(s.session_id);
      setFullSession(data as Record<string, unknown>);
    } catch { setFullSession(null); }
    finally { setLoadingSession(false); }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
      setAllExpanded(false);
    } else {
      setExpandedIds(new Set(timeline.map(e => e.id)));
      setAllExpanded(true);
    }
  };

  const filtered = useMemo(() => {
    return sessions.filter(s => {
      if (filterType !== "all" && s.failure_type !== filterType) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return s.session_id.toLowerCase().includes(q) || s.agent_id.toLowerCase().includes(q);
    });
  }, [sessions, search, filterType]);

  const timeline = useMemo(() => fullSession ? buildTimeline(fullSession) : [], [fullSession]);
  const failureCount  = timeline.filter(e => e.status === "failure").length;
  const warningCount  = timeline.filter(e => e.status === "warning").length;
  const totalLatency  = timeline.reduce((s, e) => s + (e.latency_ms ?? 0), 0);
  const hasLatency    = timeline.some(e => !!e.latency_ms);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
            <Timer className="size-6" />
          </div>
          Session Timeline
        </h2>
        <p className="text-muted-foreground text-sm">
          Visual replay of a session's event sequence — see how LLM calls, tools and retrievals chain together.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

        {/* Left: session picker */}
        <div className="xl:col-span-4 sticky top-6 rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden h-[calc(100vh-220px)] flex flex-col">
          {/* Search */}
          <div className="p-3 border-b bg-muted/10 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input type="text" placeholder="Search sessions…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40" />
            </div>
            {/* Failure type filter chips */}
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setFilterType("all")}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${filterType === "all" ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 bg-background text-foreground/60 hover:bg-muted/60 hover:text-foreground"}`}>
                All
              </button>
              {FAILURE_TYPES.map(t => {
                const cfg = FAILURE_TYPE_CONFIG[t];
                const active = filterType === t;
                return (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${active ? `${cfg.bg} ${cfg.border} ${cfg.color}` : "border-border/50 bg-background text-foreground/60 hover:bg-muted/60 hover:text-foreground"}`}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto p-2">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                <Timer className="size-8 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">No sessions match</p>
              </div>
            ) : (
              <FadeInStagger className="flex flex-col gap-1">
                {filtered.map(s => {
                  const isActive = selected?.session_id === s.session_id;
                  return (
                    <FadeInItem key={s.session_id}>
                      <button onClick={() => handleSelect(s)}
                        className={`w-full text-left p-2.5 rounded-md border transition-all ${isActive ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-transparent hover:border-border hover:bg-muted/40"}`}>
                        <p className={`text-[11px] font-mono truncate mb-1.5 ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}>
                          {s.session_id}
                        </p>
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-xs text-muted-foreground truncate">{s.agent_id}</span>
                            {s.failure_type && <FailureBadge type={s.failure_type} />}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground/60">
                            <span>{s.llm_calls + s.tool_calls + s.retrieval_events} events</span>
                            {s.timestamp && <span>· {new Date(s.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                          </div>
                        </div>
                      </button>
                    </FadeInItem>
                  );
                })}
              </FadeInStagger>
            )}
          </div>
          <div className="px-3 py-2 border-t bg-muted/5 text-[10px] text-muted-foreground text-center">
            {filtered.length} of {sessions.length} sessions
          </div>
        </div>

        {/* Right: timeline */}
        <div className="xl:col-span-8">
          {!selected ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed rounded-2xl bg-muted/5 p-8 gap-3">
              <Timer className="size-10 text-muted-foreground/30" />
              <h3 className="text-lg font-bold">Select a session</h3>
              <p className="text-sm text-muted-foreground">Choose a trace from the left to see its event sequence.</p>
            </div>
          ) : loadingSession ? (
            <div className="flex items-center justify-center min-h-[300px] text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin" /> Loading session events…
            </div>
          ) : (
            <div className="space-y-4">

              {/* Summary bar */}
              <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{selected.session_id}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="font-semibold text-foreground">{selected.agent_id}</p>
                      {selected.failure_type && <FailureBadge type={selected.failure_type} />}
                      {selected.timestamp && <span className="text-xs text-muted-foreground">{formatTs(selected.timestamp)}</span>}
                    </div>
                  </div>
                  <Link href={`/traces?ids=${selected.session_id}`}
                    className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0">
                    Open in Trace Explorer <ArrowRight className="size-3" />
                  </Link>
                </div>
                <div className={`grid gap-3 ${hasLatency ? "grid-cols-4" : "grid-cols-3"}`}>
                  {[
                    { label: "Events",   value: String(timeline.length), color: "text-foreground"  },
                    { label: "Failures", value: String(failureCount),    color: failureCount > 0 ? "text-rose-600" : "text-foreground"  },
                    { label: "Warnings", value: String(warningCount),    color: warningCount > 0 ? "text-amber-600" : "text-foreground" },
                    ...(hasLatency ? [{ label: "Total Latency", value: formatMs(totalLatency) ?? "—", color: "text-foreground" }] : []),
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl border border-border/50 bg-muted/20 p-3 text-center">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-between px-1">
                {/* Legend */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {(["retrieval","llm","tool"] as EventKind[]).map(k => {
                    const Icon = KIND_ICON[k];
                    return (
                      <span key={k} className="flex items-center gap-1">
                        <span className={`size-2 rounded-full shrink-0 ${KIND_COLOR[k]}`} />
                        <Icon className="size-3" />
                        {KIND_LABEL[k]}
                      </span>
                    );
                  })}
                  <span className="text-border/80">·</span>
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  <AlertTriangle className="size-3 text-amber-500" />
                  <XCircle className="size-3 text-rose-500" />
                </div>

                {/* Expand all / ordering note */}
                <div className="flex items-center gap-2 shrink-0">
                  {showOrderNote && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 bg-muted/30 border border-border/40 rounded-lg px-2 py-1">
                      <Info className="size-3 shrink-0" />
                      <span>Grouped by type, not timestamp</span>
                      <button onClick={() => setShowOrderNote(false)} className="ml-1 hover:text-foreground text-[10px]">✕</button>
                    </div>
                  )}
                  {timeline.length > 1 && (
                    <button onClick={handleExpandAll}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                      {allExpanded
                        ? <><ChevronsDownUp className="size-3" /> Collapse all</>
                        : <><ChevronsUpDown className="size-3" /> Expand all</>}
                    </button>
                  )}
                </div>
              </div>

              {/* Timeline */}
              {timeline.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center gap-2">
                  <Timer className="size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No events recorded for this session.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-5 top-0 bottom-0 w-px bg-border/40" />
                  <div className="space-y-2.5">
                    {timeline.map((ev, idx) => {
                      const Icon = KIND_ICON[ev.kind];
                      const StatusIcon = STATUS_ICON[ev.status];
                      const isExpanded = expandedIds.has(ev.id);
                      const lat = formatMs(ev.latency_ms);
                      return (
                        <div key={ev.id} className="relative pl-14">
                          {/* Node dot */}
                          <div className={`absolute left-2.5 top-3.5 size-5 rounded-full border-2 border-background flex items-center justify-center ${KIND_COLOR[ev.kind]} shadow-sm`}>
                            <Icon className="size-2.5 text-white" />
                          </div>
                          {/* Connector chevron */}
                          {idx < timeline.length - 1 && (
                            <div className="absolute left-[18px] top-8 text-border/50">
                              <ChevronDown className="size-3" />
                            </div>
                          )}
                          {/* Card */}
                          <div className={`rounded-xl border-l-4 ${STATUS_BG[ev.status]} overflow-hidden transition-all duration-200`}
                               style={{ borderLeftColor: ev.status === "failure" ? "#f87171" : ev.status === "warning" ? "#fbbf24" : ev.status === "success" ? "#34d399" : "hsl(var(--border))" }}>
                            <button className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
                              onClick={() => toggleExpand(ev.id)}>
                              <div className="flex items-center gap-3 min-w-0">
                                <StatusIcon className={`size-4 shrink-0 ${STATUS_COLOR[ev.status]}`} />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">{ev.label}</p>
                                  {ev.sublabel && <p className="text-xs text-muted-foreground truncate max-w-xs">{ev.sublabel}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                {lat && (
                                  <span className="text-[10px] font-medium text-muted-foreground bg-background/60 border px-1.5 py-0.5 rounded-lg">{lat}</span>
                                )}
                                <ChevronDown className={`size-4 text-muted-foreground/40 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 border-t border-current/10 pt-3 animate-in fade-in duration-200">
                                <EventDetail ev={ev} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
