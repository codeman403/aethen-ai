"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot, RefreshCw, BrainCircuit, Wrench, ShieldAlert,
  ScanSearch, CheckCircle2, Clock,
} from "lucide-react";
import { fetchAgentProfiles, type AgentProfile } from "@/lib/api";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";

const TYPE_CONFIG = [
  { key: "memory"        as const, label: "Memory",        color: "#3b82f6", icon: BrainCircuit, border: "border-blue-400/60",   bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400"    },
  { key: "tool_misfire"  as const, label: "Tool Misfire",  color: "#f59e0b", icon: Wrench,       border: "border-amber-400/60",  bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400"  },
  { key: "hallucination" as const, label: "Hallucination", color: "#f43f5e", icon: ShieldAlert,  border: "border-rose-400/60",   bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400"    },
  { key: "blind_spot"    as const, label: "Blind Spot",    color: "#a855f7", icon: ScanSearch,   border: "border-purple-400/60", bg: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400"},
] as const;

function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score);
  const color = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const textColor = pct >= 75 ? "text-emerald-600 dark:text-emerald-400" : pct >= 50 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
  return (
    <div className="relative size-16 flex items-center justify-center">
      <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${(pct / 100) * 94.25} 94.25`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <span className={`text-xs font-bold ${textColor}`}>{pct}%</span>
    </div>
  );
}

function formatTs(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function AgentsPage() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AgentProfile | null>(null);

  const load = () => {
    setLoading(true);
    fetchAgentProfiles()
      .then(p => { setProfiles(p); if (p.length > 0) setSelected(p[0]); })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
              <Bot className="size-6" />
            </div>
            Agent Profiles
          </h2>
          <p className="text-muted-foreground text-sm">
            Per-agent failure breakdown — identify which agents are most error-prone and why.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-xl border bg-muted/20 hover:bg-muted/50 transition-colors disabled:opacity-50">
          <RefreshCw className={`size-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px] text-muted-foreground gap-2">
          <RefreshCw className="size-5 animate-spin" /><span>Loading agent profiles…</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center gap-3">
          <Bot className="size-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No agents found. Pull traces to populate agent data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left: agent list */}
          <div className="xl:col-span-4 sticky top-6 rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/10">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{profiles.length} agents tracked</p>
            </div>
            <FadeInStagger className="flex flex-col divide-y divide-border/50 max-h-[600px] overflow-y-auto">
              {profiles.map(p => {
                const isSelected = selected?.agent_id === p.agent_id;
                const scoreColor = p.success_rate >= 75 ? "text-emerald-600 dark:text-emerald-400" : p.success_rate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
                return (
                  <FadeInItem key={p.agent_id}>
                    <button onClick={() => setSelected(p)}
                      className={`w-full text-left px-4 py-3 transition-all hover:bg-muted/40 ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="size-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {p.agent_id.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>{p.agent_id}</p>
                            <p className="text-[10px] text-muted-foreground">{p.total} sessions</p>
                          </div>
                        </div>
                        <span className={`text-sm font-bold shrink-0 ${scoreColor}`}>{Math.round(p.success_rate)}%</span>
                      </div>
                      {p.total_failures > 0 && (
                        <div className="flex gap-1 mt-1.5 pl-9">
                          {TYPE_CONFIG.filter(t => p[t.key] > 0).map(t => (
                            <span key={t.key} className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.bg} ${t.text} font-medium`}>
                              {p[t.key]}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </FadeInItem>
                );
              })}
            </FadeInStagger>
          </div>

          {/* Right: detail */}
          {selected && (
            <div className="xl:col-span-8 space-y-5">
              {/* Header card */}
              <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-lg font-bold">
                      {selected.agent_id.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{selected.agent_id}</h3>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{selected.total} total sessions</span>
                        <span>·</span>
                        <span className="flex items-center gap-1"><Clock className="size-3" />Last seen {formatTs(selected.last_seen)}</span>
                      </div>
                    </div>
                  </div>
                  <ScoreRing score={selected.success_rate} />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Sessions</p>
                    <p className="text-2xl font-bold text-foreground">{selected.total}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Failures</p>
                    <p className="text-2xl font-bold text-rose-600">{selected.total_failures}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Success Rate</p>
                    <p className={`text-2xl font-bold ${selected.success_rate >= 75 ? "text-emerald-600" : selected.success_rate >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                      {Math.round(selected.success_rate)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Failure breakdown */}
              <div className="grid grid-cols-2 gap-4">
                {TYPE_CONFIG.map(t => {
                  const Icon = t.icon;
                  const count = selected[t.key];
                  const pct = selected.total > 0 ? Math.round((count / selected.total) * 100) : 0;
                  return (
                    <Link key={t.key} href={`/traces?type=${t.key}`}
                      className={`rounded-2xl border-l-4 ${t.border} ${t.bg} border border-border/30 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-md transition-all hover:scale-[1.02] group`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon className={`size-4 ${t.text}`} />
                          <span className={`text-sm font-semibold ${t.text}`}>{t.label}</span>
                        </div>
                        {count === 0 && <CheckCircle2 className="size-4 text-emerald-500" />}
                      </div>
                      <p className="text-3xl font-bold text-foreground">{count}</p>
                      <p className="text-xs text-muted-foreground mt-1">{pct}% of all sessions</p>
                      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: t.color }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
