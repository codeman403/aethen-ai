"use client";

import { useState, useRef } from "react";
import {
  Wrench,
  Clock,
  AlertOctagon,
  Terminal,
  Loader2,
} from "lucide-react";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
import { AILoadingOverlay } from "@/components/ui/ai-loader";
import { AnalysisMetrics } from "@/components/features/analysis/AnalysisMetrics";
import { FadeInStagger } from "@/components/ui/fade-in";
import { analyzeSession, type AnalysisReport } from "@/lib/api";

export default function ToolMisfirePage() {
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
            <Wrench className="size-6" />
          </div>
          Tool Misfire Analysis
        </h2>
        <p className="text-muted-foreground text-sm">
          Analyze why tool calls failed, timed out, or produced cascading system errors.
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
            failureType="tool_misfire"
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
              <Wrench className="size-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
            <p className="text-sm text-muted-foreground">
              Choose a trace from the left panel — the analysis loads automatically.
            </p>
          </div>
        ) : null}

      {selectedSession && (
      <div ref={analysisRef} className="relative"><FadeInStagger className="grid gap-6 lg:grid-cols-3">
        <AILoadingOverlay 
          isLoading={isLoading}
          text={isRefreshing ? "Re-running pipeline…" : "Loading analysis…"}
          subtext={isRefreshing ? "Running LangGraph — this takes ~25s" : undefined}
        />

        {/* Metrics bar — spans full width, immediately visible */}
        {report && (
          <AnalysisMetrics
            report={report}
            className="lg:col-span-3 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          />
        )}

        <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden relative animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-rose-500 to-rose-700" />
          <div className="p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-semibold text-lg tracking-tight">
                Execution Root Cause
              </h3>
              <button
                onClick={handleRunAnalysis}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? <><Loader2 className="size-3 animate-spin" /> Analyzing…</> : report ? "Analyze Call Chain" : "Run Chain Analysis"}
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {report?.summary ??
                "Run an analysis to see the executive summary for this tool misfire session."}
            </p>
            {report && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Root Cause</p>
                  <p className="text-sm font-medium text-foreground leading-relaxed">{report.root_cause}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Failure Analysis + Recommendations — equal 50/50 split */}
        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">
          <div className="bg-muted/30 px-6 py-4 border-b flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            <h3 className="font-semibold tracking-tight">
              {report ? "Failure Analysis" : "Call Sequence (Waterfall)"}
            </h3>
          </div>

          <div className="p-6 space-y-4 bg-[#FAFAFA] dark:bg-[#0A0A0A]">
            {report ? (
              report.findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tool failures detected.
                </p>
              ) : (
                report.findings.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-3 bg-rose-500/10 border-b border-rose-500/20">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold bg-background/50 border border-rose-500/20 text-rose-600 rounded-md px-1.5 py-0.5">
                          #{i + 1}
                        </span>
                        <span className="font-semibold text-sm text-foreground">
                          {f.title}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tracking-wider uppercase">
                        {f.severity}
                      </span>
                    </div>
                    <div className="px-4 py-3 text-sm space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertOctagon className="size-4 text-rose-500 mt-0.5 shrink-0" />
                        <p className="text-rose-600 text-sm leading-relaxed">{f.description}</p>
                      </div>
                      {f.evidence.length > 0 && (
                        <div className="pl-6 space-y-1">
                          {f.evidence.map((ev, j) => (
                            <p key={j} className="text-xs font-mono text-muted-foreground">
                              {ev}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )
            ) : (
              [1, 2, 3].map((attempt) => (
                <div
                  key={attempt}
                  className="rounded-xl border border-muted bg-muted/5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-b">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold bg-background/50 border text-muted-foreground rounded-md px-1.5 py-0.5">
                        #{attempt}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">
                        — awaiting analysis
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="size-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">—</span>
                    </div>
                  </div>
                  <div className="px-4 py-3 text-sm flex items-start gap-2">
                    <AlertOctagon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-muted-foreground text-xs">Run an analysis to see tool call details.</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h3 className="font-semibold text-lg tracking-tight mb-4">
              Recommendations
            </h3>
            {report ? (
              <ul className="space-y-3">
                {report.findings.flatMap((f) =>
                  f.recommendation ? (
                    <li
                      key={f.title}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <span>{f.recommendation}</span>
                    </li>
                  ) : []
                )}
                {report.findings.every((f) => !f.recommendation) && (
                  <li className="text-sm text-muted-foreground">
                    No specific recommendations generated.
                  </li>
                )}
              </ul>
            ) : (
              <ul className="space-y-3">
                {[
                  "Implement circuit breaker for failing tools.",
                  "Add per-tool timeout budgets.",
                  "Define fallback behavior when tools are degraded.",
                ].map((rec) => (
                  <li
                    key={rec}
                    className="flex items-start gap-2 text-sm text-muted-foreground opacity-40"
                  >
                    <div className="size-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
        </div>{/* end 50/50 wrapper */}

        <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <details className="group">
            <summary className="list-none cursor-pointer px-6 py-4 border-b bg-muted/20 flex items-center justify-between">
              <span className="font-semibold tracking-tight">Raw Session Context</span>
              <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="p-6">
              <SessionContext session={selectedSession} />
            </div>
          </details>
        </div>
      </FadeInStagger>
      </div>
      )}
        </div>{/* end right col */}
      </div>{/* end grid */}
    </div>
  );
}