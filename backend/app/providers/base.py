"""Abstract base class for trace providers."""

from abc import ABC, abstractmethod

from app.models.trace import Session


class TraceProvider(ABC):
    """Interface for fetching agent execution traces.

    Both synthetic and live providers implement this interface,
    ensuring the downstream ingestion pipeline is source-agnostic.
    """

    @abstractmethod
    async def fetch_traces(self, limit: int = 50) -> list[Session]:
        """Fetch a batch of trace sessions.

        Args:
            limit: Maximum number of sessions to return.

        Returns:
            List of Session objects in Aethen's canonical format.
        """
        ...

    @abstractmethod
    async def health_check(self) -> dict:
        """Check provider connectivity.

        Returns:
            Dict with 'status' ('ok' | 'error') and optional 'detail'.
        """
        ...
