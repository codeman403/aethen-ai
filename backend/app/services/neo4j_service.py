"""Neo4j graph database service.

Graph schema (7 node types, 10+ relationship types):

  Nodes:
    Session      — one per agent execution trace
    Query        — the user query / retrieval query within a session
    Chunk        — a retrieved knowledge base document (by doc ID)
    ToolCall     — a single tool invocation
    Response     — an LLM-generated answer
    FailureEvent — a detected failure (hallucination, tool error, blind spot)
    BlindSpot    — a recurring knowledge gap topic
    PromptVersion— LLM model / prompt version used

  Relationships:
    (Session)   -[:CONTAINS_QUERY]->  (Query)
    (Session)   -[:FAILED_WITH]->     (FailureType node)
    (Session)   -[:RELATED_TO]->      (Session)        — shared failure type
    (Session)   -[:PRODUCED]->        (Response)
    (Session)   -[:USES]->            (PromptVersion)
    (Query)     -[:RETRIEVED]->       (Chunk)
    (Query)     -[:TRIGGERED]->       (ToolCall)
    (Query)     -[:UNRESOLVED_DUE_TO]->(BlindSpot)
    (ToolCall)  -[:FAILED_WITH]->     (FailureEvent)
    (Response)  -[:CONTAINS]->        (FailureEvent)   — hallucination
    (Response)  -[:INFLUENCED_BY]->   (Chunk)
"""

import structlog
from neo4j import AsyncDriver, AsyncGraphDatabase

from app.config import settings
from app.models.trace import FailureType, Session, ToolCallStatus

logger = structlog.get_logger()


class Neo4jService:
    """Manages session and failure pattern storage in Neo4j."""

    def __init__(self) -> None:
        self._driver: AsyncDriver | None = None

    async def initialize(self) -> None:
        """Initialize the Neo4j async driver and create schema constraints."""
        if not settings.neo4j_uri or not settings.neo4j_password:
            logger.warning("neo4j_no_config", msg="Neo4j credentials not set, graph DB unavailable")
            return
        self._driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        try:
            await self._driver.verify_connectivity()
            logger.info("neo4j_initialized", uri=settings.neo4j_uri)
            await self._ensure_constraints()
        except Exception as e:
            logger.error("neo4j_connection_failed", error=str(e))
            await self._driver.close()
            self._driver = None

    @property
    def is_available(self) -> bool:
        return self._driver is not None

    async def close(self) -> None:
        if self._driver:
            await self._driver.close()
            self._driver = None

    # ─────────────────────────────────────────────────────────────────────
    # Schema constraints
    # ─────────────────────────────────────────────────────────────────────

    async def _ensure_constraints(self) -> None:
        """Create uniqueness constraints for all node types."""
        constraints = [
            "CREATE CONSTRAINT session_id IF NOT EXISTS FOR (n:Session) REQUIRE n.session_id IS UNIQUE",
            "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (n:Chunk) REQUIRE n.doc_id IS UNIQUE",
            "CREATE CONSTRAINT blind_spot_topic IF NOT EXISTS FOR (n:BlindSpot) REQUIRE n.topic IS UNIQUE",
            "CREATE CONSTRAINT prompt_version_id IF NOT EXISTS FOR (n:PromptVersion) REQUIRE n.model IS UNIQUE",
            "CREATE CONSTRAINT failure_type_name IF NOT EXISTS FOR (n:FailureType) REQUIRE n.name IS UNIQUE",
        ]
        async with self._driver.session() as db:
            for cypher in constraints:
                try:
                    await db.run(cypher)
                except Exception as exc:
                    # Constraint may already exist — not fatal
                    logger.debug("neo4j_constraint_skip", error=str(exc))

    # ─────────────────────────────────────────────────────────────────────
    # Session ingestion — full 7-node / 10-relationship schema
    # ─────────────────────────────────────────────────────────────────────

    async def create_session_node(self, session: Session) -> None:
        """Ingest a session into the graph with the full schema.

        Creates all node types and relationships in a single driver session.
        Uses MERGE on shared nodes (Chunk, BlindSpot, PromptVersion) to avoid
        duplicates across sessions.
        """
        if not self.is_available:
            raise RuntimeError("Neo4jService not initialized")

        async with self._driver.session() as db:
            # ── 1. Session node ───────────────────────────────────────────
            await db.run(
                """
                MERGE (s:Session {session_id: $session_id})
                SET s.agent_id      = $agent_id,
                    s.timestamp     = $timestamp,
                    s.outcome       = $outcome,
                    s.failure_type  = $failure_type,
                    s.failure_summary = $failure_summary
                """,
                session_id=session.session_id,
                agent_id=session.agent_id,
                timestamp=session.timestamp.isoformat() if session.timestamp else "",
                outcome=session.outcome,
                failure_type=session.failure_type or "",
                failure_summary=session.failure_summary or "",
            )

            # ── 2. FailureType node + Session -[FAILED_WITH]-> FailureType ─
            if session.failure_type:
                await db.run(
                    """
                    MERGE (f:FailureType {name: $failure_type})
                    WITH f
                    MATCH (s:Session {session_id: $session_id})
                    MERGE (s)-[:FAILED_WITH]->(f)
                    """,
                    failure_type=session.failure_type,
                    session_id=session.session_id,
                )

            # ── 3. PromptVersion nodes + Session -[USES]-> PromptVersion ──
            models_seen: set[str] = set()
            for llm_call in session.llm_calls:
                if llm_call.model and llm_call.model not in models_seen:
                    models_seen.add(llm_call.model)
                    await db.run(
                        """
                        MERGE (pv:PromptVersion {model: $model})
                        WITH pv
                        MATCH (s:Session {session_id: $session_id})
                        MERGE (s)-[:USES]->(pv)
                        """,
                        model=llm_call.model,
                        session_id=session.session_id,
                    )

            # ── 4. Query + Chunk nodes per retrieval event ─────────────────
            for ret in session.retrieval_events:
                query_id = f"q:{session.session_id}:{ret.event_id}"
                await db.run(
                    """
                    CREATE (q:Query {
                        query_id:        $query_id,
                        text:            $text,
                        namespace:       $namespace,
                        chunks_returned: $chunks_returned
                    })
                    WITH q
                    MATCH (s:Session {session_id: $session_id})
                    MERGE (s)-[:CONTAINS_QUERY]->(q)
                    """,
                    query_id=query_id,
                    text=ret.query,
                    namespace=ret.namespace,
                    chunks_returned=ret.chunks_returned,
                    session_id=session.session_id,
                )

                # Chunk nodes — MERGE so the same doc_id is shared across sessions
                for doc_id in ret.actual_doc_ids:
                    if doc_id:
                        await db.run(
                            """
                            MERGE (c:Chunk {doc_id: $doc_id})
                            ON CREATE SET c.first_seen = $session_id
                            WITH c
                            MATCH (q:Query {query_id: $query_id})
                            MERGE (q)-[:RETRIEVED]->(c)
                            """,
                            doc_id=doc_id,
                            session_id=session.session_id,
                            query_id=query_id,
                        )

                # BlindSpot node — 0 results = knowledge gap
                if ret.chunks_returned == 0 and ret.query:
                    topic = ret.query[:100]
                    await db.run(
                        """
                        MERGE (b:BlindSpot {topic: $topic})
                        ON CREATE SET b.first_session = $session_id, b.query_count = 1
                        ON MATCH  SET b.query_count   = b.query_count + 1
                        WITH b
                        MATCH (q:Query {query_id: $query_id})
                        MERGE (q)-[:UNRESOLVED_DUE_TO]->(b)
                        """,
                        topic=topic,
                        session_id=session.session_id,
                        query_id=query_id,
                    )

            # ── 5. ToolCall nodes ──────────────────────────────────────────
            # Attach to the first Query in this session if one exists
            first_query_id = (
                f"q:{session.session_id}:{session.retrieval_events[0].event_id}"
                if session.retrieval_events else None
            )

            for tc in session.tool_calls:
                await db.run(
                    """
                    MATCH (s:Session {session_id: $session_id})
                    CREATE (t:ToolCall {
                        call_id:    $call_id,
                        tool_name:  $tool_name,
                        status:     $status,
                        error:      $error,
                        latency_ms: $latency_ms
                    })
                    CREATE (s)-[:HAS_EVENT]->(t)
                    """,
                    session_id=session.session_id,
                    call_id=tc.call_id,
                    tool_name=tc.tool_name,
                    status=str(tc.status),
                    error=tc.error or "",
                    latency_ms=tc.latency_ms,
                )

                # Link Query -[TRIGGERED]-> ToolCall
                if first_query_id:
                    await db.run(
                        """
                        MATCH (q:Query {query_id: $query_id})
                        MATCH (t:ToolCall {call_id: $call_id})
                        MERGE (q)-[:TRIGGERED]->(t)
                        """,
                        query_id=first_query_id,
                        call_id=tc.call_id,
                    )

                # FailureEvent for failed tool calls
                if tc.status in (ToolCallStatus.FAILED, ToolCallStatus.TIMEOUT):
                    fe_id = f"fe:tool:{tc.call_id}"
                    await db.run(
                        """
                        MATCH (t:ToolCall {call_id: $call_id})
                        CREATE (fe:FailureEvent {
                            event_id:   $fe_id,
                            type:       $type,
                            severity:   $severity,
                            description: $description
                        })
                        CREATE (t)-[:FAILED_WITH]->(fe)
                        """,
                        call_id=tc.call_id,
                        fe_id=fe_id,
                        type="tool_misfire",
                        severity="high",
                        description=tc.error or f"Tool {tc.tool_name} returned {tc.status}",
                    )

            # ── 6. Response nodes per LLM call ─────────────────────────────
            for llm in session.llm_calls:
                resp_id = f"resp:{session.session_id}:{llm.call_id}"
                await db.run(
                    """
                    MATCH (s:Session {session_id: $session_id})
                    CREATE (r:Response {
                        response_id:        $resp_id,
                        model:              $model,
                        text:               $text,
                        tokens_out:         $tokens_out,
                        hallucination_flag: $hallucination_flag,
                        latency_ms:         $latency_ms
                    })
                    CREATE (s)-[:PRODUCED]->(r)
                    """,
                    session_id=session.session_id,
                    resp_id=resp_id,
                    model=llm.model,
                    text=llm.response[:500],
                    tokens_out=llm.tokens_out,
                    hallucination_flag=llm.hallucination_flag,
                    latency_ms=llm.latency_ms,
                )

                # Link chunks that influenced this response
                for doc_id in llm.source_documents:
                    if doc_id:
                        await db.run(
                            """
                            MATCH (r:Response {response_id: $resp_id})
                            MATCH (c:Chunk {doc_id: $doc_id})
                            MERGE (r)-[:INFLUENCED_BY]->(c)
                            """,
                            resp_id=resp_id,
                            doc_id=doc_id,
                        )

                # FailureEvent for hallucinations
                if llm.hallucination_flag:
                    fe_id = f"fe:hall:{llm.call_id}"
                    await db.run(
                        """
                        MATCH (r:Response {response_id: $resp_id})
                        CREATE (fe:FailureEvent {
                            event_id:    $fe_id,
                            type:        $type,
                            severity:    $severity,
                            description: $description
                        })
                        CREATE (r)-[:CONTAINS]->(fe)
                        """,
                        resp_id=resp_id,
                        fe_id=fe_id,
                        type="hallucination",
                        severity="high",
                        description="LLM response flagged as hallucination",
                    )

        logger.info("neo4j_session_created", session_id=session.session_id)

    # ─────────────────────────────────────────────────────────────────────
    # Cross-session pattern linking
    # ─────────────────────────────────────────────────────────────────────

    async def link_failure_patterns(self) -> int:
        """Connect sessions sharing failure types via RELATED_TO relationships.

        Returns the number of new relationships created.
        """
        if not self.is_available:
            raise RuntimeError("Neo4jService not initialized")

        async with self._driver.session() as db:
            result = await db.run(
                """
                MATCH (s1:Session)-[:FAILED_WITH]->(f:FailureType)<-[:FAILED_WITH]-(s2:Session)
                WHERE s1.session_id < s2.session_id
                  AND NOT (s1)-[:RELATED_TO]-(s2)
                CREATE (s1)-[:RELATED_TO {failure_type: f.name}]->(s2)
                RETURN count(*) AS created
                """
            )
            record = await result.single()
            count = record["created"] if record else 0

        logger.info("neo4j_patterns_linked", new_relationships=count)
        return count

    # ─────────────────────────────────────────────────────────────────────
    # Graph stats (for quality report)
    # ─────────────────────────────────────────────────────────────────────

    async def get_graph_stats(self) -> dict:
        """Return node and relationship counts per type."""
        if not self.is_available:
            return {}

        async with self._driver.session() as db:
            node_result = await db.run(
                "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC"
            )
            nodes = {r["label"]: r["cnt"] async for r in node_result}

            rel_result = await db.run(
                "MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC"
            )
            rels = {r["rel"]: r["cnt"] async for r in rel_result}

        return {"nodes": nodes, "relationships": rels}


neo4j_service = Neo4jService()
