# Security Policy

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

Report security issues privately via **GitHub Security Advisories**:  
[https://github.com/codeman403/aethen-ai/security/advisories/new](https://github.com/codeman403/aethen-ai/security/advisories/new)

Include: description of the issue, reproduction steps, potential impact, and any suggested remediation.

---

## Security Architecture

### Authentication

- **JWT verification** via Supabase Auth API (`/auth/v1/user`) — works for all sign-in methods (email, Google, GitHub)
- **Token caching** — 60-second TTL per token, max 500 entries, prevents per-request network overhead
- **Admin bypass** — emails in `ADMIN_EMAILS` env var can access all org data (used for internal monitoring only)
- **Public paths** — `GET /api/health`, `POST /api/demo/*`, `/docs` require no authentication

### Tenant Isolation

- Every database read and write filters by `org_id`
- `get_data_org_id(request)` in `app/utils/request_context.py` is the only approved way to retrieve org scope in route handlers — never use `request.state.org_id` directly
- Admin requests return `org_id=None` to bypass filtering; all other requests get a specific UUID or a sentinel UUID for users without an org

### Input Validation and Injection Protection

- **Schema validation** — Pydantic v2 strict mode at every API boundary
- **Prompt injection** — `strip_injection()` in `app/utils/sanitize.py` applied at:
  - Ingest endpoint: `failure_summary` field
  - Every LLM-facing pipeline node: `tc.error`, `tc.result`, `lc.response` (with `full_redact=True`)
  - Chat endpoint: all freeform SQL query results
- **SQL injection** — parameterised queries throughout (`asyncpg`); LLM-generated SQL requires explicit parameterisation
- **IDOR** — all session/vector queries include `org_id` scoping

### PII Protection

- **scrubadub** automatic redaction applied to all session data before storage
- Configurable via `PII_REDACTION_ENABLED` env var
- Sentry is configured with `send_default_pii=False`

### Rate Limiting and Abuse Prevention

- **Rate limiting** — 100 requests/minute, 1 000 requests/hour per IP (`RateLimitMiddleware`)
- **Body size limit** — 1 MB maximum request body (`BodySizeLimitMiddleware`)
- **CORS** — configured frontend URL + `*.vercel.app` pattern only

### Security Headers

`SecurityHeadersMiddleware` applies on every response:

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | Restrictive policy |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### Credential Encryption

Per-org LLM API keys (OpenAI, Anthropic, Cohere) are:
1. Encrypted with Fernet symmetric encryption before storage in Postgres (`app_settings` table)
2. Injected at request time via `contextvars.ContextVar` — coroutine-scoped, never leaks across concurrent requests
3. Never logged, never returned in API responses

Fernet key: stored in `CREDENTIAL_ENCRYPTION_KEY` env var — never committed to source control.

---

## Red Team Results

Aethen was subjected to a comprehensive red team exercise via the Anti-Aethen module (`anti_aethen/`):

| Attack Module | Tests | Final Status |
|---|---|---|
| T01 — Prompt Injection | 5 | All PASS |
| T02 — SQL Injection | 5 | All PASS |
| T03 — Tenant Isolation | 7 | All PASS |
| T04 — PII Bypass | 7 | All PASS |
| T05 — Confidence Manipulation | 5 | All PASS |
| T06 — Sanitization Bypass | 6 | All PASS |
| T07 — API Security | 8 | All PASS |
| T08 — QC Disclosure | 5 | All PASS |
| T09 — Ethical Bias | 6 | All PASS |
| T10 — IDOR | 6 | All PASS |
| T11 — Security Headers | 8 | All PASS |
| **Total** | **68** | **64/68 PASS, 4 INFO** |

0 CRITICAL · 0 HIGH · 0 MEDIUM findings exploitable in production.

The 4 INFO findings are documented limitations that require an external second test account (cross-org verification) — documented in `docs/security_red_team_report.md`.

Full report: [docs/security_red_team_report.md](docs/security_red_team_report.md)

---

## Supported Versions

| Branch | Supported |
|---|---|
| `main` | Yes |
| `develop` | Best-effort |
| Older branches | No |
