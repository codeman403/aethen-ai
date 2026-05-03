"""IP-based rate limiting middleware.

Enforces two sliding-window limits per client IP:
  - 100 requests / minute
  - 1000 requests / hour

Uses an in-memory store (sufficient for single-process deployment on Render).
Resets on restart — acceptable for a stateless abuse guard.
"""

import json
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Read-only paths that don't count against the rate limit
_EXCLUDED = {"/api/health", "/docs", "/openapi.json", "/redoc"}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter applied to all non-excluded routes."""

    def __init__(self, app, per_minute: int = 100, per_hour: int = 1000) -> None:
        super().__init__(app)
        self._per_minute = per_minute
        self._per_hour = per_hour
        # ip → list of request timestamps (unix seconds)
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _get_ip(self, request: Request) -> str:
        # Honour X-Forwarded-For so the real client IP is used behind Render/Vercel proxies
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _EXCLUDED:
            return await call_next(request)

        ip = self._get_ip(request)
        now = time.monotonic()

        # Prune timestamps outside the 1-hour window
        self._hits[ip] = [t for t in self._hits[ip] if now - t < 3600]

        minute_hits = sum(1 for t in self._hits[ip] if now - t < 60)
        hour_hits = len(self._hits[ip])

        if minute_hits >= self._per_minute:
            return _limit_response("Rate limit exceeded: 100 requests/minute per IP.")

        if hour_hits >= self._per_hour:
            return _limit_response("Rate limit exceeded: 1000 requests/hour per IP.")

        self._hits[ip].append(now)
        return await call_next(request)


def _limit_response(detail: str) -> Response:
    body = json.dumps({"data": None, "error": detail, "metadata": None})
    return Response(
        content=body,
        status_code=429,
        headers={"Retry-After": "60", "Content-Type": "application/json"},
    )
