"use client";

import { useEffect, useState } from "react";
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
  Zap,
  ChevronRight,
} from "lucide-react";
import { fetchDashboardStats, pullLangfuseTraces, type DashboardStats } from "@/lib/api";

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pullResult, setPullResult] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  const handleLangfusePull = async () => {
    try {
      setPulling(true);
      setError(null);
      setPullResult(null);
      const result = await pullLangfuseTraces(20);
      await loadStats();
      if (result.errors.length > 0) {
        setError(`Ingested ${result.sessions_ingested} sessions with ${result.errors.length} errors: ${result.errors[0]}`);
      } else if (result.sessions_ingested === 0) {
        setPullResult("No new traces found in Langfuse.");
      } else {
        setPullResult(`✓ Ingested ${result.sessions_ingested} sessions (${result.events_processed} events) from Langfuse.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Langfuse pull failed");
    } finally {
      setPulling(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const fb    = stats?.failure_breakdown;
  const total = stats?.total_sessions ?? 0;

  const cards = [
    {
      label: "Total Traces",
      value: total.toLocaleString(),
      description: `${stats?.recent_sessions ?? 0} in last 7 days`,
      icon: Activity,
      trend: stats?.recent_sessions ? `+${stats.recent_sessions}` : "—",
      positive: true,
      href: "/traces",                         // ← was null
    },
    {
      label: "Memory Failures",
      value: (fb?.memory ?? 0).toLocaleString(),
      description: "Retrieval issues detected",
      icon: BrainCircuit,
      trend: fb?.memory ? `${fb.memory}` : "0",
      positive: (fb?.memory ?? 0) === 0,
      href: "/memory-debug",
    },
    {
      label: "Tool Misfires",
      value: (fb?.tool_misfire ?? 0).toLocaleString(),
      description: "API/tool execution errors",
      icon: Wrench,
      trend: fb?.tool_misfire ? `${fb.tool_misfire}` : "0",
      positive: (fb?.tool_misfire ?? 0) === 0,
      href: "/tool-misfire",
    },
    {
      label: "Hallucinations",
      value: (fb?.hallucination ?? 0).toLocaleString(),
      description: "LLM factual errors detected",
      icon: ShieldAlert,
      trend: fb?.hallucination ? `${fb.hallucination}` : "0",
      positive: (fb?.hallucination ?? 0) === 0,
      href: "/hallucination-rca",
    },
    {
      label: "Blind Spots",
      value: (fb?.blind_spot ?? 0).toLocaleString(),
      description: "Systemic knowledge gaps",
      icon: ScanSearch,
      trend: fb?.blind_spot ? `${fb.blind_spot}` : "0",
      positive: (fb?.blind_spot ?? 0) === 0,
      href: "/blind-spots",
    },
  ];

  // Reliability Score
  const score      = stats?.reliability_score ?? 100;
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
    { label: "Memory Retrieval", value: fb?.memory      ?? 0, color: "bg-rose-500",   href: "/memory-debug" },
    { label: "Tool Misfires",    value: fb?.tool_misfire ?? 0, color: "bg-amber-500",  href: "/tool-misfire" },
    { label: "Hallucinations",   value: fb?.hallucination ?? 0, color: "bg-orange-500", href: "/hallucination-rca" },
    { label: "Blind Spots",      value: fb?.blind_spot   ?? 0, color: "bg-blue-500",   href: "/blind-spots" },
  ];

  // Bar chart
  const dailyCounts = stats?.daily_counts ?? [0, 0, 0, 0, 0, 0, 0];
  const maxCount    = Math.max(...dailyCounts, 1);
  const barHeights  = dailyCounts.map((c) => Math.max(5, (c / maxCount) * 100));

  const alerts = [
    { title: "Spike in Tool Misfires",        time: "10 mins ago",  type: "error",   desc: `${fb?.tool_misfire ?? 0} tool failures detected`,  href: "/tool-misfire" },
    { title: "New Blind Spot Cluster",         time: "2 hours ago",  type: "warning", desc: `${fb?.blind_spot ?? 0} blind spot sessions`,       href: "/blind-spots" },
    { title: "Memory Debug Opportunities",     time: "5 hours ago",  type: "warning", desc: `${fb?.memory ?? 0} memory failures to review`,     href: "/memory-debug" },
    { title: "Langfuse Live Mode",             time: "Active",       type: "info",    desc: "Generate traces via the Demo Agent",               href: "/demo-agent" },
  ];

  const cardCls = "relative overflow-hidden rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-all hover:shadow-md hover:border-primary/20 group cursor-pointer";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Platform Overview</h2>
          <p className="text-muted-foreground text-sm">
            Agent performance metrics and real-time failure intelligence.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleLangfusePull}
            disabled={pulling}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Zap className={`size-4 ${pulling ? "animate-pulse" : ""}`} />
            {pulling ? "Pulling..." : "Pull Langfuse"}
          </button>
          <button
            onClick={loadStats}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30 p-4 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}
      {pullResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          {pullResult}
        </div>
      )}

      {/* ── Metric Cards (all clickable) ───────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon      = card.icon;
          const TrendIcon = card.positive ? ArrowDownRight : ArrowUpRight;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{card.label}</p>
                <div className={`p-2.5 rounded-lg ${card.positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                  <Icon className="size-[18px]" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <div className="text-3xl font-bold tracking-tight h-9 flex items-center">
                  {loading ? <div className="h-8 w-20 bg-muted/60 animate-pulse rounded-md" /> : card.value}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className={`flex items-center font-medium px-1.5 py-0.5 rounded-md ${card.positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                  <TrendIcon className="mr-1 size-3" />{card.trend}
                </span>
                <span className="text-muted-foreground">{card.description}</span>
              </div>
              <ChevronRight className="absolute right-4 bottom-4 size-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </>
          );
          return (
            <Link key={card.label} href={card.href} className={cardCls}>
              {body}
            </Link>
          );
        })}
      </div>

      {/* ── Reliability Score Gauge ───────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/10 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg tracking-tight">Platform Reliability Score</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Percentage of sessions that completed without a detected failure
            </p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${scoreBg} ${scoreLabelColor}`}>
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
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-rose-500 inline-block" />0–49 Critical</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500 inline-block" />50–79 Degraded</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500 inline-block" />80–100 Healthy</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="flex-1 grid grid-cols-2 gap-4 w-full">
            {/* Successful → /traces */}
            <Link href="/traces"
              className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-4 hover:bg-emerald-500/10 transition-colors group">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Successful</p>
              <div className="text-3xl font-bold h-9 flex items-center mt-1 mb-1">
                {loading ? <div className="h-8 w-24 bg-emerald-500/20 animate-pulse rounded-md" /> : totalSuccess.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                sessions completed cleanly
                <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>

            {/* Failures Detected → /traces */}
            <Link href="/traces"
              className="rounded-lg border bg-rose-500/5 border-rose-500/20 p-4 hover:bg-rose-500/10 transition-colors group">
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">Failures Detected</p>
              <div className="text-3xl font-bold h-9 flex items-center mt-1 mb-1">
                {loading ? <div className="h-8 w-24 bg-rose-500/20 animate-pulse rounded-md" /> : totalFailed.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                sessions with diagnosed failures
                <ChevronRight className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>

            {/* Failure breakdown rows — each links to its module */}
            <div className="col-span-2 rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Failure Breakdown — click to investigate
              </p>
              <div className="space-y-2">
                {failureRows.map(({ label, value, color, href }) => {
                  const pct = totalFailed > 0 ? Math.round((value / totalFailed) * 100) : 0;
                  return (
                    <Link key={label} href={href}
                      className="flex items-center gap-3 py-0.5 rounded group hover:opacity-80 transition-opacity">
                      <span className="text-xs text-muted-foreground w-32 flex-shrink-0 group-hover:text-foreground transition-colors">
                        {label}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-6 text-right">{value}</span>
                      <ChevronRight className="size-3 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom row: chart + alerts ────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-7">

        {/* Failure Distribution chart */}
        <div className="col-span-4 rounded-xl border bg-card p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-semibold text-lg tracking-tight">Failure Distribution</h3>
              <p className="text-xs text-muted-foreground mt-1">Daily failure count across all modules</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-md border">Last 7 days</span>
              <Link href="/traces"
                className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
                View all <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>
          <div className="h-[200px] w-full flex items-end justify-between gap-3 pt-8 mt-auto">
            {barHeights.map((h, i) => (
              <Link key={i} href="/traces" className="w-full h-full flex items-end group">
                <div className="w-full bg-muted/50 rounded-t-md relative h-full flex items-end">
                  <div
                    className="w-full bg-primary/90 rounded-t-md transition-all duration-500 group-hover:bg-primary shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                    style={{ height: `${h}%` }}
                  >
                    {dailyCounts[i] > 0 && (
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        {dailyCounts[i]}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-[11px] font-medium text-muted-foreground px-2 uppercase tracking-wider">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
        </div>

        {/* Recent Alerts — all items link to their module */}
        <div className="col-span-3 rounded-xl border bg-card p-0 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b flex items-center justify-between bg-muted/10">
            <div>
              <h3 className="font-semibold text-lg tracking-tight">Recent Alerts</h3>
              <p className="text-xs text-muted-foreground mt-1">System notifications and anomalies</p>
            </div>
            <Link href="/data-quality"
              className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
              Data Quality <ChevronRight className="size-3" />
            </Link>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {alerts.map((alert, i) => (
              <Link key={i} href={alert.href}
                className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors group">
                <div className={`mt-0.5 size-2.5 rounded-full shadow-sm flex-shrink-0 ${
                  alert.type === "error"   ? "bg-rose-500 shadow-rose-500/40" :
                  alert.type === "warning" ? "bg-amber-500 shadow-amber-500/40" :
                                             "bg-blue-500 shadow-blue-500/40"
                }`} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium leading-none text-foreground group-hover:text-primary transition-colors">
                      {alert.title}
                    </p>
                    <span className="text-[10px] font-medium text-muted-foreground">{alert.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.desc}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-primary flex-shrink-0 transition-colors mt-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
