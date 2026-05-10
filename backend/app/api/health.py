"""Health check endpoint."""

from fastapi import APIRouter, Request

from app.models.response import ApiResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiResponse[dict])
async def health_check() -> ApiResponse[dict]:
    """Return service health status."""
    return ApiResponse(
        data={"status": "healthy", "service": "aethen-backend"},
        error=None,
    )


@router.get("/auth/status", response_model=ApiResponse[dict])
async def auth_status(request: Request) -> ApiResponse[dict]:
    """Return current user's auth state. Useful for diagnosing admin detection."""
    user_id: str = getattr(request.state, "user_id", "") or ""
    org_id: str | None = getattr(request.state, "org_id", None)
    is_admin: bool = getattr(request.state, "is_admin", False)
    return ApiResponse(
        data={
            "authenticated": bool(user_id),
            "user_id": user_id,
            "org_id": org_id,
            "is_admin": is_admin,
        },
        error=None,
    )
