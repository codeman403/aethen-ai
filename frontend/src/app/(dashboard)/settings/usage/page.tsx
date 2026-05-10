"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchUsage, fetchUsageHistory, type OrgUsage } from "@/lib/api";

function UsageBar({ pct, warn }: { pct: number; warn: boolean }) {
  const color = pct >= 90 ? "bg-rose-500" : warn ? "bg-amber-500" : "bg-primary";
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

function UsageCard({
  label,
  used,
  limit,
  pct,
  description,
  unlimited = false,
}: {
  label: string;
  used: number;
  limit: number;
  pct: number;
  description: string;
  unlimited?: boolean;
}) {
  const warn = !unlimited && pct >= 80;
  const exceeded = !unlimited && pct >= 100;

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-base tracking-tight">{label}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
        {unlimited ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
            Unlimited
          </span>
        ) : exceeded ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
            <AlertTriangle className="size-3" /> Exceeded
          </span>
        ) : warn ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
            <AlertTriangle className="size-3" /> Near limit
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="size-3" /> On track
          </span>
        )}
      </div>

      {!unlimited && <UsageBar pct={pct} warn={warn} />}

      <div className="flex items-center justify-between text-sm">
        <span className="font-medium tabular-nums">
          {used.toLocaleString()} <span className="text-muted-foreground font-normal">used</span>
        </span>
        <span className="text-muted-foreground tabular-nums">
          {unlimited ? "No limit" : `${limit.toLocaleString()} / month`}
        </span>
      </div>
    </div>
  );
}

function PeriodLabel({ period }: { period: string }) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return (
    <span className="text-sm font-medium">
      {date.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
    </span>
  );
}

export default function UsagePage() {
  const [usage, setUsage] = useState<OrgUsage | null>(null);
  const [history, setHistory] = useState<OrgUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [current, hist] = await Promise.all([fetchUsage(), fetchUsageHistory()]);
      setUsage(current);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
              <BarChart3 className="size-6" />
            </div>
            Usage
          </h2>
          <p className="text-muted-foreground text-base">
            Monthly usage against your plan limits. Resets on the 1st of each month.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !usage && (
        <div className="flex items-center gap-2 text-base text-muted-foreground py-8 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading usage…
        </div>
      )}

      {/* Current period */}
      {usage && (
        <>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Current period — <PeriodLabel period={usage.period} />
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <UsageCard
                label="Sessions Ingested"
                used={usage.sessions_ingested}
                limit={usage.sessions_limit}
                pct={usage.sessions_pct}
                description="Unique agent trace sessions stored this month"
                unlimited={usage.sessions_limit === 0}
              />
              <UsageCard
                label="Analysis Runs"
                used={usage.analysis_runs}
                limit={usage.analysis_runs_limit}
                pct={usage.analysis_pct}
                description="LangGraph pipeline executions this month"
                unlimited={usage.analysis_runs_limit === 0}
              />
            </div>
          </div>

          {/* History */}
          {history.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Previous months
              </p>
              <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] divide-y divide-border/50">
                {history.slice(1).map((h) => (
                  <div key={h.period} className="px-6 py-4 grid grid-cols-3 gap-4 items-center">
                    <PeriodLabel period={h.period} />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Sessions</p>
                      <p className="text-sm font-medium tabular-nums">
                        {h.sessions_ingested.toLocaleString()}
                        <span className="text-muted-foreground font-normal"> / {h.sessions_limit.toLocaleString()}</span>
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Analysis runs</p>
                      <p className="text-sm font-medium tabular-nums">
                        {h.analysis_runs.toLocaleString()}
                        <span className="text-muted-foreground font-normal"> / {h.analysis_runs_limit.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h4 className="font-semibold text-sm mb-3">About usage limits</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">→</span><span><strong className="text-foreground">Sessions</strong> — counted once per unique session_id ingested via API or trace pull. Re-ingesting the same session does not count again.</span></li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">→</span><span><strong className="text-foreground">Analysis runs</strong> — counted for each new LangGraph pipeline execution. Cached analyses are free and do not consume quota.</span></li>
              <li className="flex gap-2"><span className="text-primary font-bold shrink-0">→</span><span>Limits reset automatically on the 1st of each month (UTC).</span></li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
