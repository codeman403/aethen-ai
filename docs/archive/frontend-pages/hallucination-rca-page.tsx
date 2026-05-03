"use client";

import { useState, useRef } from "react";
import {
  ScanSearch,
  CheckCircle2,
  XCircle,
  FileText,
  Target,
  Loader2,
} from "lucide-react";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
import { AILoadingOverlay } from "@/components/ui/ai-loader";
import { analyzeSession, type AnalysisReport } from "@/lib/api";

function GroundingBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const label = pct >= 75 ? "Good" : pct >= 50 ? "Fair" : "Poor";
  const cls =
    pct >= 75
      ? "text-emerald-600 border-emerald-500/20 bg-emerald-500/10"
      : pct >= 50
        ? "text-amber-600 border-amber-500/20 bg-amber-500/10"
        : "text-rose-600 border-rose-500/20 bg-rose-500/10";
  return (
    <div className={`p-6 ${pct < 50 ? "bg-rose-500/5" : "bg-muted/10"}`}>
      <p className="text-sm font-medium text-muted-foreground mb-1">
        Confidence Score
      </p>
      <div className="flex items-end gap-2">
        <span className={`text-3xl font-bold ${cls.split(" ")[0]}`}>{pct}%</span>
        <span
          className={`text-sm font-medium mb-1 border px-1.5 py-0.5 rounded ${cls}`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

export default function HallucinationRCAPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);


  const handleSelectSession = async (sessionData: object) => {
    const s = sessionData as { session_id: string };
    setSelectedId(s.session_id);
    setSelectedSession(sessionData as Record<string, unknown>);
    setError(null);
    setIsLoading(true);
    setIsRefreshing(false);
    try {
      const result = await analyzeSession(sessionData, false);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedSession) return;
    setIsLoading(true);
    setIsRefreshing(true);
    setError(null);
    try {
      const result = await analyzeSession(selectedSession, true);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
            <ScanSearch className="size-6" />
          </div>
          Hallucination RCA
        </h2>
        <p className="text-muted-foreground text-sm">
          Determine why the agent fabricated information and identify the missing grounding sources.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: session list */}
        <div className="xl:col-span-4 sticky top-6 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden h-[calc(100vh-200px)] flex flex-col">
          <SessionsList
            failureType="hallucination"
            onSelect={handleSelectSession}
            selectedId={selectedId}
            showFilters={false}
          />
        </div>

        {/* Right: empty state or analysis */}
        <div className="xl:col-span-8">
        {!selectedSession ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed rounded-2xl bg-muted/5 p-8">
            <div className="p-4 bg-muted/20 rounded-full mb-4">
              <ScanSearch className="size-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
            <p className="text-sm text-muted-foreground">
              Choose a trace from the left panel — the analysis loads automatically.
            </p>
          </div>
        ) : null}

      {selectedSession && (
      <div ref={analysisRef} className="relative rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <AILoadingOverlay 
          isLoading={isLoading}
          text={isRefreshing ? "Re-running pipeline…" : "Loading analysis…"}
          subtext={isRefreshing ? "Running LangGraph — this takes ~25s" : undefined}
        />
        {/* Action bar with Run Analysis button */}
        <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground truncate">{selectedId}</span>
          <button
            onClick={handleRunAnalysis}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? <><Loader2 className="size-4 animate-spin" /> Analyzing…</> : report ? "Audit Factual Claims" : "Audit Claims"}
          </button>
        </div>
        {/* Metric Header */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-b divide-x">
          {report ? (
            <GroundingBadge confidence={report.confidence} />
          ) : (
            <div className="p-6 bg-muted/5">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Confidence Score
              </p>
              <span className="text-3xl font-bold text-muted-foreground/40">
                —
              </span>
            </div>
          )}
          <div className="p-6 bg-muted/10">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Findings
            </p>
            <span className="text-3xl font-bold text-foreground">
              {report ? report.findings.length : "—"}
            </span>
          </div>
          <div className="p-6 bg-muted/10">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              High / Critical
            </p>
            <span className="text-3xl font-bold text-rose-600">
              {report
                ? report.findings.filter(
                    (f) => f.severity === "high" || f.severity === "critical"
                  ).length
                : "—"}
            </span>
          </div>
          <div className="p-6 bg-muted/10">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Medium / Low
            </p>
            <span className="text-3xl font-bold text-amber-600">
              {report
                ? report.findings.filter(
                    (f) => f.severity === "medium" || f.severity === "low"
                  ).length
                : "—"}
            </span>
          </div>
        </div>

        {/* Grounding Assessment + Findings — equal 50/50 split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">

          {/* Left: Grounding Assessment */}
          <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Target className="size-4 text-primary" />
              <h3 className="font-semibold tracking-tight">Grounding Assessment</h3>
            </div>
            <div className="p-4 bg-muted/30 border rounded-2xl leading-relaxed text-sm shadow-inner">
              {report?.summary ?? "Run an analysis to see the hallucination root cause assessment."}
            </div>
            {report?.root_cause && (
              <div className="pt-3 border-t space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Root Cause</p>
                <p className="text-sm font-medium text-foreground leading-relaxed">{report.root_cause}</p>
              </div>
            )}
          </div>

          {/* Right: Findings */}
          <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <FileText className="size-4 text-primary" />
              <h3 className="font-semibold tracking-tight">
                {report ? `Findings (${report.findings.length})` : "Source Verification"}
              </h3>
            </div>
            <div className="space-y-3">
              {report ? (
                report.findings.length === 0 ? (
                  <div className="p-4 bg-background border rounded-2xl text-sm border-l-4 border-l-emerald-500">
                    <div className="flex gap-3">
                      <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-muted-foreground">No hallucination issues detected.</p>
                    </div>
                  </div>
                ) : (
                  report.findings.map((f, i) => (
                    <div key={i} className={`p-4 bg-background border rounded-2xl text-sm border-l-4 ${
                      f.severity === "high" || f.severity === "critical" ? "border-l-rose-500" : "border-l-amber-500"
                    }`}>
                      <div className="flex gap-3">
                        <XCircle className={`size-5 shrink-0 mt-0.5 ${
                          f.severity === "high" || f.severity === "critical" ? "text-rose-500" : "text-amber-500"
                        }`} />
                        <div className="space-y-1.5 min-w-0">
                          <p className="font-semibold text-foreground break-words">{f.title}</p>
                          <p className="text-muted-foreground leading-relaxed text-xs break-words">{f.description}</p>
                          {f.evidence.length > 0 && (
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono border break-all">{f.evidence[0]}</div>
                          )}
                          {f.recommendation && (
                            <p className="mt-1.5 text-xs font-medium text-foreground/80 pt-1.5 border-t">→ {f.recommendation}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : (
                <div className="p-4 bg-background border rounded-2xl text-sm border-l-4 border-l-muted">
                  <div className="flex gap-3">
                    <FileText className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">Claim verification results will appear here after analysis.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-6 mb-6 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <details className="group">
            <summary className="list-none cursor-pointer px-6 py-4 border-b bg-muted/20 flex items-center justify-between">
              <span className="font-semibold tracking-tight">Raw Session Context</span>
              <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="p-6 animate-in fade-in duration-300">
              <SessionContext session={selectedSession} />
            </div>
          </details>
        </div>
      </div>
      )}
        </div>{/* end right col */}
      </div>{/* end grid */}
    </div>
  );
}