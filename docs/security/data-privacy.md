# Data Privacy

---

## Data Collected

Aethen stores:

| Data type | Storage | Contains PII risk? |
|---|---|---|
| AI agent execution traces | PostgreSQL `sessions` | Potentially (LLM prompts may contain user data) |
| Embedded trace events | pgvector `session_vectors` | Low (text representations, PII redacted) |
| Graph relationships | Neo4j | No (session IDs, failure types only) |
| Chat conversation history | PostgreSQL `chat_messages` | Potentially (user questions) |
| User profiles | Supabase Auth | Email, name |
| Per-org LLM credentials | PostgreSQL (Fernet-encrypted) | API keys only |

---

## PII Redaction

PII is automatically detected and redacted before any trace data is stored:

```python
# Applied at ingest time in app/middleware/pii_redactor.py
pii_redactor = PIIRedactor()
redacted_session = pii_redactor.redact(session)
```

**What gets redacted (scrubadub detectors):**
- Email addresses → `[REDACTED EMAIL]`
- Phone numbers → `[REDACTED PHONE]`
- Credit card numbers → `[REDACTED CREDIT CARD]`
- US social security numbers → `[REDACTED SSN]`

**Configurable:** Set `PII_REDACTION_ENABLED=false` in `.env` to disable (not recommended for production).

---

## Tenant Data Isolation

Each organisation's data is completely isolated:
- Every Postgres query includes `WHERE org_id = $1`
- Every pgvector query includes `AND (org_id = $4 OR org_id IS NULL)`
- Admins can view all data (scoped to their explicit admin status)
- Users without an org receive a sentinel UUID (returns zero results)

---

## Data at Sentry

Sentry error tracking is configured with `send_default_pii=False`. No user identifiers, request bodies, or stack trace variables containing potential PII are sent to Sentry.

---

## Data Retention

No automated data retention/deletion policy is implemented in v0.1. Sessions and vectors persist indefinitely.

**Future:** Add configurable retention policy per org (e.g., delete sessions > 90 days old) via a scheduled cleanup job.

---

## Right to Erasure

Currently manual: admin must delete sessions via database query. A user-facing data deletion API is on the future roadmap.

---

## Legal

- [Privacy Policy](https://aethen-ai.vercel.app/privacy) — describes data collection and usage
- [Terms of Service](https://aethen-ai.vercel.app/terms) — usage terms

Both pages are at `/privacy` and `/terms` in the frontend public routes.
