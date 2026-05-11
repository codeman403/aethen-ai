# Secrets Management

---

## Secret Categories

| Secret | Storage | Rotation |
|---|---|---|
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `COHERE_API_KEY` | Render env vars (server) | Rotate via Render dashboard |
| `DATABASE_URL` | Render env vars (server) | Rotate via Supabase (regenerate password) |
| `NEO4J_PASSWORD` | Render env vars (server) | Rotate via Neo4j Aura console |
| `SUPABASE_JWT_SECRET` | Render env vars (server) | Rotate via Supabase → API settings |
| `CREDENTIAL_ENCRYPTION_KEY` | Render env vars (server) | **Critical** — see below |
| `CRON_SECRET` | Vercel + Render env vars | Rotate in both places simultaneously |
| Per-org LLM keys | Postgres `app_settings` (Fernet-encrypted) | User-managed via Settings UI |

---

## `CREDENTIAL_ENCRYPTION_KEY`

This is the Fernet symmetric key used to encrypt per-org LLM credentials at rest.

**Generate:**
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Rotation procedure:**
1. Generate a new Fernet key
2. Write a migration script that decrypts all existing org keys with the old key and re-encrypts with the new key
3. Deploy the migration + new key atomically (downtime window required)

> **Warning:** If this key is lost, all stored per-org LLM credentials become unrecoverable. Back up the key securely (1Password, AWS Secrets Manager, etc.).

---

## Never Commit

The following must never appear in git:

- `.env` files (root-level or in `backend/`)
- `backend/.env`
- `frontend/.env.local`
- Any file containing `sk-`, `eyJ`, or `AIza...` patterns

`.gitignore` already excludes `.env*` patterns. The `anti_aethen/` directory is gitignored entirely.

---

## Local Development Secrets

For local development, copy `.env.example` to `backend/.env`:

```bash
cp .env.example backend/.env
# Fill in with your personal development keys
```

Use separate API keys for development and production. Never use production keys locally.

---

## CI/CD Secrets

GitHub Actions secrets are set in the repository settings. They are passed to workflows as environment variables and never logged.

Required secrets:
- `OPENAI_API_KEY` — for CI tests that make real LLM calls
- `DATABASE_URL` — for CI integration tests (can be a separate test database)
- `RENDER_API_KEY` — for smoke test auto-rollback

Optional secrets:
- `ANTHROPIC_API_KEY`, `COHERE_API_KEY`, `NEO4J_*` — tests fall back gracefully without these

---

## Security Scanning

Recommended: add `gitleaks` or `truffleHog` as a pre-commit hook to prevent accidental secret commits:

```bash
# Example: .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```
