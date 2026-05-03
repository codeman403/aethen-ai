"""Shared test configuration.

Patches RateLimitMiddleware.dispatch to be a no-op for all tests EXCEPT those
in test_utils.py, which test rate limiting via fresh Starlette apps.
"""

from unittest.mock import patch
import pytest


@pytest.fixture(autouse=True)
def bypass_rate_limit(request):
    """Disable rate limiting to prevent counter accumulation across tests.

    Skipped for test_utils.py because those tests exercise rate limiting
    through fresh _build_app() instances, which are not affected by the
    class-level patch anyway — but we still skip for correctness.
    """
    if "test_utils" in request.module.__name__:
        yield
        return

    async def _passthrough(self, request, call_next):
        return await call_next(request)

    with patch("app.utils.rate_limit.RateLimitMiddleware.dispatch", new=_passthrough):
        yield
