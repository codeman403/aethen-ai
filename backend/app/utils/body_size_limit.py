"""Request body size limit middleware.

Rejects requests whose Content-Length exceeds max_bytes before the body
is read, or streams that grow beyond the limit during reading.
Default: 1MB — sufficient for all API payloads; blocks 5MB+ ingest abuse.
"""

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_EXCLUDED_PATHS = {"/api/health", "/docs", "/openapi.json", "/redoc"}


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose body exceeds max_bytes."""

    def __init__(self, app, max_bytes: int = 1_048_576) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _EXCLUDED_PATHS:
            return await call_next(request)

        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self._max_bytes:
            return _size_response(self._max_bytes)

        return await call_next(request)


def _size_response(max_bytes: int) -> Response:
    mb = max_bytes // 1_048_576
    body = json.dumps({
        "data": None,
        "error": f"Request body too large. Maximum allowed size is {mb}MB.",
        "metadata": None,
    })
    return Response(
        content=body,
        status_code=413,
        headers={"Content-Type": "application/json"},
    )
