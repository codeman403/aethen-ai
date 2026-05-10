"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  BrainCircuit,
  Wrench,
  ScanSearch,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { fetchDashboardStats, fetchTrends, type DashboardStats, type TrendPoint } from "@/lib/api";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";

import { SpotlightCard } from "@/components/ui/spotlight-card";
import { FadeInStagger, FadeInItem } from "@/components/ui/fade-in";
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const CHART_TYPES = ["memory", "tool_misfire", "hallucination", "blind_spot"] as const;

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { void loadStats(); }, 0);
    const interval = setInterval(() => { void loadStats(false); }, 60_000);
    fetchTrends(7).then(setTrendData).catch(() => {});
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  const fb  = stats?.failure_breakdown;
  const dbt = stats?.daily_by_type;
  const total = stats?.total_sessions ?? 0;

  const cards = [
    {
      label: "Total Traces",
      value: total,
      description: "All ingested sessions",
      icon: Activity,
      trend: (stats?.today_sessions ?? 0) > 0 ? `+${stats!.today_sessions} today` : "None today",
      positive: true,
      href: "/traces",
    },
    {
      label: "Memory Failures",
      value: fb?.memory ?? 0,
      description: "Retrieval issues detected",
      icon: BrainCircuit,
      trend: (dbt?.memory ?? 0) > 0 ? `+${dbt!.memory} today` : "None today",
      positive: (dbt?.memory ?? 0) === 0,
      href: "/traces?type=memory",
    },
    {
      label: "Tool Misfires",
      value: fb?.tool_misfire ?? 0,
      description: "API/tool execution errors",
      icon: Wrench,
      trend: (dbt?.tool_misfire ?? 0) > 0 ? `+${dbt!.tool_misfire} today` : "None today",
      positive: (dbt?.tool_misfire ?? 0) === 0,
      href: "/traces?type=tool_misfire",
    },
    {
      label: "Hallucinations",
      value: fb?.hallucination ?? 0,
      description: "LLM factual errors detected",
      icon: ShieldAlert,
      trend: (dbt?.hallucination ?? 0) > 0 ? `+${dbt!.hallucination} today` : "None today",
      positive: (dbt?.hallucination ?? 0) === 0,
      href: "/traces?type=hallucination",
    },
    {
      label: "Blind Spots",
      value: fb?.blind_spot ?? 0,
      description: "Systemic knowledge gaps",
      icon: ScanSearch,
      trend: (dbt?.blind_spot ?? 0) > 0 ? `+${dbt!.blind_spot} today` : "None today",
      positive: (dbt?.blind_spot ?? 0) === 0,
      href: "/traces?type=blind_spot",
    },
  ];

  // Reliability Score — scoped to last 7 days
  const score      = stats?.reliability_score_7d ?? stats?.reliability_score ?? 100;
  const scoreColor = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score >= 80 ? "Healthy" : score >= 50 ? "Degraded" : "Critical";
  const scoreLabelColor = score >= 80
    ? "text-emerald-600 dark:text-emerald-400"
    : score >= 50 ? "text-amber-600 dark:text-amber-400"
    : "text-rose-600 dark:text-rose-400";
  const scoreBg = score >= 80
    ? "bg-emerald-500/10 border-emerald-500/20"
    : score >= 50 ? "bg-amber-500/10 border-amber-500/20"
    : "bg-rose-500/10 border-rose-500/20";

  const ARC_LEN    = 251.33;
  const fillLen    = (score / 100) * ARC_LEN;
  const totalFailed  = (fb?.memory ?? 0) + (fb?.tool_misfire ?? 0) + (fb?.hallucination ?? 0) + (fb?.blind_spot ?? 0);
  const totalSuccess = Math.max(0, total - totalFailed);

  const failureRows = [
    { label: "Memory Retrieval", value: fb?.memory       ?? 0, color: "bg-rose-500",   href: "/traces?type=memory" },
    { label: "Tool Misfires",    value: fb?.tool_misfire ?? 0, color: "bg-amber-500",  href: "/traces?type=tool_misfire" },
    { label: "Hallucinations",   value: fb?.hallucination ?? 0, color: "bg-orange-500", href: "/traces?type=hallucination" },
    { label: "Blind Spots",      value: fb?.blind_spot   ?? 0, color: "bg-blue-500",   href: "/traces?type=blind_spot" },
  ];

  // Stacked failure chart — fill last 7 UTC days (matches backend DATE_TRUNC and filter)
  const chartData = (() => {
    const days: { date: string; label: string; memory: number; tool_misfire: number; hallucination: number; blind_spot: number; failure_rate: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const utcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i);
      const iso = new Date(utcMs).toISOString().slice(0, 10);
      const label = new Date(utcMs).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const pt = trendData.find(p => p.date === iso);
      const mem = pt?.memory ?? 0;
      const tool = pt?.tool_misfire ?? 0;
      const hall = pt?.hallucination ?? 0;
      const blind = pt?.blind_spot ?? 0;
      const totalFail = mem + tool + hall + blind;
      const total = pt?.total ?? 0;
      const failure_rate = total > 0 ? Math.round((totalFail / total) * 100) : 0;
      days.push({ date: iso, label, memory: mem, tool_misfire: tool, hallucination: hall, blind_spot: blind, failure_rate });
    }
    return days;
  })();
  const hasAnyFailure = chartData.some(d => d.memory + d.tool_misfire + d.hallucination + d.blind_spot > 0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleChartClick = useCallback((ev: { activeTooltipIndex?: number | undefined }) => {
    const idx = ev?.activeTooltipIndex;
    if (idx === undefined || idx === null) return;
    const point = chartData[idx];
    if (!point) return;
    const nonZero = CHART_TYPES.filter(t => (point[t] ?? 0) > 0);
    const params = new URLSearchParams({ dateFrom: point.date, dateTo: point.date });
    if (nonZero.length === 1) params.set("type", nonZero[0]);
    router.push(`/traces?${params.toString()}`);
  }, [router, chartData]);

  // Data-driven alerts — only show entries that have real signal
  const alerts = [
    ...(dbt?.tool_misfire ? [{ title: "Tool Misfires Today",     type: "error",   desc: `${dbt.tool_misfire} tool call failure${dbt.tool_misfire !== 1 ? "s" : ""} in last 24h`, href: "/traces?type=tool_misfire" }] : []),
    ...(dbt?.hallucination ? [{ title: "Hallucinations Today",   type: "error",   desc: `${dbt.hallucination} hallucination${dbt.hallucination !== 1 ? "s" : ""} detected today`, href: "/traces?type=hallucination" }] : []),
    ...(dbt?.memory ? [{ title: "Memory Failures Today",         type: "warning", desc: `${dbt.memory} retrieval failure${dbt.memory !== 1 ? "s" : ""} in last 24h`, href: "/traces?type=memory" }] : []),
    ...(dbt?.blind_spot ? [{ title: "Blind Spots Today",         type: "warning", desc: `${dbt.blind_spot} knowledge gap${dbt.blind_spot !== 1 ? "s" : ""} detected`, href: "/traces?type=blind_spot" }] : []),
    { title: "Demo Agent",  type: "info", desc: "Generate live traces to populate the platform", href: "/demo-agent" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent text-foreground">Platform Overview</h2>
          <p className="text-muted-foreground text-base">
            Agent performance metrics and real-time failure intelligence.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Link href="/docs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            Get Started
          </Link>
          <button
            onClick={() => loadStats()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full border text-base font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30 p-4 text-base text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}


      {/* Onboarding checklist — hidden once all steps complete or dismissed */}
      <OnboardingChecklist />

      <FadeInStagger>
        {/* ── Metric Cards (all clickable) ───────────────────────────── */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => {
            const Icon      = card.icon;
            const TrendIcon = card.positive ? ArrowDownRight : ArrowUpRight;
            return (
              <FadeInItem key={card.label}>
                <Link href={card.href} className="block group">
                  <SpotlightCard className="h-full">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-medium text-muted-foreground group-hover:text-foreground transition-colors">{card.label}</p>
                      <div className={`p-2.5 rounded-2xl ${card.positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                        <Icon className="size-[18px]" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-baseline gap-2">
                      <div className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent h-9 flex items-center">
                        {loading ? <div className="h-8 w-20 bg-muted/60 animate-pulse rounded-xl" /> : <NumberTicker value={card.value} />}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {loading ? (
                        <div className="h-5 w-20 bg-muted/60 animate-pulse rounded-xl" />
                      ) : (
                        <span className={`flex items-center font-medium px-1.5 py-0.5 rounded-xl ${card.positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                          <TrendIcon className="mr-1 size-3" />{card.trend}
                        </span>
                      )}
                      <span className="text-muted-foreground">{card.description}</span>
                    </div>
                  </SpotlightCard>
                </Link>
              </FadeInItem>
            );
          })}
        </div>
      </FadeInStagger>

      <FadeInStagger className="space-y-8">
        <FadeInItem>
          {/* ── Reliability Score Gauge ───────────────────────────────────── */}
          <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/10 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg tracking-tight">Platform Reliability Score</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Sessions without a detected failure — last 7 days
                </p>
              </div>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${scoreBg} ${scoreLabelColor}`}>
                {scoreLabel}
              </span>
            </div>

            <div className="px-6 py-6 flex flex-col sm:flex-row items-center gap-8">
              {/* Gauge */}
              <div className="flex-shrink-0 flex flex-col items-center">
                <svg viewBox="0 0 200 110" className="w-52" aria-label={`Reliability score: ${score}`}>
                  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb"
                    strokeWidth="18" strokeLinecap="round" className="dark:opacity-20" />
                  <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={scoreColor}
                    strokeWidth="18" strokeLinecap="round"
                    strokeDasharray={`${fillLen} ${ARC_LEN}`}
                    style={{ transition: "stroke-dasharray 0.8s ease" }} />
                  <text x="100" y="84" textAnchor="middle" fontSize="38" fontWeight="bold"
                    fill="currentColor" className={`fill-foreground transition-opacity ${loading ? "opacity-30 animate-pulse" : "opacity-100"}`}>
                    {loading ? "—" : score}
                  </text>
                  <text x="100" y="102" textAnchor="middle" fontSize="11" fill="#6b7280">
                    out of 100
                  </text>
                </svg>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-rose-500 inline-block" />0–49 Critical</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500 inline-block" />50–79 Degraded</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500 inline-block" />80–100 Healthy</span>
                </div>
              </div>

              {/* Breakdown */}
              <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                {/* Successful → /traces */}
                <Link href="/traces?outcome=success"
                  className="rounded-2xl border bg-emerald-500/5 border-emerald-500/20 p-4 hover:bg-emerald-500/10 transition-colors group">
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Successful</p>
                  <div className="text-3xl font-bold h-9 flex items-center mt-1 mb-1">
                    {loading ? <div className="h-8 w-24 bg-emerald-500/20 animate-pulse rounded-xl" /> : <NumberTicker value={totalSuccess} />}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    sessions completed cleanly
                    <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>

                {/* Failures Detected → /traces */}
                <Link href="/traces?outcome=failure"
                  className="rounded-2xl border bg-rose-500/5 border-rose-500/20 p-4 hover:bg-rose-500/10 transition-colors group">
                  <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">Failures Detected</p>
                  <div className="text-3xl font-bold h-9 flex items-center mt-1 mb-1">
                    {loading ? <div className="h-8 w-24 bg-rose-500/20 animate-pulse rounded-xl" /> : <NumberTicker value={totalFailed} />}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    sessions with diagnosed failures
                    <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>

                {/* Failure breakdown rows — each links to its module */}
                <div className="col-span-2 rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Failure Breakdown — click to investigate
                  </p>
                  <div className="space-y-2">
                    {failureRows.map(({ label, value, color, href }) => {
                      const pct = totalFailed > 0 ? Math.round((value / totalFailed) * 100) : 0;
                      return (
                        <Link key={label} href={href}
                          className="flex items-center gap-3 py-0.5 rounded group hover:opacity-80 transition-opacity">
                          <span className="text-sm text-muted-foreground w-32 flex-shrink-0 group-hover:text-foreground transition-colors">
                            {label}
                          </span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-medium tabular-nums w-6 text-right">{value}</span>
                          <ChevronRight className="size-3 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 transition-colors" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeInItem>

        <FadeInItem>
          {/* ── Bottom row: chart + alerts ────────────────────────────────── */}
          <div className="grid gap-6 md:grid-cols-7">
            {/* Failure Distribution chart */}
            <div className="col-span-4 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg tracking-tight">Failure Distribution</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">Failure types by day — last 7 days</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href="/trends" className="text-sm font-medium text-primary flex items-center gap-1 hover:underline">
                    Full trends <ChevronRight className="size-3" />
                  </Link>
                </div>
              </div>

              {!hasAnyFailure ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-8">
                  <div className="size-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-1">
                    <Activity className="size-5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">No failures this week</p>
                  <p className="text-xs text-muted-foreground">All sessions completed without detected failures.</p>
                </div>
              ) : (
                <div className="flex-1 min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 40, left: -20, bottom: 0 }}
                      onClick={handleChartClick as never} style={{ cursor: "pointer" }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                        labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                        formatter={(value, name) => {
                          const n = String(name);
                          if (n === "failure_rate") return [`${value}%`, "Failure Rate"];
                          const labels: Record<string, string> = { memory: "Memory", tool_misfire: "Tool Misfire", hallucination: "Hallucination", blind_spot: "Blind Spot" };
                          return [value, labels[n] ?? n];
                        }}
                      />
                      <Legend
                        formatter={(value) => {
                          const labels: Record<string, string> = { memory: "Memory", tool_misfire: "Tool Misfire", hallucination: "Hallucination", blind_spot: "Blind Spot", failure_rate: "Failure Rate %" };
                          return <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{labels[value] ?? value}</span>;
                        }}
                      />
                      <Bar yAxisId="left" dataKey="memory"        stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
                      <Bar yAxisId="left" dataKey="tool_misfire"  stackId="a" fill="#f59e0b" radius={[0,0,0,0]} />
                      <Bar yAxisId="left" dataKey="hallucination" stackId="a" fill="#f43f5e" radius={[0,0,0,0]} />
                      <Bar yAxisId="left" dataKey="blind_spot"    stackId="a" fill="#a855f7" radius={[2,2,0,0]} />
                      <Line yAxisId="right" dataKey="failure_rate" stroke="#ef4444" strokeWidth={1.5}
                        dot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }} activeDot={{ r: 4 }}
                        strokeDasharray="4 2" type="monotone" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Recent Alerts — all items link to their module */}
            <div className="col-span-3 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 flex flex-col overflow-hidden">
              <div className="p-6 border-b flex items-center justify-between bg-muted/10">
                <div>
                  <h3 className="font-semibold text-lg tracking-tight">Recent Alerts</h3>
                  <p className="text-sm text-muted-foreground mt-1">System notifications and anomalies</p>
                </div>
                <Link href="/data-quality"
                  className="text-sm font-medium text-primary flex items-center gap-1 hover:underline">
                  Data Quality <ChevronRight className="size-3" />
                </Link>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {alerts.map((alert, i) => (
                  <Link key={i} href={alert.href}
                    className="flex items-start gap-4 p-4 rounded-2xl hover:bg-muted/50 transition-colors group">
                    <div className={`mt-0.5 size-2.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 flex-shrink-0 ${
                      alert.type === "error"   ? "bg-rose-500 shadow-rose-500/40" :
                      alert.type === "warning" ? "bg-amber-500 shadow-amber-500/40" :
                                                 "bg-blue-500 shadow-blue-500/40"
                    }`} />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-base font-medium leading-none text-foreground group-hover:text-primary transition-colors">
                          {alert.title}
                        </p>
                        <span className="text-[10px] font-medium text-muted-foreground capitalize">{alert.type}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.desc}</p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-primary flex-shrink-0 transition-colors mt-0.5" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </FadeInItem>
      </FadeInStagger>
    </div>
  );
}
