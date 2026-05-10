"""Vector service router — transparent switchover between Pinecone and pgvector.

USE_PGVECTOR=false (default) → Pinecone (unchanged behaviour)
USE_PGVECTOR=true            → pgvector (Postgres-native)

Rollback: set USE_PGVECTOR=false on Render → instant revert, no redeploy needed.
"""

from __future__ import annotations

import structlog

from app.config import settings
from app.models.trace import Session

logger = structlog.get_logger()


def _backend():
    if settings.use_pgvector:
        from app.services.pgvector_service import pgvector_service
        return pgvector_service
    from app.services.pinecone_service import pinecone_service
    return pinecone_service


class VectorService:
    """Unified interface used by ingest, retrieve, and the backfill script."""

    @property
    def is_available(self) -> bool:
        return _backend().is_available

    @property
    def backend_name(self) -> str:
        return "pgvector" if settings.use_pgvector else "pinecone"

    async def upsert_session(self, session: Session, org_id: str | None = None) -> int:
        """Write vectors. In dual-write mode writes to BOTH backends."""
        total = 0

        # Always write to Pinecone while it is still the source of truth
        # (keeps it in sync so rollback is instant at any time).
        if not settings.use_pgvector:
            from app.services.pinecone_service import pinecone_service
            if pinecone_service.is_available:
                try:
                    total = await pinecone_service.upsert_session(session)
                except Exception as exc:
                    logger.warning("pinecone_upsert_failed", error=str(exc))
            return total

        # USE_PGVECTOR=true: dual-write to both, primary is pgvector
        from app.services.pgvector_service import pgvector_service
        from app.services.pinecone_service import pinecone_service

        if pgvector_service.is_available:
            try:
                total = await pgvector_service.upsert_session(session, org_id=org_id)
            except Exception as exc:
                logger.warning("pgvector_upsert_failed", error=str(exc))

        # Dual-write to Pinecone so rollback restores instantly
        if pinecone_service.is_available:
            try:
                await pinecone_service.upsert_session(session)
            except Exception as exc:
                logger.debug("pinecone_dual_write_failed", error=str(exc))

        return total

    async def query_similar(
        self,
        query_text: str,
        namespace: str = "traces",
        top_k: int = 10,
        filters: dict | None = None,
        org_id: str | None = None,
    ) -> list[dict]:
        return await _backend().query_similar(
            query_text=query_text,
            namespace=namespace,
            top_k=top_k,
            filters=filters,
            **({"org_id": org_id} if settings.use_pgvector else {}),
        )


vector_service = VectorService()
