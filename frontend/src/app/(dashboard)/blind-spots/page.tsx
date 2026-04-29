"use client";

import { useState } from "react";
import {
  Network,
  AlertCircle,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
import { analyzeSession, type AnalysisReport, type Finding } from "@/lib/api";

export default function BlindSpotsPage() {
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
            <Network className="size-6" />
          </div>
          Systemic Blind Spots
        </h2>
        <p className="text-muted-foreground text-sm">
          Discover cross-session knowledge gaps via graph pattern analysis.
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
            failureType="blind_spot"
            onSelect={handleSelectSession}
            selectedId={selectedId}
          />
        </div>

        {/* Right: empty state or analysis */}
        <div className="xl:col-span-8">
        {!selectedSession ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed rounded-xl bg-muted/5 p-8">
            <div className="p-4 bg-muted/20 rounded-full mb-4">
              <Network className="size-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
            <p className="text-sm text-muted-foreground">
              Choose a trace from the left panel, then click <strong>Run Full Analysis</strong> to see the diagnosis.
            </p>
          </div>
        ) : null}

      {selectedSession && (
      <div className="space-y-6">
        {/* Analysis card — same structure as other pages */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Action bar */}
          <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="size-4 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground truncate">{selectedId}</span>
            </div>
            <button
              onClick={handleRunAnalysis}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? <><Loader2 className="size-4 animate-spin" /> Analyzing…</> : "Run Full Analysis"}
            </button>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 border-b divide-x">
            {[
              {
                label: "Confidence",
                value: report ? `${Math.round(report.confidence * 100)}%` : "—",
                cls: report
                  ? report.confidence >= 0.7 ? "text-emerald-600"
                  : report.confidence >= 0.4 ? "text-amber-600"
                  : "text-rose-600"
                  : "text-muted-foreground/40",
              },
              { label: "Knowledge Gaps", value: report ? String(report.findings.length) : "—", cls: "text-foreground" },
              {
                label: "High / Critical",
                value: report ? String(report.findings.filter((f: Finding) => f.severity === "high" || f.severity === "critical").length) : "—",
                cls: "text-rose-600",
              },
              {
                label: "Medium / Low",
                value: report ? String(report.findings.filter((f: Finding) => f.severity === "medium" || f.severity === "low").length) : "—",
                cls: "text-amber-600",
              },
            ].map(({ label, value, cls }) => (
              <div key={label} className="p-5 bg-muted/10">
                <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                <span className={`text-2xl font-bold ${cls}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* 2-col: Summary + Root Cause | Findings */}
          <div className="p-6 grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <TrendingUp className="size-4 text-primary" />
                <h3 className="font-semibold tracking-tight text-sm">Analysis Summary</h3>
              </div>
              <div className="p-4 bg-muted/30 border rounded-xl text-sm leading-relaxed shadow-inner">
                {report?.summary ?? "Select a session and click Run Full Analysis to identify systemic knowledge gaps."}
              </div>
              {report && (
                <div className="pt-3 border-t space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Root Cause</p>
                  <p className="text-sm font-medium text-foreground leading-relaxed">{report.root_cause}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <AlertCircle className="size-4 text-primary" />
                <h3 className="font-semibold tracking-tight text-sm">
                  {report ? `Knowledge Gaps (${report.findings.length})` : "Knowledge Gaps"}
                </h3>
              </div>
              <div className="space-y-3">
                {report ? (
                  report.findings.length === 0 ? (
                    <div className="p-4 border rounded-xl text-sm border-l-4 border-l-emerald-500 bg-emerald-500/5">
                      <p className="text-muted-foreground">No knowledge gaps detected.</p>
                    </div>
                  ) : (
                    report.findings.map((f: Finding, i: number) => (
                      <div key={i} className={`p-4 bg-background border rounded-xl text-sm border-l-4 ${
                        f.severity === "high" || f.severity === "critical"
                          ? "border-l-rose-500"
                          : "border-l-amber-400"
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-foreground">{f.title}</span>
                          <span className="text-xs font-semibold uppercase tracking-wider opacity-60">{f.severity}</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed text-xs">{f.description}</p>
                        {f.recommendation && (
                          <p className="mt-1.5 text-xs font-medium text-foreground/80">→ {f.recommendation}</p>
                        )}
                      </div>
                    ))
                  )
                ) : (
                  <div className="p-4 border rounded-xl text-sm border-l-4 border-l-muted">
                    <p className="text-muted-foreground">Knowledge gaps will appear here after analysis.</p>
                  </div>
                )}
              </div>
            </div>
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