import { type AnalysisReport } from "@/lib/api";

type AnalysisMetricsProps = {
  report: AnalysisReport | null;
  className?: string;
  itemClassName?: string;
  findingsLabel?: string;
};

export function AnalysisMetrics({
  report,
  className = "",
  itemClassName = "p-4 bg-muted/10",
  findingsLabel = "Findings",
}: AnalysisMetricsProps) {
  const confidenceClass = !report
    ? "text-muted-foreground/40"
    : report.confidence >= 0.7
      ? "text-emerald-600"
      : report.confidence >= 0.4
        ? "text-amber-600"
        : "text-rose-600";

  const metrics = [
    {
      label: "Confidence",
      value: report ? `${Math.round(report.confidence * 100)}%` : "—",
      cls: confidenceClass,
    },
    {
      label: findingsLabel,
      value: report ? String(report.findings.length) : "—",
      cls: "text-foreground",
    },
    {
      label: "High / Critical",
      value: report
        ? String(
            report.findings.filter(
              (f) => f.severity === "high" || f.severity === "critical"
            ).length
          )
        : "—",
      cls: "text-rose-600",
    },
    {
      label: "Medium / Low",
      value: report
        ? String(
            report.findings.filter(
              (f) => f.severity === "medium" || f.severity === "low"
            ).length
          )
        : "—",
      cls: "text-amber-600",
    },
  ];

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 divide-x ${className}`}>
      {metrics.map(({ label, value, cls }) => (
        <div key={label} className={itemClassName}>
          <p className="text-sm font-semibold text-muted-foreground mb-1">{label}</p>
          <span className={`text-2xl font-bold ${cls}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
