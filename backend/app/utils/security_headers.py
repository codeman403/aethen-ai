"""Security response headers middleware.

Adds defensive HTTP headers to every response to protect against common
browser-level attacks: clickjacking, MIME sniffing, XSS, etc.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# FastAPI's Swagger UI and ReDoc load assets from the jsdelivr CDN.
# These paths get a relaxed CSP so the docs render correctly.
_DOCS_PATHS = frozenset({"/docs", "/redoc", "/openapi.json"})

# Strict CSP for all API routes
_API_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "connect-src 'self';"
)

# Relaxed CSP for documentation pages (Swagger UI / ReDoc need CDN assets)
_DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://cdn.jsdelivr.net; "
    "connect-src 'self';"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        csp = _DOCS_CSP if request.url.path in _DOCS_PATHS else _API_CSP
        response.headers["Content-Security-Policy"] = csp
        return response
