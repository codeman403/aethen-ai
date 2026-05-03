"use client";

import React, { useState, useRef } from "react";
import {
  BrainCircuit,
  AlertTriangle,
  FileSearch,
  Loader2,
  CheckCircle2,
  XCircle,
  Bot,
  Clock,
  Tag,
} from "lucide-react";
import { SessionsList } from "@/components/features/SessionsList";
import { AILoadingOverlay } from "@/components/ui/ai-loader";
import { AnalysisMetrics } from "@/components/features/analysis/AnalysisMetrics";
import { analyzeSession, type AnalysisReport, type Finding } from "@/lib/api";

const SEVERITY_CONFIG: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  critical: { border: "border-rose-500",   bg: "bg-rose-500/5",   text: "text-rose-700 dark:text-rose-400",   badge: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  high:     { border: "border-rose-400",   bg: "bg-rose-500/5",   text: "text-rose-700 dark:text-rose-400",   badge: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
  medium:   { border: "border-amber-400",  bg: "bg-amber-500/5",  text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  low:      { border: "border-blue-400",   bg: "bg-blue-500/5",   text: "text-blue-700 dark:text-blue-400",   badge: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
};

export default function MemoryDebugPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"context" | "diagnosis" | "retrieval" | "findings">("context");
  const analysisRef = useRef<HTMLDivElement>(null);

  const handleSelectSession = async (sessionData: object) => {
    const s = sessionData as { session_id: string };
    setSelectedId(s.session_id);
    setSelectedSession(sessionData as Record<string, unknown>);
    setReport(null);
    setError(null);
    setIsLoading(true);
    setIsRefreshing(false);
    setActiveTab("context");
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

  const sess = selectedSession ?? {};
  const retrieval_events = (sess.retrieval_events as Array<Record<string, unknown>>) ?? [];

  const TABS = [
    { key: "context"   as const, label: "Session Context" },
    { key: "diagnosis" as const, label: "Diagnosis" },
    { key: "retrieval" as const, label: "Retrieval Events" },
    { key: "findings"  as const, label: "Findings" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl border border-primary/20">
            <BrainCircuit className="size-6" />
          </div>
          Memory Debug Analysis
        </h2>
        <p className="text-muted-foreground text-sm">
          Identify why the agent retrieved the wrong context or missed critical knowledge chunks.
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
            failureType="memory"
            onSelect={handleSelectSession}
            selectedId={selectedId}
            showFilters={false}
          />
        </div>

        {/* Right */}
        <div className="xl:col-span-8">
          {!selectedSession ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed rounded-2xl bg-muted/5 p-8">
              <div className="p-4 bg-muted/20 rounded-full mb-4">
                <BrainCircuit className="size-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-bold mb-2">Select a session to begin</h3>
              <p className="text-sm text-muted-foreground">
                Choose a trace from the left panel — the analysis loads automatically.
              </p>
            </div>
          ) : (
            <div ref={analysisRef} className="relative">
              <AILoadingOverlay
                isLoading={isLoading}
                text={isRefreshing ? "Re-running pipeline…" : "Loading analysis…"}
                subtext={isRefreshing ? "Running LangGraph — this takes ~25s" : undefined}
              />

              <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">

                {/* Metrics bar */}
                {report && (
                  <AnalysisMetrics
                    report={report}
                    className="border-b"
                    itemClassName="p-4 bg-muted/10"
                  />
                )}

                {/* Tab bar + action button */}
                <div className="flex items-center justify-between border-b px-2">
                  <div className="flex overflow-x-auto scrollbar-none">
                    {TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                          activeTab === tab.key
                            ? "text-primary border-primary"
                            : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleRunAnalysis}
                    disabled={isLoading}
                    className="shrink-0 mr-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isLoading
                      ? <><Loader2 className="size-3 animate-spin" />Analyzing…</>
                      : report ? "Re-run" : "Run Analysis"}
                  </button>
                </div>

                {/* Tab content */}
                <div className="overflow-auto" style={{ minHeight: "340px", maxHeight: "calc(100vh - 360px)" }}>

                  {/* ── Tab 1: Session Context ── */}
                  {activeTab === "context" && (
                    <div className="p-6 space-y-5">
                      {/* Key fields grid */}
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { icon: Bot,          label: "Agent",        value: String(sess.agent_id ?? "—") },
                          { icon: Tag,          label: "Failure Type", value: String(sess.failure_type ?? "unknown").replace("_", " ") },
                          { icon: Clock,        label: "Timestamp",    value: sess.timestamp ? new Date(String(sess.timestamp)).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false }) : "—" },
                          { icon: (sess.outcome === "failure" ? XCircle : CheckCircle2) as React.ElementType,
                                                label: "Outcome",      value: String(sess.outcome ?? "—") },
                        ] as { icon: React.ElementType; label: string; value: string }[]).map(({ icon: Icon, label, value }) => (
                          <div key={label} className="flex items-start gap-3 p-3 rounded-xl bg-muted/20 border border-border/40">
                            <Icon className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                              <p className="text-sm font-medium text-foreground capitalize truncate">{value}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Session ID */}
                      <div className="p-3 rounded-xl bg-muted/10 border border-border/40">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Session ID</p>
                        <p className="text-xs font-mono text-foreground break-all">{String(sess.session_id ?? "—")}</p>
                      </div>

                      {/* Failure summary */}
                      {!!sess.failure_summary && (
                        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Failure Summary</p>
                          <p className="text-sm text-foreground leading-relaxed">{String(sess.failure_summary)}</p>
                        </div>
                      )}

                      {/* Event counts */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "LLM Calls",        value: ((sess.llm_calls as unknown[]) ?? []).length },
                          { label: "Tool Calls",        value: ((sess.tool_calls as unknown[]) ?? []).length },
                          { label: "Retrieval Events",  value: retrieval_events.length },
                        ].map(({ label, value }) => (
                          <div key={label} className="text-center p-3 rounded-xl bg-muted/10 border border-border/40">
                            <p className="text-xl font-bold text-foreground">{value}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                          </div>
                        ))}
                      </div>

                      {/* LLM Calls */}
                      {((sess.llm_calls as Array<Record<string, unknown>>) ?? []).length > 0 && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">LLM Calls</p>
                          {((sess.llm_calls as Array<Record<string, unknown>>) ?? []).map((lc, i) => (
                            <div key={i} className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
                              <div className="px-4 py-2 bg-muted/20 border-b flex items-center justify-between">
                                <span className="text-xs font-semibold text-muted-foreground">Call {i + 1}</span>
                                <span className="text-xs text-muted-foreground">{String(lc.model ?? "")}</span>
                              </div>
                              {!!lc.prompt && (
                                <div className="px-4 py-3 border-b">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Prompt</p>
                                  <p className="text-xs text-foreground leading-relaxed break-words">{String(lc.prompt).slice(0, 300)}{String(lc.prompt).length > 300 ? "…" : ""}</p>
                                </div>
                              )}
                              {!!lc.response && (
                                <div className="px-4 py-3">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Response</p>
                                  <p className="text-xs text-foreground leading-relaxed break-words">{String(lc.response).slice(0, 300)}{String(lc.response).length > 300 ? "…" : ""}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                    </div>
                  )}

                  {/* ── Tab 2: Diagnosis & Root Cause ── */}
                  {activeTab === "diagnosis" && (
                    <div className="p-6 space-y-5">
                      {report ? (
                        <>
                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
                            <p className="text-sm text-foreground leading-relaxed">{report.summary}</p>
                          </div>
                          <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Root Cause</p>
                            <p className="text-sm font-medium text-foreground leading-relaxed">{report.root_cause}</p>
                          </div>
                          <div className="flex items-center justify-between text-sm py-2 border-t">
                            <span className="text-muted-foreground">Failure Type</span>
                            <span className="font-semibold capitalize px-2.5 py-0.5 rounded-full bg-muted text-foreground text-xs">
                              {report.failure_type.replace("_", " ")}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                          <BrainCircuit className="size-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">Click <strong>Run Analysis</strong> to see the diagnosis and root cause.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Tab 3: Retrieval Events ── */}
                  {activeTab === "retrieval" && (
                    <div className="p-6">
                      {retrieval_events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                          <FileSearch className="size-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">No retrieval events recorded in this session.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {retrieval_events.map((evt, i) => {
                            const scores   = (evt.relevance_scores as number[]) ?? [];
                            const maxScore = scores.length > 0 ? Math.max(...scores) : null;
                            const docIds   = (evt.actual_doc_ids as string[]) ?? [];
                            const docContent = (evt.doc_content as string[]) ?? [];
                            const good = maxScore !== null && maxScore >= 0.5;
                            return (
                              <div key={i} className={`rounded-xl border p-4 space-y-3 ${good ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-0.5">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Query {i + 1}</p>
                                    <p className="text-sm font-medium text-foreground break-words">{String(evt.query ?? "")}</p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${good ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" : "text-amber-600 bg-amber-500/10 border-amber-500/20"}`}>
                                      {maxScore !== null ? `${maxScore.toFixed(2)} max` : "no score"}
                                    </span>
                                    <p className="text-xs text-muted-foreground mt-1">{Number(evt.chunks_returned ?? 0)} chunks</p>
                                  </div>
                                </div>
                                {scores.length > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    All scores: [{scores.map(s => s.toFixed(2)).join(", ")}]
                                  </div>
                                )}
                                {docIds.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Retrieved Documents</p>
                                    <div className="space-y-1">
                                      {docIds.map((id, j) => (
                                        <p key={j} className="text-xs font-mono text-muted-foreground truncate">{id}</p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {docContent.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Content Preview</p>
                                    <p className="text-xs text-muted-foreground italic leading-relaxed break-words">
                                      "{docContent[0].slice(0, 200)}{docContent[0].length > 200 ? "…" : ""}"
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Tab 4: Analysis Findings ── */}
                  {activeTab === "findings" && (
                    <div className="p-6">
                      {report ? (
                        report.findings.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                            <CheckCircle2 className="size-10 text-emerald-500/60" />
                            <p className="text-sm text-muted-foreground">No issues detected in this session.</p>
                          </div>
                        ) : (
                          <div className="space-y-5">
                            {report.findings.map((f: Finding, i: number) => {
                              const cfg = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG.medium;
                              return (
                                <div key={i} className={`rounded-xl border-l-4 ${cfg.border} ${cfg.bg} p-5 space-y-3`}>
                                  {/* Header */}
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0">
                                      <AlertTriangle className={`size-5 shrink-0 mt-0.5 ${cfg.text}`} />
                                      <h4 className={`text-base font-semibold leading-snug break-words ${cfg.text}`}>{f.title}</h4>
                                    </div>
                                    <span className={`shrink-0 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                                      {f.severity}
                                    </span>
                                  </div>

                                  {/* Description */}
                                  <p className="text-sm text-foreground leading-relaxed pl-8">{f.description}</p>

                                  {/* Evidence */}
                                  {f.evidence.length > 0 && (
                                    <div className="pl-8 space-y-1.5">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evidence</p>
                                      {f.evidence.map((ev, j) => (
                                        <p key={j} className="text-xs font-mono text-muted-foreground bg-background/60 rounded px-2 py-1 border break-all">{ev}</p>
                                      ))}
                                    </div>
                                  )}

                                  {/* Recommendation */}
                                  {f.recommendation && (
                                    <div className="pl-8 pt-2 border-t border-current/10">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Recommendation</p>
                                      <p className="text-sm font-medium text-foreground leading-relaxed">{f.recommendation}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                          <FileSearch className="size-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">Run analysis to see findings.</p>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
