"""Embedding generation service."""

import structlog
from openai import AsyncOpenAI

from app.config import settings

logger = structlog.get_logger()


class EmbeddingService:
    """Generates text embeddings using OpenAI's API."""

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None
        self.model = "text-embedding-3-small"
        self.dimensions = 1536

    async def initialize(self) -> None:
        """Initialize the OpenAI async client."""
        if not settings.openai_api_key:
            logger.warning("embedding_service_no_key", msg="OPENAI_API_KEY not set, embeddings unavailable")
            return
        kwargs: dict = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
            kwargs["default_headers"] = {"x-session-id": "aethen-embedding-service"}
        self._client = AsyncOpenAI(**kwargs)
        logger.info("embedding_service_initialized", model=self.model)

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text string."""
        if not self._client:
            raise RuntimeError("EmbeddingService not initialized — OPENAI_API_KEY missing")
        response = await self._client.embeddings.create(
            model=self.model,
            input=text,
            dimensions=self.dimensions,
        )
        return response.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts."""
        if not self._client:
            raise RuntimeError("EmbeddingService not initialized — OPENAI_API_KEY missing")
        response = await self._client.embeddings.create(
            model=self.model,
            input=texts,
            dimensions=self.dimensions,
        )
        return [item.embedding for item in response.data]


embedding_service = EmbeddingService()
