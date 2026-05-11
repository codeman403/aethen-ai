# Authentication

---

## Overview

Aethen uses Supabase-issued JWTs for API authentication. The backend verifies tokens by calling Supabase's `/auth/v1/user` endpoint, which works for all sign-in methods (email/password, Google OAuth, GitHub OAuth) regardless of JWT signing algorithm.

---

## Middleware

`JWTAuthMiddleware` in `app/middleware/auth.py` runs on every `/api/*` request except the open paths.

### Flow

```
Request → Check path (open path?) → Check cache (60 s TTL)
  → If cache miss: call Supabase /auth/v1/user (5 s timeout)
  → Resolve org_id from Postgres
  → Detect admin (email in ADMIN_EMAILS)
  → Set request.state.{ user_id, org_id, is_admin }
  → Pass to next handler
```

### Open Paths (no JWT required)

```python
_OPEN_PATHS = frozenset({
    "/api/health",
    "/api/demo/chat",
    "/api/demo/scenarios",
    "/api/demo/run",
    "/api/demo/analyze-direct",
    "/docs",
    "/openapi.json",
    "/redoc",
})
```

### Token Cache

- In-memory dict: token → `(user_id, org_id, is_admin, expires_at)`
- TTL: 60 seconds
- Max size: 500 entries (LRU eviction on overflow)
- Avoids a Supabase network call on every API request

---

## Tenant Isolation

All data operations are scoped to `org_id`. The approved pattern:

```python
# In route handlers — use this helper, not request.state.org_id directly:
from app.utils.request_context import get_data_org_id

org_id = get_data_org_id(request)
# Returns None for admin (no filter), UUID for regular users,
# sentinel UUID for users without an org (zero results)
```

**Write operations** use the actor's real `org_id` (even for admins, to tag writes correctly). `get_actor_org_id(request)` handles this distinction.

---

## Admin Access

Users whose email is in the `ADMIN_EMAILS` environment variable:
- Have `request.state.is_admin = True`
- Receive `org_id = None` from `get_data_org_id()` → no org filter on reads
- Can view all sessions, stats, and admin panel
- Still receive their real org_id for write operations

```bash
# .env
ADMIN_EMAILS=admin@example.com,ops@example.com
```

---

## Frontend Auth (Supabase)

The frontend uses `@supabase/ssr` and `@supabase/supabase-js` for auth:

- `middleware.ts` — Next.js middleware protects dashboard routes, redirects unauthenticated users to `/login`
- `app/auth/callback/route.ts` — Handles OAuth callback after Google/GitHub sign-in
- All backend requests include the Supabase JWT in the `Authorization: Bearer` header

---

## Local Development Without Auth

When `SUPABASE_JWT_SECRET` is not set, the JWT middleware is not installed at all (`if settings.supabase_jwt_secret:` in `main.py`). All endpoints are accessible without authentication. A warning is logged at startup.

This is intentional for local development without a Supabase project. Do **not** run without JWT middleware in production.
