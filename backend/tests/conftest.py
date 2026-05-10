"""Shared test configuration.

Patches middleware to be no-ops for all tests so that unit tests focus on
endpoint logic rather than infrastructure concerns.
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


@pytest.fixture(autouse=True)
def bypass_jwt_auth():
    """Bypass JWT authentication for all tests.

    The JWTAuthMiddleware requires live Supabase credentials which are not
    available in unit tests. Patching dispatch to passthrough prevents 401s
    on every endpoint test.
    """
    async def _passthrough(self, request, call_next):
        return await call_next(request)

    with patch("app.middleware.auth.JWTAuthMiddleware.dispatch", new=_passthrough):
        yield
