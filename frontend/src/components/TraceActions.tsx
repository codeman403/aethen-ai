"use client";

/**
 * TraceActions — Pull Traces + Backfill buttons used in the Trace Explorer page.
 * Extracted from the Overview page so the actions live next to the trace list.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Zap, ChevronDown, Download, X, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { pullLangfuseTraces, pullLangsmithTraces } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch(path: string, options?: RequestInit) {
  const { createClient } = await import("@/lib/supabase/client");
  const { data: { session } } = await createClient().auth.getSession();
  const token = session?.access_token ?? "";
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options?.headers ?? {}) },
  });
}

interface BackfillJob {
  job_id: string; provider: string; status: string;
  fetched: number; stored: number; skipped: number;
  errors: string[]; elapsed_s: number | null;
}

function BackfillCard({ job, onClose }: { job: BackfillJob; onClose: () => void }) {
  const running = job.status === "running" || job.status === "pending";
  const done = ["completed", "cancelled", "failed"].includes(job.status);
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 text-sm ${
      job.status === "failed"    ? "border-destructive/30 bg-destructive/8" :
      job.status === "completed" ? "border-emerald-500/30 bg-emerald-500/8" :
      "border-primary/30 bg-primary/8"
    }`}>
      <div className="mt-0.5 shrink-0">
        {running && <Loader2 className="size-4 animate-spin text-primary" />}
        {job.status === "completed" && <CheckCircle2 className="size-4 text-emerald-500" />}
        {job.status === "failed"    && <AlertTriangle className="size-4 text-destructive" />}
        {job.status === "cancelled" && <X className="size-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold capitalize">Backfill {job.provider} — {job.status}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {job.fetched.toLocaleString()} fetched · {job.stored.toLocaleString()} stored · {job.skipped.toLocaleString()} skipped
          {job.elapsed_s != null && ` · ${job.elapsed_s}s`}
        </p>
        {job.errors.length > 0 && (
          <p className="text-xs text-destructive mt-1">{job.errors[job.errors.length - 1]}</p>
        )}
      </div>
      {done && (
        <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

interface Props {
  onPullComplete?: () => void;
}

export function TraceActions({ onPullComplete }: Props) {
  const [pulling, setPulling] = useState(false);
  const [pullMenuOpen, setPullMenuOpen] = useState(false);
  const [pullResult, setPullResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfillJob, setBackfillJob] = useState<BackfillJob | null>(null);
  const [backfillMenuOpen, setBackfillMenuOpen] = useState(false);

  const pullRef = useRef<HTMLDivElement>(null);
  const backfillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!pullRef.current?.contains(e.target as Node)) setPullMenuOpen(false);
      if (!backfillRef.current?.contains(e.target as Node)) setBackfillMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pollBackfill = useCallback((jobId: string) => {
    const iv = setInterval(async () => {
      try {
        const body = await (await apiFetch(`/api/backfill/${jobId}`)).json();
        const job: BackfillJob = body.data;
        setBackfillJob(job);
        if (["completed", "cancelled", "failed"].includes(job.status)) {
          clearInterval(iv);
          if (job.stored > 0) onPullComplete?.();
        }
      } catch { clearInterval(iv); }
    }, 3000);
  }, [onPullComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePull = async (provider: "langfuse" | "langsmith" | "both") => {
    setPulling(true); setPullMenuOpen(false); setError(null); setPullResult(null);
    try {
      const [lf, ls] = await Promise.allSettled([
        provider !== "langsmith" ? pullLangfuseTraces(20) : Promise.resolve(null),
        provider !== "langfuse"  ? pullLangsmithTraces(20) : Promise.resolve(null),
      ]);
      const parts: string[] = []; const errs: string[] = [];
      if (lf.status === "fulfilled" && lf.value)
        parts.push(lf.value.sessions_ingested > 0 ? `✓ Langfuse: ${lf.value.sessions_ingested} sessions` : "✓ Langfuse: no new traces");
      else if (lf.status === "rejected") errs.push(`Langfuse: ${lf.reason?.message ?? "failed"}`);
      if (ls.status === "fulfilled" && ls.value)
        parts.push(ls.value.sessions_ingested > 0 ? `✓ LangSmith: ${ls.value.sessions_ingested} sessions` : "✓ LangSmith: no new traces");
      else if (ls.status === "rejected") errs.push(`LangSmith: ${ls.reason?.message ?? "failed"}`);
      if (parts.length) { setPullResult(parts.join(" · ")); onPullComplete?.(); }
      if (errs.length) setError(errs.join(" · "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pull failed");
    } finally { setPulling(false); }
  };

  const handleBackfill = async (provider: "langfuse" | "langsmith") => {
    setBackfillMenuOpen(false); setBackfillJob(null);
    try {
      const body = await (await apiFetch("/api/backfill", {
        method: "POST", body: JSON.stringify({ provider, source_name: "default" }),
      })).json();
      if (body.error) throw new Error(body.error);
      const job: BackfillJob = { job_id: body.data.job_id, provider, status: "pending", fetched: 0, stored: 0, skipped: 0, errors: [], elapsed_s: null };
      setBackfillJob(job);
      pollBackfill(body.data.job_id);
    } catch (e) { setError(e instanceof Error ? e.message : "Backfill failed to start"); }
  };

  const handleCancelBackfill = () => {
    if (backfillJob) apiFetch(`/api/backfill/${backfillJob.job_id}`, { method: "DELETE" }).catch(() => {});
  };

  const backfillRunning = backfillJob?.status === "running" || backfillJob?.status === "pending";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* Pull Traces */}
        <div className="relative" ref={pullRef}>
          <div className="flex rounded-full overflow-hidden border border-primary/20 bg-primary text-primary-foreground">
            <button onClick={() => handlePull("both")} disabled={pulling}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              <Zap className={`size-4 ${pulling ? "animate-pulse" : ""}`} />
              {pulling ? "Pulling…" : "Pull Traces"}
            </button>
            <button onClick={() => setPullMenuOpen(v => !v)} disabled={pulling}
              className="px-2 py-2 hover:bg-primary/80 transition-colors border-l border-primary-foreground/20 disabled:opacity-50">
              <ChevronDown className={`size-4 transition-transform ${pullMenuOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {pullMenuOpen && (
            <div className="absolute left-0 top-full mt-2 w-52 rounded-2xl border border-border/60 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden z-50">
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Select source</p>
              {[
                { key: "both" as const, label: "Pull Both", desc: "Langfuse + LangSmith", dot: "bg-primary" },
                { key: "langfuse" as const, label: "Langfuse only", desc: "Pull from Langfuse", dot: "bg-indigo-500" },
                { key: "langsmith" as const, label: "LangSmith only", desc: "Pull from LangSmith", dot: "bg-orange-500" },
              ].map(opt => (
                <button key={opt.key} onClick={() => { handlePull(opt.key); setPullMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
                  <span className={`size-2 rounded-full shrink-0 ${opt.dot}`} />
                  <div><p className="text-sm font-medium">{opt.label}</p><p className="text-xs text-muted-foreground">{opt.desc}</p></div>
                </button>
              ))}
              <div className="h-2" />
            </div>
          )}
        </div>

        {/* Backfill */}
        <div className="relative" ref={backfillRef}>
          <div className="flex rounded-full overflow-hidden border border-border/60 bg-background text-foreground">
            <button onClick={() => handleBackfill("langfuse")} disabled={backfillRunning}
              title="Bulk-import all historical traces"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-muted/60 transition-colors disabled:opacity-50">
              <Download className={`size-4 ${backfillRunning ? "animate-pulse" : ""}`} />
              {backfillRunning ? "Backfilling…" : "Backfill"}
            </button>
            <button onClick={() => setBackfillMenuOpen(v => !v)} disabled={backfillRunning}
              className="px-2 py-2 hover:bg-muted/60 transition-colors border-l border-border/40 disabled:opacity-50">
              <ChevronDown className={`size-4 transition-transform ${backfillMenuOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {backfillMenuOpen && (
            <div className="absolute left-0 top-full mt-2 w-60 rounded-2xl border border-border/60 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden z-50">
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Import all historical traces</p>
              {[
                { key: "langfuse" as const, label: "Langfuse", desc: "All traces from your source", dot: "bg-indigo-500" },
                { key: "langsmith" as const, label: "LangSmith", desc: "All runs from your project", dot: "bg-orange-500" },
              ].map(opt => (
                <button key={opt.key} onClick={() => handleBackfill(opt.key)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
                  <span className={`size-2 rounded-full shrink-0 ${opt.dot}`} />
                  <div><p className="text-sm font-medium">{opt.label}</p><p className="text-xs text-muted-foreground">{opt.desc}</p></div>
                </button>
              ))}
              <div className="mx-4 mb-3 mt-1 rounded-xl bg-muted/40 px-3 py-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">Runs in background. No analysis — diagnose on demand later.</p>
              </div>
            </div>
          )}
        </div>

        {backfillRunning && (
          <button onClick={handleCancelBackfill} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
            Cancel
          </button>
        )}
      </div>

      {backfillJob && <BackfillCard job={backfillJob} onClose={() => setBackfillJob(null)} />}
      {pullResult && <p className="text-xs text-emerald-600 dark:text-emerald-400">{pullResult}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
