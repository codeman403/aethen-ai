"use client";

import { useEffect, useState } from "react";
import { Clock, Layers, Loader2, ChevronRight, AlertCircle, Search } from "lucide-react";
import { fetchSessionsByType } from "@/lib/api";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";

interface SessionsListProps {
  failureType: string;
  onSelect: (sessionData: object) => void;
  selectedId?: string | null;
  showFilters?: boolean;
}

interface RawSession {
  session_id: string;
  agent_id: string;
  failure_summary?: string;
  timestamp?: string;
  llm_calls?: unknown[];
  tool_calls?: unknown[];
  retrieval_events?: unknown[];
  trace_source?: string;
}

const TRACE_SOURCE_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  langfuse:   { label: "Langfuse",   color: "text-indigo-600 dark:text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/20"  },
  langsmith:  { label: "LangSmith",  color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20"  },
  demo:       { label: "Demo",       color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  synthetic:  { label: "Synthetic",  color: "text-slate-600 dark:text-slate-400",    bg: "bg-slate-500/10",   border: "border-slate-500/20"   },
};

function SourceBadge({ source }: { source?: string }) {
  const s = TRACE_SOURCE_STYLE[source ?? "langfuse"] ?? TRACE_SOURCE_STYLE.langfuse;
  return (
    <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.bg} ${s.border} ${s.color}`}>
      {s.label}
    </span>
  );
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function SessionsList({
  failureType,
  onSelect,
  selectedId,
  showFilters = true,
}: SessionsListProps) {
  const [sessions, setSessions] = useState<RawSession[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessionsByType(failureType)
      .then((data) => setSessions(data as RawSession[]))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [failureType]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-sm py-12 text-foreground/60">
        <Loader2 className="size-5 animate-spin text-primary" />
        Fetching sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-sm py-12 text-foreground/60">
        <AlertCircle className="size-6 mb-3 opacity-50" />
        <p>No sessions ingested yet.</p>
        <p className="mt-1 text-xs opacity-70">Pull traces from the dashboard first.</p>
      </div>
    );
  }

  const filteredSessions = sessions.filter(s => {
    if (dateFilter && s.timestamp) {
      const sessionDate = new Date(s.timestamp).toISOString().slice(0, 10);
      if (sessionDate !== dateFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.session_id.toLowerCase().includes(q) ||
        s.agent_id.toLowerCase().includes(q) ||
        (s.failure_summary?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 mb-3 space-y-2">
        {showFilters && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="flex-1 py-1 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground/80"
              />
              {dateFilter && (
                <button
                  onClick={() => setDateFilter("")}
                  className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 rounded border hover:bg-muted transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}
        <p className="text-xs font-medium text-foreground/60 uppercase tracking-wider">
          {filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""}
        </p>
      </div>
      
      <FadeInStagger className="flex flex-col gap-1 overflow-y-auto px-1 pb-2">
        {filteredSessions.length === 0 ? (
          <FadeInItem><div className="text-center py-4 text-xs text-foreground/50">No matches</div></FadeInItem>
        ) : (
          filteredSessions.map((s) => {
            const isSelected = s.session_id === selectedId;
            const eventCount =
              (s.llm_calls?.length ?? 0) +
              (s.tool_calls?.length ?? 0) +
              (s.retrieval_events?.length ?? 0);
              
            return (
              <FadeInItem key={s.session_id}>
                <button
                  onClick={() => onSelect(s)}
                  className={`w-full group flex flex-col text-left rounded-md border p-2.5 transition-all duration-200 ${
                    isSelected
                      ? "border-primary/50 bg-primary/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-primary/20"
                      : "border-transparent bg-transparent hover:border-border hover:bg-muted/40"
                  }`}
                >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium uppercase tracking-wider shrink-0 ${isSelected ? 'bg-primary/20 text-primary' : 'bg-muted text-foreground/70 group-hover:text-primary'}`}>
                      {s.agent_id}
                    </span>
                    <SourceBadge source={s.trace_source} />
                  </div>
                  {s.timestamp && (
                    <span className="text-xs text-foreground/50 flex items-center gap-1 shrink-0">
                      <Clock className="size-3" />
                      {formatTimestamp(s.timestamp)}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center justify-between w-full mb-1">
                  <span className={`text-xs font-mono truncate pr-2 ${isSelected ? 'text-primary font-medium' : 'text-foreground/70 font-normal'}`}>
                    {s.session_id}
                  </span>
                  <ChevronRight className={`size-3 shrink-0 transition-transform duration-300 ${isSelected ? 'text-primary translate-x-0.5' : 'text-foreground/30 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5'}`} />
                </div>
                
                <div className="flex items-center justify-end w-full mt-1.5">
                  <span className="flex items-center gap-1 text-xs text-foreground/50 shrink-0">
                    <Layers className="size-3" /> {eventCount}
                  </span>
                </div>
                </button>
              </FadeInItem>
            );
          })
        )}
      </FadeInStagger>
    </div>
  );
}
