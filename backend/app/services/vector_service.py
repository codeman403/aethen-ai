"""Vector service — pgvector-backed, delegates to pgvector_service.

Kept as a thin wrapper so call sites don't import pgvector_service directly,
making a future backend swap a one-file change.
"""

from __future__ import annotations

from app.models.trace import Session
from app.services.pgvector_service import pgvector_service


class VectorService:

    @property
    def is_available(self) -> bool:
        return pgvector_service.is_available

    @property
    def backend_name(self) -> str:
        return "pgvector"

    async def upsert_session(self, session: Session, org_id: str | None = None) -> int:
        return await pgvector_service.upsert_session(session, org_id=org_id)

    async def query_similar(
        self,
        query_text: str,
        namespace: str = "traces",
        top_k: int = 10,
        filters: dict | None = None,
        org_id: str | None = None,
    ) -> list[dict]:
        return await pgvector_service.query_similar(
            query_text=query_text,
            namespace=namespace,
            top_k=top_k,
            filters=filters,
            org_id=org_id,
        )


vector_service = VectorService()
