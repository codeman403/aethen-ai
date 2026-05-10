"""JWT authentication middleware — verifies tokens via Supabase Auth API.

Calls Supabase's /auth/v1/user endpoint to validate the Bearer token.
This works for all sign-in methods (email, Google, GitHub) regardless of
the JWT signing algorithm used by the provider.

Verified user data is cached for 60 seconds per token to avoid a network
round-trip on every API request.

Admin detection: if the authenticated user's email is in ADMIN_EMAILS (config),
request.state.is_admin is set to True and org_id scoping is bypassed so they
can access all data across every organization.
"""

import time
import structlog
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = structlog.get_logger()

# Paths that skip token verification
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

# Cache: token → (user_id, org_id, is_admin, expires_at, email)
_TOKEN_CACHE: dict[str, tuple[str, str | None, bool, float, str]] = {}
_CACHE_TTL = 60  # seconds
_CACHE_MAX_SIZE = 500


def _cache_get(token: str) -> tuple[str, str | None, bool, str] | None:
    entry = _TOKEN_CACHE.get(token)
    if entry and entry[3] > time.monotonic():
        return entry[0], entry[1], entry[2], entry[4]
    if entry:
        _TOKEN_CACHE.pop(token, None)
    return None


def _cache_set(token: str, user_id: str, org_id: str | None, is_admin: bool, email: str = "") -> None:
    if len(_TOKEN_CACHE) >= _CACHE_MAX_SIZE:
        cutoff = time.monotonic()
        stale = [k for k, v in _TOKEN_CACHE.items() if v[3] <= cutoff]
        for k in stale[:_CACHE_MAX_SIZE // 4]:
            _TOKEN_CACHE.pop(k, None)
    _TOKEN_CACHE[token] = (user_id, org_id, is_admin, time.monotonic() + _CACHE_TTL, email)


async def _verify_token(token: str) -> dict | None:
    """Call Supabase /auth/v1/user to verify the token and return user data."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        logger.warning("supabase_not_configured", msg="SUPABASE_URL or SUPABASE_ANON_KEY not set")
        return None

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
        if response.status_code == 200:
            return response.json()
        logger.debug("supabase_token_rejected", status=response.status_code)
        return None
    except httpx.TimeoutException:
        logger.warning("supabase_auth_timeout")
        return None
    except Exception as exc:
        logger.error("supabase_auth_error", error=str(exc))
        return None


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Verify Supabase tokens and inject user_id, org_id, is_admin into request.state."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip auth when Supabase is not configured (local dev / tests without JWT secret)
        if not settings.supabase_url or not settings.supabase_anon_key:
            return await call_next(request)

        # Skip auth for non-API routes and open paths
        if not path.startswith("/api") or path in _OPEN_PATHS:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return self._unauthorized("Missing or malformed Authorization header")

        token = auth_header.removeprefix("Bearer ").strip()

        # Check cache first
        cached = _cache_get(token)
        if cached:
            request.state.user_id, request.state.org_id, request.state.is_admin, request.state.email = cached
            return await call_next(request)

        # Verify via Supabase Auth API
        user_data = await _verify_token(token)
        if not user_data:
            return self._unauthorized("Invalid or expired token")

        user_id: str = user_data.get("id", "")
        if not user_id:
            return self._unauthorized("Token missing user id")

        # Admin detection — check email against ADMIN_EMAILS config
        email: str = (user_data.get("email") or "").lower()
        is_admin: bool = bool(email and email in settings.admin_email_set)

        # Always resolve org_id so writes are attributed to the correct org.
        # get_data_org_id() returns None for admins (no read filter);
        # get_actor_org_id() returns the real org_id for write tagging.
        org_id = await self._get_org_id(user_id)
        if is_admin:
            logger.info("admin_authenticated", user_id=user_id, email=email, path=path)
        elif settings.admin_email_set:
            # Log the mismatch so we can diagnose email differences
            logger.info("admin_check_failed", email=email,
                        configured_count=len(settings.admin_email_set), path=path)

        _cache_set(token, user_id, org_id, is_admin, email)

        request.state.user_id = user_id
        request.state.org_id = org_id
        request.state.is_admin = is_admin
        request.state.email = email

        logger.debug("jwt_authenticated", user_id=user_id, is_admin=is_admin, path=path)
        return await call_next(request)

    @staticmethod
    def _unauthorized(detail: str) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={"error": detail, "data": None, "metadata": None},
        )

    @staticmethod
    async def _get_org_id(user_id: str) -> str | None:
        try:
            from app.services.postgres_service import postgres_service
            return await postgres_service.get_user_org_id(user_id)
        except Exception as exc:
            logger.warning("org_lookup_failed", user_id=user_id, error=str(exc))
            return None
