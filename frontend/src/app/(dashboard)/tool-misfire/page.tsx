"use client";

import { useState } from "react";
import {
  Wrench,
  Clock,
  AlertOctagon,
  Terminal,
  Loader2,
} from "lucide-react";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
import { analyzeSession, type AnalysisReport } from "@/lib/api";

export default function ToolMisfirePage() {
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
            <Wrench className="size-6" />
          </div>
          Tool Misfire Analysis
        </h2>
        <p className="text-muted-foreground text-sm">
          Diagnose API failures, timeout cascades, and bad parameter logic.
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
          failureType="tool_misfire"
          onSelect={handleSelectSession}
          selectedId={selectedId}
        />
        
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-0 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-muted/30 px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" />
              <h3 className="font-semibold tracking-tight">
                {report ? "Failure Analysis" : "Call Sequence (Waterfall)"}
              </h3>
            </div>
            {report && (
              <span className="text-xs font-medium text-muted-foreground bg-background px-2 py-1 rounded border capitalize">
                {report.failure_type.replace("_", " ")} •{" "}
                {report.findings.length} finding
                {report.findings.length !== 1 ? "s" : ""}
              </span>
            )}
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
                    className="rounded-lg border border-rose-500/30 bg-rose-500/5 shadow-sm overflow-hidden"
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
                        <p className="text-rose-600/90 text-xs">{f.description}</p>
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
                  className="rounded-lg border border-muted bg-muted/5 shadow-sm overflow-hidden"
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

        <div className="space-y-6">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-rose-500 to-rose-700" />
            <div className="p-6">
              <h3 className="font-semibold text-lg tracking-tight mb-4">
                Executive Summary
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {report?.summary ??
                  "Run an analysis to see the executive summary for this tool misfire session."}
              </p>
              {report && (
                <div className="mt-4 pt-4 border-t space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Root Cause</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {report.root_cause}
                    </span>
                  </div>
                  <div className="flex justify-between">
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
        </div>
          {selectedSession && <SessionContext session={selectedSession} />}
      </div>
    </div>
  );
}