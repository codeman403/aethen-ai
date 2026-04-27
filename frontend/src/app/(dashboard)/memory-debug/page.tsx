"use client";

import { useState } from "react";
import {
  BrainCircuit,
  AlertTriangle,
  FileSearch,
  Activity,
  Loader2,
} from "lucide-react";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
import { analyzeSession, type AnalysisReport, type Finding } from "@/lib/api";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-rose-500/10 border-rose-500/20 text-rose-600",
  high: "bg-rose-500/10 border-rose-500/20 text-rose-600",
  medium: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  low: "bg-blue-500/10 border-blue-500/20 text-blue-600",
};

const DOT_COLORS: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-destructive",
  medium: "bg-amber-500",
  low: "bg-blue-500",
};

function FindingCard({ finding }: { finding: Finding }) {
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.medium;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${style}`}>
      <AlertTriangle className="size-5 mt-0.5 shrink-0" />
      <div>
        <h4 className="text-sm font-semibold">{finding.title}</h4>
        <p className="text-xs mt-1 opacity-80">{finding.description}</p>
        {finding.recommendation && (
          <p className="text-xs mt-1.5 font-medium opacity-90">
            Fix: {finding.recommendation}
          </p>
        )}
      </div>
    </div>
  );
}

export default function MemoryDebugPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectSession = async (sessionData: object) => {
    const s = sessionData as { session_id: string };
    setSelectedId(s.session_id);
    setSelectedSession(sessionData as Record<string, unknown>);
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSession(sessionData);
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
            <BrainCircuit className="size-6" />
          </div>
          Memory Debug Analysis
        </h2>
        <p className="text-muted-foreground text-sm">
          Diagnose retrieval failures, stale embeddings, and missing context.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Analyzing session...
        </div>
      )}

      {error && (
        <div className="max-w-2xl rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="max-w-2xl">
        <SessionsList
          failureType="memory"
          onSelect={handleSelectSession}
          selectedId={selectedId}
        />
      </div>

      

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-card p-0 shadow-sm overflow-hidden">
            <div className="bg-muted/30 px-6 py-4 border-b flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <h3 className="font-semibold tracking-tight">
                {report ? "Analysis Findings Timeline" : "Retrieval Events Timeline"}
              </h3>
            </div>
            <div className="p-6">
              {report ? (
                <div className="relative border-l border-muted ml-3 space-y-8 pb-4">
                  {report.findings.length === 0 ? (
                    <p className="pl-8 text-sm text-muted-foreground">
                      No findings detected.
                    </p>
                  ) : (
                    report.findings.map((f, i) => (
                      <div key={i} className="relative pl-8">
                        <div
                          className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-card ${DOT_COLORS[f.severity] ?? "bg-muted-foreground"}`}
                        />
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md capitalize">
                              {f.severity}
                            </span>
                            <span
                              className={`text-sm font-medium flex items-center gap-1 ${SEVERITY_STYLES[f.severity]?.split(" ")[2] ?? ""}`}
                            >
                              <AlertTriangle className="size-3" /> {f.title}
                            </span>
                          </div>
                          <div className="text-base font-medium mt-1">
                            {f.description}
                          </div>
                          {f.evidence.length > 0 && (
                            <div className="mt-3 bg-muted/30 rounded-lg p-4 border text-sm space-y-2">
                              {f.evidence.map((ev, j) => (
                                <div key={j} className="grid grid-cols-3 gap-2">
                                  <span className="text-muted-foreground">
                                    Evidence {j + 1}
                                  </span>
                                  <span className="col-span-2 font-mono text-xs">
                                    {ev}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="relative border-l border-muted ml-3 space-y-8 pb-4">
                  <div className="relative pl-8">
                    <div className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-muted ring-4 ring-card" />
                    <p className="text-sm text-muted-foreground">
                      Enter a session ID above and click Analyze to see retrieval
                      event diagnostics.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500" />
            <div className="p-6">
              <h3 className="font-semibold text-lg tracking-tight mb-4">
                Executive Summary
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {report?.summary ??
                  "Run an analysis to see the executive summary and root cause diagnosis."}
              </p>
              {report && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Root Cause</span>
                    <span className="font-medium">{report.root_cause}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Confidence</span>
                    <span className="font-medium">
                      {Math.round(report.confidence * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="font-semibold text-lg tracking-tight mb-4">
              Key Findings
            </h3>
            {report ? (
              <div className="space-y-4">
                {report.findings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No findings from this analysis.
                  </p>
                ) : (
                  report.findings.map((f, i) => (
                    <FindingCard key={i} finding={f} />
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border">
                  <FileSearch className="size-5 text-muted-foreground mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Analysis findings will appear here after you run a session
                    diagnostic.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
          {selectedSession && <SessionContext session={selectedSession} />}
      </div>
    </div>
  );
}