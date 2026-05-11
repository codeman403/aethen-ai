"""Anti-Aethen red-team runner — orchestrates all attack modules."""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

import httpx

# ── Import attack modules ──────────────────────────────────────────────────

from attacks.t01_prompt_injection       import PromptInjectionAttacks
from attacks.t02_sql_injection          import SqlInjectionAttacks
from attacks.t03_tenant_isolation       import TenantIsolationAttacks
from attacks.t04_pii_bypass             import PiiBypassAttacks
from attacks.t05_confidence_manipulation import ConfidenceManipulationAttacks
from attacks.t06_sanitization_bypass    import SanitizationBypassAttacks
from attacks.t07_api_security           import ApiSecurityAttacks
from attacks.t08_qc_disclosure          import QcDisclosureAttacks
from attacks.t09_ethical_bias           import EthicalBiasAttacks
from attacks.t10_idor                   import IdorAttacks
from attacks.t11_security_headers       import SecurityHeadersAttacks

from core.attacker  import Attack
from core.reporter  import Report, Severity, VulnerabilityFinding
import config

# ── Registry ──────────────────────────────────────────────────────────────

ALL_ATTACKS: dict[str, type[Attack]] = {
    "t01": PromptInjectionAttacks,
    "t02": SqlInjectionAttacks,
    "t03": TenantIsolationAttacks,
    "t04": PiiBypassAttacks,
    "t05": ConfidenceManipulationAttacks,
    "t06": SanitizationBypassAttacks,
    "t07": ApiSecurityAttacks,
    "t08": QcDisclosureAttacks,
    "t09": EthicalBiasAttacks,
    "t10": IdorAttacks,
    "t11": SecurityHeadersAttacks,
}

# ── ANSI colors ───────────────────────────────────────────────────────────

RED     = "\033[91m"
YELLOW  = "\033[93m"
GREEN   = "\033[92m"
CYAN    = "\033[96m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
RESET   = "\033[0m"

SEVERITY_COLOR = {
    Severity.CRITICAL: RED + BOLD,
    Severity.HIGH:     RED,
    Severity.MEDIUM:   YELLOW,
    Severity.LOW:      CYAN,
    Severity.INFO:     DIM,
    Severity.PASS:     GREEN,
}

# ── Validation ────────────────────────────────────────────────────────────

async def _validate(client: httpx.AsyncClient) -> bool:
    """Check target is reachable and token is valid."""
    try:
        resp = await client.get(f"{config.TARGET_URL}/api/health", timeout=10)
        if resp.status_code != 200:
            print(f"{RED}✗ Target unreachable — GET /api/health returned {resp.status_code}{RESET}")
            return False
    except Exception as exc:
        print(f"{RED}✗ Target unreachable: {exc}{RESET}")
        return False

    if not config.ORG_A_TOKEN:
        print(f"{YELLOW}⚠ ANTI_AETHEN_TOKEN not set — auth-required tests will be skipped{RESET}")
    else:
        resp = await client.get(
            f"{config.TARGET_URL}/api/stats",
            headers={"Authorization": f"Bearer {config.ORG_A_TOKEN}"},
            timeout=10,
        )
        if resp.status_code == 401:
            print(f"{RED}✗ ANTI_AETHEN_TOKEN is invalid (401 on /api/stats){RESET}")
            return False

    print(f"{GREEN}✓ Target reachable: {config.TARGET_URL}{RESET}")
    return True


# ── Module runner ─────────────────────────────────────────────────────────

async def _run_module(
    cls: type[Attack],
    client: httpx.AsyncClient,
    dry_run: bool,
) -> list[VulnerabilityFinding]:
    instance = cls(client=client, token=config.ORG_A_TOKEN, base_url=config.TARGET_URL)
    print(f"\n{BOLD}▶ {instance.module}{RESET}  {DIM}{instance.description}{RESET}")

    if dry_run:
        print(f"  {DIM}[dry-run — skipping]{RESET}")
        return []

    await instance.setup()
    try:
        findings = await instance.run()
    finally:
        await instance.teardown()

    for f in findings:
        color = SEVERITY_COLOR.get(f.severity, "")
        marker = "✓" if f.severity == Severity.PASS else "✗"
        print(f"  {color}{marker} [{f.test_id}] {f.name}{RESET}")
        if f.severity not in (Severity.PASS,) and f.description:
            for line in f.description.splitlines():
                print(f"      {DIM}{line}{RESET}")

    return findings


# ── Summary printer ───────────────────────────────────────────────────────

def _print_summary(findings: list[VulnerabilityFinding], elapsed: float) -> None:
    counts: dict[Severity, int] = {s: 0 for s in Severity}
    for f in findings:
        counts[f.severity] += 1

    print(f"\n{BOLD}{'═'*52}{RESET}")
    print(f"{BOLD}   ANTI-AETHEN RED TEAM RESULTS{RESET}")
    print(f"{BOLD}{'═'*52}{RESET}")

    for sev in [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO]:
        n = counts[sev]
        color = SEVERITY_COLOR[sev] if n > 0 else DIM
        print(f"  {color}{sev.name:<10}{RESET}  {n}")

    passed = counts[Severity.PASS]
    total  = len(findings)
    print(f"  {GREEN}{'PASSED':<10}{RESET}  {passed}/{total}")
    print(f"  {DIM}Elapsed: {elapsed:.1f}s{RESET}")
    print(f"{BOLD}{'═'*52}{RESET}")


# ── Main ──────────────────────────────────────────────────────────────────

async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Anti-Aethen — red team runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python runner.py                      # full run\n"
            "  python runner.py --attacks t01,t07   # specific modules\n"
            "  python runner.py --dry-run            # validate config only\n"
            "  python runner.py --parallel           # run modules concurrently\n"
        ),
    )
    parser.add_argument(
        "--attacks", default="",
        help="Comma-separated module IDs to run, e.g. t01,t07 (default: all)",
    )
    parser.add_argument(
        "--parallel", action="store_true",
        help="Run all selected modules concurrently",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Validate config and print module list without making requests",
    )
    parser.add_argument(
        "--no-report", action="store_true",
        help="Skip writing report files to results/",
    )
    args = parser.parse_args(argv)

    # Determine which modules to run
    if args.attacks:
        keys = [k.strip().lower() for k in args.attacks.split(",")]
        unknown = [k for k in keys if k not in ALL_ATTACKS]
        if unknown:
            print(f"{RED}Unknown attack modules: {unknown}{RESET}")
            print(f"Available: {sorted(ALL_ATTACKS)}")
            return 2
        selected = {k: ALL_ATTACKS[k] for k in keys}
    else:
        selected = ALL_ATTACKS

    limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        limits=limits,
        follow_redirects=True,
    ) as client:
        if not await _validate(client):
            return 1

        print(f"\n{BOLD}Running {len(selected)} module(s):{RESET} {', '.join(selected)}")
        if args.parallel:
            print(f"{DIM}Mode: parallel{RESET}")

        t_start = time.monotonic()
        all_findings: list[VulnerabilityFinding] = []

        if args.parallel:
            tasks = [_run_module(cls, client, args.dry_run) for cls in selected.values()]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, list):
                    all_findings.extend(r)
                else:
                    print(f"{RED}Module error: {r}{RESET}")
        else:
            for i, cls in enumerate(selected.values()):
                findings = await _run_module(cls, client, args.dry_run)
                all_findings.extend(findings)
                # Brief pause between modules so the rate-limiter window doesn't
                # carry over hits from a burst test (e.g. T07.8 → T08)
                if i < len(selected) - 1 and not args.dry_run:
                    await asyncio.sleep(2)

        elapsed = time.monotonic() - t_start

    _print_summary(all_findings, elapsed)

    if not args.dry_run and not args.no_report and all_findings:
        report = Report()
        report.add_many(all_findings)
        report.finish()
        results_dir = Path(__file__).parent / "results"
        md_path, json_path = report.save(results_dir)
        print(f"\n{DIM}Report saved:{RESET}")
        print(f"  {md_path}")
        print(f"  {json_path}")

    critical = sum(1 for f in all_findings if f.severity == Severity.CRITICAL)
    high     = sum(1 for f in all_findings if f.severity == Severity.HIGH)
    return 1 if (critical + high) > 0 else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
