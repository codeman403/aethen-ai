"use client";

import { useState } from "react";
import {
  Network,
  AlertCircle,
  TrendingUp,
  Layers,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionsList } from "@/components/features/SessionsList";
import { SessionContext } from "@/components/features/SessionContext";
import { analyzeSession, type AnalysisReport, type Finding } from "@/lib/api";

function ClusterNode({
  label,
  count,
  isSelected,
  pos,
  severity,
}: {
  label: string;
  count: number;
  isSelected?: boolean;
  pos: string;
  severity: "high" | "medium" | "low";
}) {
  const colors = {
    high: isSelected
      ? "bg-rose-500/10 border-2 border-rose-500 text-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.3)] scale-110"
      : "bg-rose-500/10 border border-rose-500/50 text-rose-600",
    medium: "bg-amber-500/10 border border-amber-500/50 text-amber-600",
    low: "bg-muted border text-muted-foreground",
  };
  const Icon = severity === "high" ? AlertCircle : severity === "medium" ? Network : TrendingUp;
  const iconSize = severity === "high" ? "size-6" : severity === "medium" ? "size-5" : "size-4";
  const padding = severity === "high" ? "p-4" : severity === "medium" ? "p-3" : "p-2.5";
  return (
    <div
      className={`absolute flex flex-col items-center gap-2 cursor-pointer z-10 transition-transform ${isSelected ? "" : "hover:scale-105"} ${pos}`}
    >
      <div className={`${padding} rounded-full ${colors[severity]} transition-transform`}>
        <Icon className={iconSize} />
      </div>
      <div
        className={`bg-card border px-3 py-1.5 rounded-lg shadow-sm text-center ${!isSelected ? "opacity-80" : ""}`}
      >
        <p className={`font-bold leading-tight ${severity === "high" ? "text-sm" : "text-xs"}`}>
          {label}
        </p>
        <p className={`text-muted-foreground font-medium ${severity === "high" ? "text-[10px]" : "text-[9px]"} uppercase tracking-wider`}>
          {count} {count === 1 ? "Failure" : "Failures"}
        </p>
      </div>
    </div>
  );
}

function FindingDetails({ finding }: { finding: Finding }) {
  return (
    <div className="p-6 space-y-8 flex-1 overflow-auto">
      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Severity
        </span>
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-foreground capitalize">
            {finding.severity}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Description
        </span>
        <div className="bg-muted/50 p-3 rounded-lg border text-sm shadow-inner text-foreground leading-relaxed">
          {finding.description}
        </div>
      </div>

      {finding.evidence.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Evidence
          </span>
          <ul className="space-y-1">
            {finding.evidence.map((ev, i) => (
              <li key={i} className="text-sm text-muted-foreground font-mono text-xs bg-muted/30 border px-3 py-2 rounded-lg">
                {ev}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
          Recommended Action
        </span>
        <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <p className="text-sm leading-relaxed text-foreground">
            {finding.recommendation || "No specific recommendation provided."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BlindSpotsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  const handleSelectSession = async (sessionData: object) => {
    const s = sessionData as { session_id: string };
    setSelectedId(s.session_id);
    setSelectedSession(sessionData as Record<string, unknown>);
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSession(sessionData);
      setReport(result);
      setSelectedFinding(result.findings[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  };

  const displayFinding = selectedFinding ?? report?.findings[0] ?? null;

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
          failureType="blind_spot"
          onSelect={handleSelectSession}
          selectedId={selectedId}
        />
        
      </div>

      <div className="grid lg:grid-cols-3 gap-6 h-[600px]">
        {/* Graph Area */}
        <div className="lg:col-span-2 border rounded-xl bg-card shadow-sm flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/10 flex justify-between items-center z-10">
            <h2 className="font-semibold flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" />
              {report ? "Blind Spot Clusters" : "Cluster Map (Neo4j Graph Data)"}
            </h2>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md border">
                <span className="size-2 rounded-full bg-rose-500" /> High Impact
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md border">
                <span className="size-2 rounded-full bg-amber-500" /> Medium
              </span>
            </div>
          </div>

          <div
            className="flex-1 relative bg-[#FAFAFA] dark:bg-[#050505] overflow-hidden"
            style={{
              backgroundImage:
                "radial-gradient(circle at 2px 2px, rgba(0,0,0,0.05) 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="relative w-full max-w-lg aspect-square">
                <svg
                  className="absolute inset-0 w-full h-full stroke-muted-foreground/20"
                  strokeWidth="2"
                  fill="none"
                >
                  <path
                    d="M 250 250 L 150 150 M 250 250 L 350 120 M 250 250 L 250 380"
                    strokeDasharray="4 4"
                  />
                </svg>

                {/* Center Node */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
                  <div className="size-16 rounded-full bg-card border shadow-lg flex items-center justify-center">
                    <span className="font-bold text-xl text-primary">Ae</span>
                  </div>
                </div>

                {report && report.findings.length > 0 ? (
                  <>
                    <ClusterNode
                      label={report.findings[0].title}
                      count={1}
                      isSelected
                      pos="top-[20%] left-[20%] -translate-x-1/2 -translate-y-1/2"
                      severity="high"
                    />
                    {report.findings[1] && (
                      <ClusterNode
                        label={report.findings[1].title}
                        count={1}
                        pos="top-[15%] right-[20%] translate-x-1/2 -translate-y-1/2"
                        severity="medium"
                      />
                    )}
                    {report.findings[2] && (
                      <ClusterNode
                        label={report.findings[2].title}
                        count={1}
                        pos="bottom-[20%] left-1/2 -translate-x-1/2 translate-y-1/2"
                        severity="low"
                      />
                    )}
                  </>
                ) : (
                  <>
                    <ClusterNode
                      label="Billing Policies"
                      count={14}
                      isSelected={!report}
                      pos="top-[20%] left-[20%] -translate-x-1/2 -translate-y-1/2"
                      severity="high"
                    />
                    <ClusterNode
                      label="Enterprise SSO"
                      count={8}
                      pos="top-[15%] right-[20%] translate-x-1/2 -translate-y-1/2"
                      severity="medium"
                    />
                    <ClusterNode
                      label="Password Reset"
                      count={2}
                      pos="bottom-[20%] left-1/2 -translate-x-1/2 translate-y-1/2"
                      severity="low"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Details Panel */}
        <div className="border rounded-xl bg-card shadow-sm flex flex-col overflow-hidden">
          <div
            className={`p-6 border-b ${report ? "bg-rose-500/5 border-rose-500/10" : "bg-muted/5"}`}
          >
            <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
              {report ? "Top Finding" : "Selected Cluster"}
            </h2>
            <h3 className="text-2xl font-bold tracking-tight text-foreground">
              {displayFinding?.title ?? "Billing Policies"}
            </h3>
          </div>

          {displayFinding ? (
            <>
              <FindingDetails finding={displayFinding} />
              <div className="p-4 border-t bg-muted/10">
                <div className="text-xs text-muted-foreground mb-3 space-y-1">
                  <div className="flex justify-between">
                    <span>Root Cause</span>
                    <span className="font-medium text-foreground max-w-[60%] text-right">
                      {report?.root_cause}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Confidence</span>
                    <span className="font-medium text-foreground">
                      {report ? Math.round(report.confidence * 100) + "%" : "—"}
                    </span>
                  </div>
                </div>
                <Button className="w-full font-medium" variant="default">
                  View All Traces
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-6 space-y-8 flex-1 overflow-auto">
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Impact
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-bold text-foreground">14</span>
                    <span className="text-sm font-medium text-muted-foreground leading-tight">
                      related sessions
                      <br />
                      failed in last 7 days
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Common Query Pattern
                  </span>
                  <div className="bg-muted/50 p-3 rounded-lg border font-mono text-sm shadow-inner text-foreground">
                    "pro-rated refunds after cancellation"
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Recommended Action
                  </span>
                  <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl relative overflow-hidden opacity-50">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <p className="text-sm leading-relaxed text-foreground">
                      Run an analysis to generate specific recommendations for
                      this session.
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t bg-muted/10">
                <Button
                  className="w-full font-medium"
                  variant="default"
                  disabled
                >
                  View All Traces
                </Button>
              </div>
            </>
          )}
        </div>
          {selectedSession && <SessionContext session={selectedSession} />}
      </div>
    </div>
  );
}