"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart,
} from "recharts";
import { TrendingUp, BrainCircuit, Wrench, ShieldAlert, ScanSearch, RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { fetchTrends, type TrendPoint } from "@/lib/api";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const FAILURE_TYPES = [
  { key: "memory"        as const, label: "Memory",        color: "#3b82f6", icon: BrainCircuit, border: "border-blue-400",   bg: "bg-blue-500/5",   text: "text-blue-600 dark:text-blue-400"   },
  { key: "tool_misfire"  as const, label: "Tool Misfire",  color: "#f59e0b", icon: Wrench,       border: "border-amber-400",  bg: "bg-amber-500/5",  text: "text-amber-600 dark:text-amber-400" },
  { key: "hallucination" as const, label: "Hallucination", color: "#f43f5e", icon: ShieldAlert,  border: "border-rose-400",   bg: "bg-rose-500/5",   text: "text-rose-600 dark:text-rose-400"   },
  { key: "blind_spot"    as const, label: "Blind Spot",    color: "#a855f7", icon: ScanSearch,   border: "border-purple-400", bg: "bg-purple-500/5", text: "text-purple-600 dark:text-purple-400"},
] as const;

const WINDOWS = [
  { label: "7d",  days: 7  },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function fmt(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TrendBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="size-3" /> No change</span>;
  if (prev === 0) return <span className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-0.5"><ArrowUpRight className="size-3" /> New</span>;
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="size-3" /> Flat</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${up ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

const CHART_TYPE_KEYS = ["memory", "tool_misfire", "hallucination", "blind_spot"] as const;

export default function TrendsPage() {
  const router = useRouter();
  const [data, setData] = useState<TrendPoint[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState<Set<string>>(new Set(FAILURE_TYPES.map(t => t.key)));

  const load = (d: number) => {
    setLoading(true);
    fetchTrends(d)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(days); }, [days]);

  // Summary cards: compare first half vs second half of window
  const summaryStats = useMemo(() => {
    if (data.length === 0) return FAILURE_TYPES.map(t => ({ ...t, total: 0, recent: 0, prev: 0 }));
    const mid = Math.floor(data.length / 2);
    const first = data.slice(0, mid);
    const second = data.slice(mid);
    return FAILURE_TYPES.map(t => ({
      ...t,
      total:  data.reduce((s, p) => s + p[t.key], 0),
      recent: second.reduce((s, p) => s + p[t.key], 0),
      prev:   first.reduce((s, p) => s + p[t.key], 0),
    }));
  }, [data]);

  // Preserve isoDate alongside formatted label so click handler can build URLs
  const chartData = data.map(p => ({ ...p, isoDate: p.date, date: fmt(p.date) }));

  const handleChartClick = useCallback((chartEvent: Record<string, unknown>) => {
    if (!chartEvent?.activePayload) return;
    const payloads = chartEvent.activePayload as { dataKey: string; value: number; payload: Record<string, unknown> }[];
    const isoDate = payloads[0]?.payload?.isoDate as string | undefined;
    if (!isoDate) return;
    const nonZero = payloads.filter(p => CHART_TYPE_KEYS.includes(p.dataKey as typeof CHART_TYPE_KEYS[number]) && p.value > 0);
    const params = new URLSearchParams({ dateFrom: isoDate, dateTo: isoDate });
    if (nonZero.length === 1) params.set("type", nonZero[0].dataKey);
    router.push(`/traces?${params.toString()}`);
  }, [router]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
              <TrendingUp className="size-6" />
            </div>
            Failure Trends
          </h2>
          <p className="text-muted-foreground text-sm">
            Track how each failure type evolves over time — spot regressions before they compound.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border overflow-hidden bg-muted/20">
            {WINDOWS.map(w => (
              <button key={w.days} onClick={() => setDays(w.days)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${days === w.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                {w.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(days)} disabled={loading}
            className="p-2 rounded-xl border bg-muted/20 hover:bg-muted/50 transition-colors disabled:opacity-50">
            <RefreshCw className={`size-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <FadeInStagger>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryStats.map(t => {
            const Icon = t.icon;
            return (
              <FadeInItem key={t.key}>
                <SpotlightCard>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2 rounded-xl border ${t.border} ${t.bg}`}>
                      <Icon className={`size-4 ${t.text}`} />
                    </div>
                    <TrendBadge current={t.recent} prev={t.prev} />
                  </div>
                  <p className="text-2xl font-bold text-foreground">{t.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.label} · {days}d total</p>
                </SpotlightCard>
              </FadeInItem>
            );
          })}
        </div>
      </FadeInStagger>

      {/* Main chart */}
      <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/10 flex items-center justify-between">
          <div>
            <h3 className="font-semibold tracking-tight">Failure Rate Over Time</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Daily failure counts by type</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {FAILURE_TYPES.map(t => (
              <button key={t.key}
                onClick={() => setVisible(prev => {
                  const next = new Set(prev);
                  next.has(t.key) ? next.delete(t.key) : next.add(t.key);
                  return next;
                })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${visible.has(t.key) ? `${t.border} ${t.bg} ${t.text}` : "border-border/40 bg-background text-foreground/40"}`}>
                <span className="size-2 rounded-full shrink-0" style={{ background: t.color }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              <RefreshCw className="size-4 animate-spin mr-2" /> Loading trend data…
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
              <TrendingUp className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No data for this window.</p>
              <p className="text-xs text-muted-foreground/60">Pull traces to populate trend data.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                onClick={handleChartClick} style={{ cursor: "pointer" }}>
                <defs>
                  {FAILURE_TYPES.map(t => (
                    <linearGradient key={t.key} id={`grad-${t.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={t.color} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={t.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                  labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                />
                {FAILURE_TYPES.filter(t => visible.has(t.key)).map(t => (
                  <Area key={t.key} type="monotone" dataKey={t.key} name={t.label}
                    stroke={t.color} strokeWidth={2} fill={`url(#grad-${t.key})`}
                    dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-type detail cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {summaryStats.map(t => {
          const Icon = t.icon;
          const typeData = data.map(p => ({ date: fmt(p.date), count: p[t.key] }));
          const peak = Math.max(...typeData.map(d => d.count), 0);
          const peakDay = typeData.find(d => d.count === peak)?.date ?? "—";
          const avg = data.length ? (t.total / data.length).toFixed(1) : "0";
          const daysWithFailure = data.filter(p => p[t.key] > 0).length;
          return (
            <FadeInItem key={t.key}>
              <div className={`rounded-2xl border-l-4 ${t.border} ${t.bg} border border-border/50 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Icon className={`size-4 ${t.text}`} />
                    <h4 className={`font-semibold ${t.text}`}>{t.label}</h4>
                  </div>
                  <TrendBadge current={t.recent} prev={t.prev} />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
                    <p className="text-xl font-bold text-foreground">{t.total}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Daily Avg</p>
                    <p className="text-xl font-bold text-foreground">{avg}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Days w/ Failure</p>
                    <p className="text-xl font-bold text-foreground">{daysWithFailure}</p>
                  </div>
                </div>
                {peak > 0 && (
                  <p className="text-xs text-muted-foreground">Peak: <span className="font-medium text-foreground">{peak} on {peakDay}</span></p>
                )}
                <div className="mt-3 h-14">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={typeData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`mini-${t.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={t.color} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={t.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="count" stroke={t.color} strokeWidth={1.5}
                        fill={`url(#mini-${t.key})`} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </FadeInItem>
          );
        })}
      </div>
    </div>
  );
}
