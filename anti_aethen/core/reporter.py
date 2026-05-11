"""Vulnerability reporting — severity, findings, and report generation."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import IntEnum
from pathlib import Path


class Severity(IntEnum):
    CRITICAL = 5
    HIGH     = 4
    MEDIUM   = 3
    LOW      = 2
    INFO     = 1
    PASS     = 0

    def label(self) -> str:
        return self.name

    def color(self) -> str:
        return {
            "CRITICAL": "bold red",
            "HIGH":     "red",
            "MEDIUM":   "yellow",
            "LOW":      "cyan",
            "INFO":     "blue",
            "PASS":     "green",
        }[self.name]


@dataclass
class VulnerabilityFinding:
    test_id:        str
    name:           str
    severity:       Severity
    description:    str
    evidence:       str       = ""
    recommendation: str       = ""
    module:         str       = ""

    def to_dict(self) -> dict:
        return {
            "test_id":        self.test_id,
            "name":           self.name,
            "severity":       self.severity.name,
            "description":    self.description,
            "evidence":       self.evidence,
            "recommendation": self.recommendation,
            "module":         self.module,
        }


def passed(test_id: str, name: str, module: str = "") -> VulnerabilityFinding:
    return VulnerabilityFinding(
        test_id=test_id, name=name, severity=Severity.PASS,
        description="Test passed — no vulnerability detected.", module=module,
    )


def finding(
    test_id: str, name: str, severity: Severity,
    description: str, evidence: str = "", recommendation: str = "",
    module: str = "",
) -> VulnerabilityFinding:
    return VulnerabilityFinding(
        test_id=test_id, name=name, severity=severity,
        description=description, evidence=evidence,
        recommendation=recommendation, module=module,
    )


class Report:
    def __init__(self) -> None:
        self.findings: list[VulnerabilityFinding] = []
        self.started_at = datetime.now(timezone.utc)
        self.finished_at: datetime | None = None

    def add(self, f: VulnerabilityFinding) -> None:
        self.findings.append(f)

    def add_many(self, findings: list[VulnerabilityFinding]) -> None:
        self.findings.extend(findings)

    def finish(self) -> None:
        self.finished_at = datetime.now(timezone.utc)

    def counts(self) -> dict[str, int]:
        counts: dict[str, int] = {s.name: 0 for s in Severity}
        for f in self.findings:
            counts[f.severity.name] += 1
        return counts

    def has_critical_or_high(self) -> bool:
        return any(f.severity >= Severity.HIGH for f in self.findings)

    def to_markdown(self) -> str:
        ts = self.started_at.strftime("%Y-%m-%d %H:%M UTC")
        elapsed = ""
        if self.finished_at:
            secs = (self.finished_at - self.started_at).total_seconds()
            elapsed = f" · {secs:.1f}s"

        lines = [
            "# Anti-Aethen Red Team Report",
            f"> Generated: {ts}{elapsed}",
            "",
            "## Summary",
            "",
        ]
        counts = self.counts()
        for sev in reversed(Severity):
            if sev == Severity.PASS:
                continue
            n = counts.get(sev.name, 0)
            indicator = "🔴" if sev >= Severity.HIGH else "🟡" if sev == Severity.MEDIUM else "🔵" if sev == Severity.LOW else "⚪"
            lines.append(f"| {indicator} **{sev.name}** | {n} |")

        n_pass = counts.get("PASS", 0)
        n_total = len(self.findings)
        lines.append(f"\n**{n_pass}/{n_total} tests passed**\n")

        # Group by module
        modules: dict[str, list[VulnerabilityFinding]] = {}
        for f in self.findings:
            modules.setdefault(f.module or "General", []).append(f)

        lines.append("## Findings\n")
        for module, module_findings in sorted(modules.items()):
            lines.append(f"### {module}\n")
            for f in sorted(module_findings, key=lambda x: -x.severity):
                icon = {"CRITICAL":"🔴","HIGH":"🔴","MEDIUM":"🟡","LOW":"🔵","INFO":"⚪","PASS":"✅"}.get(f.severity.name, "❓")
                lines.append(f"#### {icon} [{f.severity.name}] {f.name} `{f.test_id}`\n")
                lines.append(f"{f.description}\n")
                if f.evidence:
                    lines.append(f"**Evidence:**\n```\n{f.evidence}\n```\n")
                if f.recommendation:
                    lines.append(f"**Recommendation:** {f.recommendation}\n")
                lines.append("---\n")

        return "\n".join(lines)

    def save(self, results_dir: Path = Path("results")) -> tuple[Path, Path]:
        results_dir.mkdir(exist_ok=True)
        ts = self.started_at.strftime("%Y%m%d_%H%M%S")
        md_path   = results_dir / f"report_{ts}.md"
        json_path = results_dir / f"report_{ts}.json"

        md_path.write_text(self.to_markdown(), encoding="utf-8")
        json_path.write_text(
            json.dumps(
                {
                    "generated_at": self.started_at.isoformat(),
                    "counts": self.counts(),
                    "findings": [f.to_dict() for f in self.findings],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return md_path, json_path
