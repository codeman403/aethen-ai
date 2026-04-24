"""Health check endpoint."""

from fastapi import APIRouter

from app.models.response import ApiResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiResponse[dict])
async def health_check() -> ApiResponse[dict]:
    """Return service health status."""
    return ApiResponse(
        data={"status": "healthy", "service": "aethen-backend"},
        error=None,
    )
