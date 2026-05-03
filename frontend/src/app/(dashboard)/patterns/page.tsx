"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Network, RefreshCw, AlertCircle, BrainCircuit, Wrench,
  ShieldAlert, ScanSearch, Bot, Cpu, MapPin, Layers,
} from "lucide-react";
import { fetchPatterns, type PatternsData } from "@/lib/api";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  memory:        { label: "Memory",        color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-400/60",    icon: BrainCircuit },
  tool_misfire:  { label: "Tool Misfire",  color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-500/10",   border: "border-amber-400/60",   icon: Wrench       },
  hallucination: { label: "Hallucination", color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-400/60",    icon: ShieldAlert  },
  blind_spot:    { label: "Blind Spot",    color: "text-purple-600 dark:text-purple-400",bg: "bg-purple-500/10",  border: "border-purple-400/60",  icon: ScanSearch   },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return <span className="text-xs text-muted-foreground">{type}</span>;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon className="size-3" />{cfg.label}
    </span>
  );
}

export default function PatternsPage() {
  const [data, setData] = useState<PatternsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchPatterns()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Aggregate per-agent totals
  const agentSummary = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { agent: string; total: number; total_sessions: number; breakdown: Record<string, number> }>();
    for (const row of data.agent_failures) {
      if (!map.has(row.agent)) map.set(row.agent, { agent: row.agent, total: 0, total_sessions: row.total_sessions ?? 0, breakdown: {} });
      const entry = map.get(row.agent)!;
      entry.total += row.count;
      if (row.total_sessions > entry.total_sessions) entry.total_sessions = row.total_sessions;
      entry.breakdown[row.failure_type] = (entry.breakdown[row.failure_type] ?? 0) + row.count;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  // Aggregate per-model totals
  const modelSummary = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { model: string; total: number; breakdown: Record<string, number> }>();
    for (const row of data.model_failures) {
      if (!map.has(row.model)) map.set(row.model, { model: row.model, total: 0, breakdown: {} });
      const entry = map.get(row.model)!;
      entry.total += row.count;
      entry.breakdown[row.failure_type] = (entry.breakdown[row.failure_type] ?? 0) + row.count;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground gap-2">
        <RefreshCw className="size-5 animate-spin" /><span>Loading patterns…</span>
      </div>
    );
  }

  if (!data?.neo4j_available) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-3">
        <Network className="size-12 text-muted-foreground/30" />
        <h3 className="text-lg font-semibold">Neo4j unavailable</h3>
        <p className="text-sm text-muted-foreground max-w-sm">Graph patterns require a connected Neo4j instance. Check your <code>NEO4J_URI</code> configuration.</p>
      </div>
    );
  }

  const isEmpty = data.clusters.length === 0 && data.blind_spots.length === 0 && data.agent_failures.length === 0;
  if (isEmpty) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20"><Network className="size-6" /></div>
            Pattern Clusters
          </h2>
          <p className="text-muted-foreground text-sm">Cross-session patterns from the knowledge graph — systemic issues that repeat across traces.</p>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center border border-dashed rounded-2xl bg-muted/5 p-12 gap-3">
          <Network className="size-12 text-muted-foreground/20" />
          <h3 className="text-lg font-semibold text-foreground">Graph is empty</h3>
          <p className="text-sm text-muted-foreground max-w-sm">Neo4j is connected but no sessions have been ingested yet. Pull traces from the Overview to populate the graph.</p>
          <a href="/overview" className="mt-2 text-xs text-primary hover:underline font-medium">Go to Overview → Pull Traces</a>
        </div>
      </div>
    );
  }

  const totalClusters = data.clusters.reduce((s, c) => s + c.session_count, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
              <Network className="size-6" />
            </div>
            Pattern Clusters
          </h2>
          <p className="text-muted-foreground text-sm">
            Cross-session patterns from the knowledge graph — systemic issues that repeat across traces.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-xl border bg-muted/20 hover:bg-muted/50 transition-colors disabled:opacity-50">
          <RefreshCw className={`size-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Failure Clusters",   value: data.clusters.length,       icon: Layers,   color: "text-primary" },
          { label: "Sessions in Graph",  value: totalClusters,              icon: Network,  color: "text-primary" },
          { label: "Recurring Blind Spots", value: data.blind_spots.filter(b => b.count > 1).length, icon: MapPin, color: "text-purple-600 dark:text-purple-400" },
          { label: "Agents Tracked",     value: agentSummary.length,        icon: Bot,      color: "text-primary" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-border/50 bg-card p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`size-4 ${color}`} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            </div>
            <p className="text-3xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Failure Clusters */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h3 className="font-semibold tracking-tight">Failure Clusters</h3>
          </div>
          <div className="p-4 space-y-3">
            {data.clusters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No clusters yet — pull traces to populate the graph.</p>
            ) : (
              <FadeInStagger>
                {data.clusters.map(c => {
                  const cfg = TYPE_CONFIG[c.failure_type];
                  const Icon = cfg?.icon ?? Network;
                  return (
                    <FadeInItem key={c.failure_type}>
                      <div className={`rounded-xl border-l-4 ${cfg?.border ?? "border-border"} ${cfg?.bg ?? "bg-muted/10"} p-4`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className={`size-4 ${cfg?.color ?? "text-muted-foreground"}`} />
                            <span className={`font-semibold text-sm ${cfg?.color ?? "text-foreground"}`}>{cfg?.label ?? c.failure_type}</span>
                          </div>
                          <span className="text-lg font-bold text-foreground">{c.session_count} sessions</span>
                        </div>
                        {c.agents.length > 0 && (
                          <p className="text-xs text-muted-foreground">Agents: {c.agents.join(", ")}</p>
                        )}
                        {c.sample_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.sample_ids.map(id => (
                              <Link key={id} href={`/traces?ids=${id}`}
                                className="text-[10px] font-mono text-primary hover:underline truncate max-w-[120px]">
                                {id.slice(0, 14)}…
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </FadeInItem>
                  );
                })}
              </FadeInStagger>
            )}
          </div>
        </div>

        {/* Recurring Blind Spots */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
            <MapPin className="size-4 text-purple-500" />
            <h3 className="font-semibold tracking-tight">Recurring Blind Spots</h3>
            <span className="text-xs text-muted-foreground ml-auto">Topics with 0 retrieval results across multiple sessions</span>
          </div>
          <div className="p-4 space-y-2">
            {data.blind_spots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recurring blind spots detected.</p>
            ) : (
              <FadeInStagger>
                {data.blind_spots.map((b, i) => (
                  <FadeInItem key={i}>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-400/20 bg-purple-500/5 px-4 py-3">
                      <p className="text-sm text-foreground truncate font-medium">{b.topic}</p>
                      <span className="shrink-0 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-400/30 px-2 py-0.5 rounded-full">
                        {b.count}×
                      </span>
                    </div>
                  </FadeInItem>
                ))}
              </FadeInStagger>
            )}
          </div>
        </div>

        {/* Agent Failure Breakdown */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <h3 className="font-semibold tracking-tight">Agent Failure Breakdown</h3>
          </div>
          <div className="p-4 space-y-3">
            {agentSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No agent failure data in graph.</p>
            ) : (
              <FadeInStagger>
                {agentSummary.map(a => (
                  <FadeInItem key={a.agent}>
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="size-4 text-muted-foreground" />
                          <span className="font-medium text-sm text-foreground">{a.agent}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-foreground">{a.total} failures</span>
                          {a.total_sessions > 0 && (
                            <span className="text-xs text-muted-foreground ml-1.5">
                              ({Math.round((a.total / a.total_sessions) * 100)}% of {a.total_sessions})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(a.breakdown).map(([type, cnt]) => (
                          <Link key={type} href={`/traces?type=${type}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all hover:opacity-80 ${TYPE_CONFIG[type]?.bg ?? "bg-muted"} ${TYPE_CONFIG[type]?.border ?? "border-border"} ${TYPE_CONFIG[type]?.color ?? "text-foreground"}`}>
                            {TYPE_CONFIG[type]?.label ?? type}: {cnt}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </FadeInItem>
                ))}
              </FadeInStagger>
            )}
          </div>
        </div>

        {/* Model Failure Breakdown */}
        <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/10 flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            <h3 className="font-semibold tracking-tight">Model Failure Breakdown</h3>
          </div>
          <div className="p-4 space-y-3">
            {modelSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No model failure data in graph.</p>
            ) : (
              <FadeInStagger>
                {modelSummary.map(m => (
                  <FadeInItem key={m.model}>
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Cpu className="size-4 text-muted-foreground" />
                          <span className="font-mono text-sm font-medium text-foreground">{m.model}</span>
                        </div>
                        <span className="text-sm font-bold text-foreground">{m.total} failures</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(m.breakdown).map(([type, cnt]) => (
                          <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${TYPE_CONFIG[type]?.bg ?? "bg-muted"} ${TYPE_CONFIG[type]?.border ?? "border-border"} ${TYPE_CONFIG[type]?.color ?? "text-foreground"}`}>
                            {TYPE_CONFIG[type]?.label ?? type}: {cnt}
                          </span>
                        ))}
                      </div>
                    </div>
                  </FadeInItem>
                ))}
              </FadeInStagger>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
