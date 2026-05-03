"use client";

import { useState, useRef } from "react";
import {
  Network,
  AlertCircle,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
import { AILoadingOverlay } from "@/components/ui/ai-loader";
import { AnalysisMetrics } from "@/components/features/analysis/AnalysisMetrics";
import { FadeInStagger } from "@/components/ui/fade-in";
import { analyzeSession, type AnalysisReport, type Finding } from "@/lib/api";

export default function BlindSpotsPage() {
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
            <Network className="size-6" />
          </div>
          Systemic Blind Spots
        </h2>
        <p className="text-muted-foreground text-sm">
          Map systematic knowledge gaps across sessions to prioritize knowledge base updates.
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
            failureType="blind_spot"
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
              <Network className="size-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
            <p className="text-sm text-muted-foreground">
              Choose a trace from the left panel — the analysis loads automatically.
            </p>
          </div>
        ) : null}

      {selectedSession && (
      <div ref={analysisRef} className="relative"><FadeInStagger className="space-y-6">
        <AILoadingOverlay 
          isLoading={isLoading}
          text={isRefreshing ? "Re-running pipeline…" : "Loading analysis…"}
          subtext={isRefreshing ? "Running LangGraph — this takes ~25s" : undefined}
        />
        {/* Analysis card — same structure as other pages */}
        <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          {/* Action bar */}
          <div className="px-5 py-3 border-b bg-muted/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="size-4 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground truncate">{selectedId}</span>
            </div>
            <button
              onClick={handleRunAnalysis}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isLoading ? <><Loader2 className="size-4 animate-spin" /> Analyzing…</> : report ? "Recalculate Gaps" : "Identify Gaps"}
            </button>
          </div>

          {/* Metrics row */}
          <AnalysisMetrics
            report={report}
            findingsLabel="Knowledge Gaps"
            className="border-b"
            itemClassName="p-5 bg-muted/10"
          />

        </div>

        {/* Gap Analysis Summary + Knowledge Gaps — equal 50/50 split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: Gap Analysis Summary */}
          <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <TrendingUp className="size-4 text-primary" />
              <h3 className="font-semibold tracking-tight text-sm">Gap Analysis Summary</h3>
            </div>
            <div className="p-4 bg-muted/30 border rounded-2xl text-sm leading-relaxed shadow-inner">
              {report?.summary ?? "Select a session — the analysis loads automatically."}
            </div>
            {report && (
              <div className="pt-3 border-t space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Root Cause</p>
                <p className="text-sm font-medium text-foreground leading-relaxed">{report.root_cause}</p>
              </div>
            )}
          </div>

          {/* Right: Knowledge Gaps */}
          <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <AlertCircle className="size-4 text-primary" />
              <h3 className="font-semibold tracking-tight text-sm">
                {report ? `Knowledge Gaps (${report.findings.length})` : "Knowledge Gaps"}
              </h3>
            </div>
            <div className="space-y-3">
              {report ? (
                report.findings.length === 0 ? (
                  <div className="p-4 border rounded-2xl text-sm border-l-4 border-l-emerald-500 bg-emerald-500/5">
                    <p className="text-muted-foreground">No knowledge gaps detected.</p>
                  </div>
                ) : (
                  report.findings.map((f: Finding, i: number) => (
                    <div key={i} className={`p-4 bg-background border rounded-2xl text-sm border-l-4 ${
                      f.severity === "high" || f.severity === "critical" ? "border-l-rose-500" : "border-l-amber-400"
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-foreground break-words">{f.title}</span>
                        <span className="text-xs font-semibold uppercase tracking-wider opacity-60 shrink-0 ml-2">{f.severity}</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed text-xs break-words">{f.description}</p>
                      {f.recommendation && (
                        <p className="mt-1.5 text-xs font-medium text-foreground/80">→ {f.recommendation}</p>
                      )}
                    </div>
                  ))
                )
              ) : (
                <div className="p-4 border rounded-2xl text-sm border-l-4 border-l-muted">
                  <p className="text-muted-foreground">Knowledge gaps will appear here after analysis.</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {selectedSession && (
          <div className="rounded-2xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
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
        )}
      </FadeInStagger>
      </div>
      )}
        </div>{/* end right col */}
      </div>{/* end grid */}
    </div>
  );
}