# Anti-Aethen — Red Team Module

Simulates real-world attacks against Aethen to identify security, safety, and ethical vulnerabilities before production deployment.

---

## Setup

```bash
cd anti_aethen
pip install -r requirements.txt
```

### Environment variables

```bash
export ANTI_AETHEN_TARGET="http://localhost:8000"      # default
export ANTI_AETHEN_TOKEN="<valid_jwt_for_test_user>"   # Org A
export ANTI_AETHEN_ORG_B_TOKEN="<valid_jwt_second_org>"  # required for T03, T08
export ANTI_AETHEN_ADMIN_TOKEN="<admin_jwt>"           # optional
```

Start the backend first:

```bash
cd ../backend
poetry run uvicorn app.main:app --reload --port 8000
```

---

## Usage

```bash
# Full red team run
python runner.py

# Specific modules only
python runner.py --attacks t01,t07

# Run all modules concurrently
python runner.py --parallel

# Validate config without making requests
python runner.py --dry-run

# Skip writing report files
python runner.py --no-report
```

Exit code: `0` = no CRITICAL/HIGH findings, `1` = CRITICAL or HIGH found.

---

## Attack Modules

| ID  | Module | Tests | Key Attack Surface |
|-----|--------|-------|--------------------|
| T01 | Prompt Injection | 5 | Stored failure_summary, tool errors, LLM response, history |
| T02 | SQL Injection | 6 | UNION bypass, CTE exfiltration, time-based blind, blocklist evasion |
| T03 | Tenant Isolation | 5 | Cross-org session read, QC, stats, chat, backfill |
| T04 | PII Bypass | 4 | Spaced PII, unicode homoglyphs, medical IDs, context-based identity |
| T05 | Confidence Manipulation | 5 | Signal stuffing, score inflation, suppression, boundary conditions |
| T06 | Sanitization Bypass | 7 | Case, newlines, HTML entities, zero-width chars, URL encoding |
| T07 | API Security | 9 | JWT validation, rate limiting, CORS, oversized payloads, path traversal |
| T08 | QC Disclosure | 4 | Cross-org leakage, timing oracle, bulk enumeration |
| T09 | Ethical Bias | 4 | Agent name bias, language style, tool name, timestamp |

---

## Output

Reports are saved to `results/` as both Markdown and JSON:

```
results/
├── report_20260508_120000.md
└── report_20260508_120000.json
```

### Severity levels

| Level | Meaning |
|-------|---------|
| CRITICAL | Data breach / auth bypass confirmed |
| HIGH | Exploitable with moderate effort |
| MEDIUM | Potential weakness requiring investigation |
| LOW | Minor hardening gap |
| INFO | Informational observation |
| PASS | Test passed — no vulnerability found |

---

## Architecture

```
anti_aethen/
├── config.py                    — target URL + token env vars
├── runner.py                    — CLI orchestrator
├── core/
│   ├── attacker.py              — base Attack class (setup/run/teardown)
│   ├── reporter.py              — Severity, VulnerabilityFinding, Report
│   └── session_builder.py       — crafts malicious Session payloads
├── attacks/
│   ├── t01_prompt_injection.py
│   ├── t02_sql_injection.py
│   ├── t03_tenant_isolation.py
│   ├── t04_pii_bypass.py
│   ├── t05_confidence_manipulation.py
│   ├── t06_sanitization_bypass.py
│   ├── t07_api_security.py
│   ├── t08_qc_disclosure.py
│   └── t09_ethical_bias.py
├── payloads/
│   ├── prompt_injection.json
│   ├── sql_payloads.json
│   └── pii_samples.json
└── results/                     — auto-created, gitignored
```

---

## Expected baseline results

Running against a hardened Aethen instance should produce:

```
CRITICAL   0
HIGH       0–2   ← A03 (QC cross-org) if org_id not scoped on /api/qc
MEDIUM     2–4
LOW        3–5
INFO       1–2
PASSED     25+
```

Any CRITICAL or HIGH finding causes the runner to exit with code `1`.
