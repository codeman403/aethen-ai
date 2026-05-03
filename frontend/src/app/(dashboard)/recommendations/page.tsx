"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Lightbulb, RefreshCw, BrainCircuit, Wrench, ShieldAlert,
  ScanSearch, AlertTriangle, Filter,
} from "lucide-react";
import { fetchRecommendations, type RecommendationItem } from "@/lib/api";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  memory:        { label: "Memory",        color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-400/60",    icon: BrainCircuit },
  tool_misfire:  { label: "Tool Misfire",  color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-500/10",   border: "border-amber-400/60",   icon: Wrench       },
  hallucination: { label: "Hallucination", color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-400/60",    icon: ShieldAlert  },
  blind_spot:    { label: "Blind Spot",    color: "text-purple-600 dark:text-purple-400",bg: "bg-purple-500/10",  border: "border-purple-400/60",  icon: ScanSearch   },
};

const SEV_CONFIG: Record<string, { border: string; icon_color: string; badge: string }> = {
  critical: { border: "border-l-rose-600",   icon_color: "text-rose-600",   badge: "bg-rose-500/10 text-rose-600 border-rose-400/40"   },
  high:     { border: "border-l-rose-500",   icon_color: "text-rose-500",   badge: "bg-rose-500/10 text-rose-500 border-rose-400/30"   },
  medium:   { border: "border-l-amber-500",  icon_color: "text-amber-500",  badge: "bg-amber-500/10 text-amber-600 border-amber-400/30" },
  low:      { border: "border-l-blue-400",   icon_color: "text-blue-400",   badge: "bg-blue-500/10 text-blue-500 border-blue-400/30"   },
};

function formatTs(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RecommendationsPage() {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSev, setFilterSev] = useState<string>("all");

  const load = () => {
    setLoading(true);
    fetchRecommendations()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => items.filter(i => {
    if (filterType !== "all" && i.failure_type !== filterType) return false;
    if (filterSev !== "all" && i.severity !== filterSev) return false;
    return true;
  }), [items, filterType, filterSev]);

  const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  // Deduplicate by recommendation text, then sort by severity
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    return filtered
      .filter(i => {
        const key = i.recommendation.toLowerCase().slice(0, 80);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      })
      .sort((a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4));
  }, [filtered]);

  const sevCounts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of items) c[i.severity] = (c[i.severity] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
              <Lightbulb className="size-6" />
            </div>
            Recommendations
          </h2>
          <p className="text-muted-foreground text-sm">
            Synthesised actions from analysis reports — prioritised by severity across all sessions.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-xl border bg-muted/20 hover:bg-muted/50 transition-colors disabled:opacity-50">
          <RefreshCw className={`size-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {(["critical","high","medium","low"] as const).map(sev => {
          const cfg = SEV_CONFIG[sev];
          return (
            <div key={sev} className="rounded-2xl border border-border/50 bg-card p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className={`size-4 ${cfg.icon_color}`} />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider capitalize">{sev}</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{sevCounts[sev] ?? 0}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="size-4 text-muted-foreground" />
        <div className="flex gap-1 flex-wrap">
          {[["all","All Types"], ...Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.label])].map(([v, l]) => (
            <button key={v} onClick={() => setFilterType(v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${filterType === v ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 bg-background text-foreground/60 hover:bg-muted/60"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex gap-1">
          {[["all","All Sev"], ["critical","Critical"], ["high","High"], ["medium","Medium"], ["low","Low"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterSev(v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${filterSev === v ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 bg-background text-foreground/60 hover:bg-muted/60"}`}>
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{deduped.length} unique actions</span>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px] text-muted-foreground gap-2">
          <RefreshCw className="size-5 animate-spin" /><span>Loading recommendations…</span>
        </div>
      ) : deduped.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-3">
          <Lightbulb className="size-12 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold">No recommendations yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">Run analyses on sessions to generate actionable recommendations.</p>
        </div>
      ) : (
        <FadeInStagger className="space-y-3">
          {deduped.map((item, i) => {
            const sev = SEV_CONFIG[item.severity] ?? SEV_CONFIG.medium;
            const type = TYPE_CONFIG[item.failure_type ?? ""];
            const TypeIcon = type?.icon;
            return (
              <FadeInItem key={i}>
                <div className={`rounded-xl border-l-4 ${sev.border} border border-border/50 bg-card p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all`}>
                  <div className="flex items-start gap-4">
                    <AlertTriangle className={`size-5 shrink-0 mt-0.5 ${sev.icon_color}`} />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground text-sm">{item.title}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sev.badge}`}>{item.severity}</span>
                        {type && TypeIcon && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${type.bg} ${type.border} ${type.color}`}>
                            <TypeIcon className="size-2.5" />{type.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">→ {item.recommendation}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{item.agent_id}</span>
                        {item.session_ts && <span>· {formatTs(item.session_ts)}</span>}
                        <Link href={`/traces?ids=${item.session_id}`}
                          className="ml-auto text-primary hover:underline">View session →</Link>
                      </div>
                    </div>
                  </div>
                </div>
              </FadeInItem>
            );
          })}
        </FadeInStagger>
      )}
    </div>
  );
}
