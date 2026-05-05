"""Shared test configuration.

Patches RateLimitMiddleware.dispatch to be a no-op for all tests EXCEPT those
in test_utils.py, which test rate limiting via fresh Starlette apps.
"""

from unittest.mock import patch, AsyncMock
import pytest


@pytest.fixture(autouse=True)
def bypass_rate_limit(request):
    """Disable rate limiting to prevent counter accumulation across tests."""
    if "test_utils" in request.module.__name__:
        yield
        return

    async def _passthrough(self, request, call_next):
        return await call_next(request)

    with patch("app.utils.rate_limit.RateLimitMiddleware.dispatch", new=_passthrough):
        yield


@pytest.fixture(autouse=True)
def bypass_api_key_auth():
    """Bypass API key validation for all tests — no DB call needed."""
    with patch("app.api.api_key.validate_api_key", new=AsyncMock(return_value=True)):
        yield
