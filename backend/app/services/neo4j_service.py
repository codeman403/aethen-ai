"""Neo4j graph database service."""

import structlog
from neo4j import AsyncDriver, AsyncGraphDatabase

from app.config import settings
from app.models.trace import Session

logger = structlog.get_logger()


class Neo4jService:
    """Manages session and failure pattern storage in Neo4j."""

    def __init__(self) -> None:
        self._driver: AsyncDriver | None = None

    async def initialize(self) -> None:
        """Initialize the Neo4j async driver."""
        if not settings.neo4j_uri or not settings.neo4j_password:
            logger.warning("neo4j_no_config", msg="Neo4j credentials not set, graph DB unavailable")
            return
        self._driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        # Verify connectivity
        try:
            await self._driver.verify_connectivity()
            logger.info("neo4j_initialized", uri=settings.neo4j_uri)
        except Exception as e:
            logger.error("neo4j_connection_failed", error=str(e))
            await self._driver.close()
            self._driver = None

    @property
    def is_available(self) -> bool:
        """Check if Neo4j is connected."""
        return self._driver is not None

    async def close(self) -> None:
        """Close the Neo4j driver."""
        if self._driver:
            await self._driver.close()
            self._driver = None

    async def create_session_node(self, session: Session) -> None:
        """Create a Session node with relationships to its events and failure type."""
        if not self.is_available:
            raise RuntimeError("Neo4jService not initialized")

        async with self._driver.session() as db_session:
            # Create Session node
            await db_session.run(
                """
                MERGE (s:Session {session_id: $session_id})
                SET s.agent_id = $agent_id,
                    s.timestamp = $timestamp,
                    s.outcome = $outcome,
                    s.failure_type = $failure_type,
                    s.failure_summary = $failure_summary
                """,
                session_id=session.session_id,
                agent_id=session.agent_id,
                timestamp=session.timestamp.isoformat(),
                outcome=session.outcome,
                failure_type=session.failure_type or "",
                failure_summary=session.failure_summary or "",
            )

            # Create FailureType node and relationship
            if session.failure_type:
                await db_session.run(
                    """
                    MERGE (f:FailureType {name: $failure_type})
                    WITH f
                    MATCH (s:Session {session_id: $session_id})
                    MERGE (s)-[:FAILED_WITH]->(f)
                    """,
                    failure_type=session.failure_type,
                    session_id=session.session_id,
                )

            # Create event nodes for LLM calls
            for llm_call in session.llm_calls:
                await db_session.run(
                    """
                    MATCH (s:Session {session_id: $session_id})
                    CREATE (e:LLMCall {
                        call_id: $call_id,
                        model: $model,
                        hallucination_flag: $hallucination_flag
                    })
                    CREATE (s)-[:HAS_EVENT]->(e)
                    """,
                    session_id=session.session_id,
                    call_id=llm_call.call_id,
                    model=llm_call.model,
                    hallucination_flag=llm_call.hallucination_flag,
                )

            # Create event nodes for tool calls
            for tool_call in session.tool_calls:
                await db_session.run(
                    """
                    MATCH (s:Session {session_id: $session_id})
                    CREATE (e:ToolCall {
                        call_id: $call_id,
                        tool_name: $tool_name,
                        status: $status,
                        error: $error
                    })
                    CREATE (s)-[:HAS_EVENT]->(e)
                    """,
                    session_id=session.session_id,
                    call_id=tool_call.call_id,
                    tool_name=tool_call.tool_name,
                    status=tool_call.status,
                    error=tool_call.error or "",
                )

            # Create event nodes for retrieval events
            for retrieval in session.retrieval_events:
                await db_session.run(
                    """
                    MATCH (s:Session {session_id: $session_id})
                    CREATE (e:RetrievalEvent {
                        event_id: $event_id,
                        query: $query,
                        chunks_returned: $chunks_returned
                    })
                    CREATE (s)-[:HAS_EVENT]->(e)
                    """,
                    session_id=session.session_id,
                    event_id=retrieval.event_id,
                    query=retrieval.query,
                    chunks_returned=retrieval.chunks_returned,
                )

        logger.info("neo4j_session_created", session_id=session.session_id)

    async def link_failure_patterns(self) -> int:
        """Connect sessions that share failure types via RELATED_TO relationships.

        Returns the number of new relationships created.
        """
        if not self.is_available:
            raise RuntimeError("Neo4jService not initialized")

        async with self._driver.session() as db_session:
            result = await db_session.run(
                """
                MATCH (s1:Session)-[:FAILED_WITH]->(f:FailureType)<-[:FAILED_WITH]-(s2:Session)
                WHERE s1.session_id < s2.session_id
                  AND NOT (s1)-[:RELATED_TO]-(s2)
                CREATE (s1)-[:RELATED_TO {failure_type: f.name}]->(s2)
                RETURN count(*) as created
                """
            )
            record = await result.single()
            count = record["created"] if record else 0

        logger.info("neo4j_patterns_linked", new_relationships=count)
        return count


neo4j_service = Neo4jService()
