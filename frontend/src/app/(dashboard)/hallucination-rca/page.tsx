"use client";

import { useState } from "react";
import {
  ScanSearch,
  CheckCircle2,
  XCircle,
  FileText,
  Target,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
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
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectSession = (sessionData: object) => {
    const s = sessionData as { session_id: string };
    setSelectedId(s.session_id);
    setSelectedSession(sessionData as Record<string, unknown>);
    setReport(null);
    setError(null);
  };

  const handleRunAnalysis = async () => {
    if (!selectedSession) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSession(selectedSession);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
            <ScanSearch className="size-6" />
          </div>
          Hallucination RCA
        </h2>
        <p className="text-muted-foreground text-sm">
          Trace fabricated claims back to source documents and measure grounding
          scores.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: session list */}
        <div className="xl:col-span-4 sticky top-6 rounded-xl border bg-card shadow-sm overflow-hidden h-[calc(100vh-200px)] flex flex-col">
          <SessionsList
            failureType="hallucination"
            onSelect={handleSelectSession}
            selectedId={selectedId}
          />
        </div>

        {/* Right: empty state or analysis */}
        <div className="xl:col-span-8">
        {!selectedSession ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed rounded-xl bg-muted/5 p-8">
            <div className="p-4 bg-muted/20 rounded-full mb-4">
              <ScanSearch className="size-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
            <p className="text-sm text-muted-foreground">
              Choose a trace from the left panel, then click <strong>Run Full Analysis</strong> to see the diagnosis.
            </p>
          </div>
        ) : null}

      {selectedSession && (
      <div className="relative rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-xl">
            <Loader2 className="size-10 animate-spin text-primary mb-3" />
            <p className="text-base font-semibold">Analyzing…</p>
            <p className="text-xs text-muted-foreground mt-1">Running LangGraph pipeline</p>
          </div>
        )}
        {/* Action bar with Run Analysis button */}
        <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground truncate">{selectedId}</span>
          <button
            onClick={handleRunAnalysis}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? <><Loader2 className="size-4 animate-spin" /> Analyzing…</> : "Run Full Analysis"}
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
              High/Critical
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
              Medium/Low
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

        {/* Comparison Panel */}
        <div className="p-8">
          <div className="grid gap-8 md:grid-cols-2">
            {/* Left: Summary / LLM Analysis */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Target className="size-4 text-primary" />
                <h3 className="font-semibold tracking-tight">
                  Analysis Summary
                </h3>
              </div>
              <div className="p-5 bg-muted/30 border rounded-xl leading-relaxed text-sm shadow-inner">
                {report?.summary ??
                  "Run an analysis to see the hallucination root cause assessment."}
              </div>
              {report && (
                <div className="p-4 bg-muted/20 rounded-xl border text-sm">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Raw Analysis
                  </p>
                  <p className="text-muted-foreground leading-relaxed line-clamp-4">
                    {report.raw_analysis}
                  </p>
                </div>
              )}
            </div>

            {/* Right: Findings / Source Verification */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <FileText className="size-4 text-primary" />
                <h3 className="font-semibold tracking-tight">
                  {report ? "Findings" : "Source Verification"}
                </h3>
              </div>

              <div className="space-y-3">
                {report ? (
                  report.findings.length === 0 ? (
                    <div className="p-4 bg-background border rounded-xl text-sm border-l-4 border-l-emerald-500">
                      <div className="flex gap-3">
                        <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-muted-foreground">
                          No hallucination issues detected.
                        </p>
                      </div>
                    </div>
                  ) : (
                    report.findings.map((f, i) => (
                      <div
                        key={i}
                        className={`p-4 bg-background border rounded-xl shadow-sm text-sm border-l-4 ${
                          f.severity === "high" || f.severity === "critical"
                            ? "border-l-rose-500"
                            : "border-l-amber-500"
                        }`}
                      >
                        <div className="flex gap-3">
                          <XCircle
                            className={`size-5 shrink-0 mt-0.5 ${
                              f.severity === "high" || f.severity === "critical"
                                ? "text-rose-500"
                                : "text-amber-500"
                            }`}
                          />
                          <div className="space-y-1.5">
                            <p className="font-semibold text-foreground">
                              {f.title}
                            </p>
                            <p className="text-muted-foreground leading-relaxed">
                              {f.description}
                            </p>
                            {f.evidence.length > 0 && (
                              <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono border">
                                {f.evidence[0]}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  <div className="p-4 bg-background border rounded-xl text-sm border-l-4 border-l-muted">
                    <div className="flex gap-3">
                      <FileText className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-muted-foreground">
                        Claim verification results will appear here after
                        analysis.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Primary Root Cause
              </h3>
              <p className="text-lg font-medium text-foreground">
                {report?.root_cause ?? "— Run analysis to identify root cause"}
              </p>
            </div>
            <Button variant="outline" disabled={!report}>
              View Full Trace Logs
            </Button>
          </div>
        </div>
          {selectedSession && <SessionContext session={selectedSession} />}
      </div>
      )}
        </div>{/* end right col */}
      </div>{/* end grid */}
    </div>
  );
}