"""Standard API response envelope."""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ResponseMetadata(BaseModel):
    """Metadata included in every API response."""

    request_id: str = Field(description="Unique request identifier")
    duration_ms: float | None = Field(default=None, description="Request duration in milliseconds")


class ApiResponse(BaseModel, Generic[T]):
    """Standard response envelope for all API endpoints."""

    data: T | None = Field(default=None, description="Response payload")
    error: str | None = Field(default=None, description="Error message if request failed")
    metadata: ResponseMetadata | None = Field(default=None, description="Request metadata")
