"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { fetchQualityReport, type DataQualityReport, type SourceReport, type QualityCheck } from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    label: "Pass",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  warn: {
    icon: AlertTriangle,
    label: "Warning",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
  },
  fail: {
    icon: XCircle,
    label: "Fail",
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    dot: "bg-rose-500",
  },
};

function StatusBadge({ status }: { status: "pass" | "warn" | "fail" }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      <Icon className="size-3" />
      {cfg.label}
    </span>
  );
}

function CheckRow({ check }: { check: QualityCheck }) {
  const cfg = STATUS_CONFIG[check.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.warn;
  const Icon = cfg.icon;
  const hasPinnedSessions = (check.flagged_session_ids?.length ?? 0) > 0;
  const flaggedHref = hasPinnedSessions
    ? `/traces?ids=${check.flagged_session_ids.join(",")}`
    : null;

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <Icon className={`size-4 mt-0.5 shrink-0 ${
        check.status === "pass" ? "text-emerald-500" :
        check.status === "warn" ? "text-amber-500" : "text-rose-500"
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium" title={check.detail}>{check.name}</p>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{check.detail}</p>
        {(check.status === "warn" || check.status === "fail") && flaggedHref && (
          <div className="mt-2">
            <Link
              href={flaggedHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Investigate in Trace Explorer
            </Link>
          </div>
        )}
      </div>
      {check.count > 0 && (
        <div className="shrink-0 text-right">
          <p className="text-sm text-muted-foreground">{check.count} checked</p>
          {flaggedHref && check.flagged > 0 && (
            <Link
              href={flaggedHref}
              className={`text-sm font-medium hover:underline ${check.status === "pass" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}
            >
              {check.flagged} flagged
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function SourceCard({ src }: { src: SourceReport }) {
  const [open, setOpen] = useState(true);
  const cfg = STATUS_CONFIG[src.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.warn;

  return (
    <SpotlightCard className="p-0 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`size-2.5 rounded-full ${cfg.dot}`} />
          <span className="font-semibold tracking-tight">{src.source}</span>
          {src.total > 0 && (
            <span className="text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded-xl border">
              {src.total.toLocaleString()} items
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={src.status as "pass" | "warn" | "fail"} />
          {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="px-6 pb-4 border-t bg-muted/5">
          {src.checks.map((chk, i) => (
            <CheckRow key={i} check={chk} />
          ))}
        </div>
      )}
    </SpotlightCard>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DataQualityPage() {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchQualityReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quality report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const overallCfg = report ? STATUS_CONFIG[report.overall_status] : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
              <ShieldCheck className="size-6" />
            </div>
            Data Quality Report
          </h2>
          <p className="text-muted-foreground text-base">
            Automated checks across all 4 data sources — schema, coverage, error rates, and latency.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border text-base font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {error}
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center gap-2 text-base text-muted-foreground py-8 justify-center">
          <RefreshCw className="size-4 animate-spin" />
          Running quality checks…
        </div>
      )}

      {report && (
        <>
          {/* Overall status banner */}
          <div className={`rounded-2xl border p-5 flex items-center justify-between ${
            report.overall_status === "pass"
              ? "bg-emerald-500/5 border-emerald-500/20"
              : report.overall_status === "warn"
              ? "bg-amber-500/5 border-amber-500/20"
              : "bg-rose-500/5 border-rose-500/20"
          }`}>
            <div className="flex items-center gap-3">
              {overallCfg && <overallCfg.icon className={`size-6 ${
                report.overall_status === "pass" ? "text-emerald-500" :
                report.overall_status === "warn" ? "text-amber-500" : "text-rose-500"
              }`} />}
              <div>
                <p className="font-semibold">
                  Overall Status: <span className="uppercase">{report.overall_status}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {report.sources.length} sources checked · Generated {new Date(report.generated_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {report.sources.map((s) => (
                <StatusBadge key={s.source} status={s.status as "pass" | "warn" | "fail"} />
              ))}
            </div>
          </div>

          {/* Source cards */}
          <div className="space-y-4">
            {report.sources.map((src) => (
              <SourceCard key={src.source} src={src} />
            ))}
          </div>

          {/* Raw report text */}
          <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="w-full flex items-center gap-3 px-6 py-4 hover:bg-muted/30 transition-colors"
            >
              <ClipboardList className="size-4 text-muted-foreground" />
              <span className="font-semibold tracking-tight text-base">Formatted Report</span>
              {showRaw ? <ChevronUp className="size-4 text-muted-foreground ml-auto" /> : <ChevronDown className="size-4 text-muted-foreground ml-auto" />}
            </button>
            {showRaw && (
              <div className="border-t bg-muted/10 p-6">
                <pre className="text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground">
                  {report.summary_text}
                </pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
