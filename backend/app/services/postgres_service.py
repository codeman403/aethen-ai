"""PostgreSQL / Supabase data store.

Owns:
  - Agent session JSON (sessions table) — full trace payloads, CRUD, stats
  - Chat conversation history (chat_sessions + chat_messages tables)

NOT responsible for:
  - Graph relationships → neo4j_service
  - Vector embeddings   → pinecone_service
  - Analysis reports    → store._reports (in-memory cache)

Tables (auto-created on first connect):
  sessions, chat_sessions, chat_messages
"""

import json

import asyncpg
import structlog

from app.config import settings
from app.models.trace import Session

logger = structlog.get_logger()

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id      TEXT PRIMARY KEY,
    agent_id        TEXT        NOT NULL DEFAULT '',
    failure_type    TEXT,
    outcome         TEXT        NOT NULL DEFAULT 'failed',
    failure_summary TEXT,
    session_ts      TIMESTAMPTZ,
    session_data    JSONB       NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_failure_type
    ON sessions (failure_type) WHERE failure_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_created_at
    ON sessions (created_at DESC);
"""

_CREATE_CHAT_TABLES = """
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT PRIMARY KEY,
    title       TEXT        NOT NULL DEFAULT 'New Session',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
    ON chat_sessions (updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT        NOT NULL,
    kind        TEXT        NOT NULL,
    content     TEXT        NOT NULL DEFAULT '',
    report      JSONB,
    latency_ms  FLOAT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
    ON chat_messages (session_id, created_at ASC);
"""

# Idempotent migration — adds latency_ms to tables created before this column existed
_MIGRATE_CHAT_TABLES = """
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS latency_ms FLOAT;
"""

_UPSERT = """
INSERT INTO sessions
    (session_id, agent_id, failure_type, outcome, failure_summary, session_ts, session_data)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (session_id) DO UPDATE SET
    failure_type    = EXCLUDED.failure_type,
    failure_summary = EXCLUDED.failure_summary,
    session_ts      = EXCLUDED.session_ts,
    session_data    = EXCLUDED.session_data
"""

_SELECT_BY_ID = "SELECT session_data FROM sessions WHERE session_id = $1"

_SELECT_BY_TYPE = """
SELECT session_data FROM sessions
WHERE failure_type = $1
ORDER BY created_at DESC LIMIT $2
"""

_SELECT_SUMMARIES = """
SELECT
    session_id,
    agent_id,
    failure_type,
    session_ts                                                           AS timestamp,
    failure_summary,
    COALESCE(jsonb_array_length(session_data->'llm_calls'), 0)          AS llm_calls,
    COALESCE(jsonb_array_length(session_data->'tool_calls'), 0)         AS tool_calls,
    COALESCE(jsonb_array_length(session_data->'retrieval_events'), 0)   AS retrieval_events
FROM sessions
ORDER BY created_at DESC LIMIT $1
"""

_STATS_TOTAL = "SELECT COUNT(*) FROM sessions"
_STATS_BREAKDOWN = """
SELECT failure_type, COUNT(*) AS cnt
FROM sessions WHERE failure_type IS NOT NULL
GROUP BY failure_type
"""
_STATS_RECENT = "SELECT COUNT(*) FROM sessions WHERE created_at > NOW() - INTERVAL '7 days'"
_STATS_DAILY = """
SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt
FROM sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY dow
"""


async def _init_conn(conn: asyncpg.Connection) -> None:
    """Register JSONB codec so Python dicts ↔ JSONB work transparently."""
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


class PostgresService:
    """Async PostgreSQL session store backed by Supabase (or any Postgres)."""

    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None

    @property
    def is_available(self) -> bool:
        return self._pool is not None

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Create the connection pool and ensure the schema exists."""
        if not settings.database_url:
            logger.warning("postgres_no_config", msg="DATABASE_URL not set — Postgres unavailable")
            return
        try:
            self._pool = await asyncpg.create_pool(
                settings.database_url,
                min_size=2,
                max_size=10,
                # statement_cache_size=0 is required when connecting through
                # Supabase's pgBouncer transaction-mode pooler (port 6543).
                # Safe to set for session-mode / direct connections too.
                statement_cache_size=0,
                init=_init_conn,
            )
            await self._create_schema()
            logger.info("postgres_initialized")
        except Exception as exc:
            logger.error("postgres_connection_failed", error=str(exc))
            self._pool = None

    async def _create_schema(self) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(_CREATE_TABLE)
            await conn.execute(_CREATE_CHAT_TABLES)
            await conn.execute(_MIGRATE_CHAT_TABLES)

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None

    # ── Write ──────────────────────────────────────────────────────────────

    async def save_session(self, session: Session) -> None:
        """Upsert a full session — insert or update on session_id conflict."""
        if not self.is_available:
            return
        ft = session.failure_type.value if session.failure_type else None
        async with self._pool.acquire() as conn:
            await conn.execute(
                _UPSERT,
                session.session_id,
                session.agent_id,
                ft,
                session.outcome,
                session.failure_summary,
                session.timestamp,
                session.model_dump(mode="json"),
            )
        logger.debug("postgres_session_saved", session_id=session.session_id)

    # ── Read ───────────────────────────────────────────────────────────────

    async def get_session(self, session_id: str) -> dict | None:
        """Return the full session dict, or None if not found."""
        if not self.is_available:
            return None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(_SELECT_BY_ID, session_id)
        return row["session_data"] if row else None

    async def get_by_failure_type(self, failure_type: str, limit: int = 50) -> list[dict]:
        """Return full session dicts for a given failure type, newest first."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(_SELECT_BY_TYPE, failure_type, limit)
        return [r["session_data"] for r in rows]

    async def get_all_summaries(self, limit: int = 200) -> list[dict]:
        """Return lightweight session summaries with event counts."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(_SELECT_SUMMARIES, limit)
        return [
            {
                "session_id": r["session_id"],
                "agent_id": r["agent_id"],
                "failure_type": r["failure_type"],
                "timestamp": r["timestamp"].isoformat() if r["timestamp"] else None,
                "failure_summary": r["failure_summary"],
                "llm_calls": r["llm_calls"],
                "tool_calls": r["tool_calls"],
                "retrieval_events": r["retrieval_events"],
            }
            for r in rows
        ]

    # ── Stats ──────────────────────────────────────────────────────────────

    async def compute_stats(self) -> dict:
        """Aggregate dashboard stats from Postgres (Neo4j fallback)."""
        if not self.is_available:
            return {}
        async with self._pool.acquire() as conn:
            total: int = (await conn.fetchval(_STATS_TOTAL)) or 0
            breakdown_rows = await conn.fetch(_STATS_BREAKDOWN)
            recent: int = (await conn.fetchval(_STATS_RECENT)) or 0
            daily_rows = await conn.fetch(_STATS_DAILY)

        b = {r["failure_type"]: r["cnt"] for r in breakdown_rows}

        # PostgreSQL DOW: 0=Sunday … 6=Saturday → convert to Python Mon=0 … Sun=6
        daily = [0] * 7
        for r in daily_rows:
            dow = (int(r["dow"]) - 1) % 7
            daily[dow] = int(r["cnt"])

        return {
            "total_sessions": total,
            "failure_breakdown": {
                "memory": b.get("memory", 0),
                "tool_misfire": b.get("tool_misfire", 0),
                "hallucination": b.get("hallucination", 0),
                "blind_spot": b.get("blind_spot", 0),
            },
            "recent_sessions": recent,
            "daily_counts": daily,
        }

    # ── Chat session CRUD ──────────────────────────────────────────────────

    async def create_chat_session(self, session_id: str, title: str = "New Session") -> dict:
        """Create a new chat session row and return it."""
        if not self.is_available:
            return {"id": session_id, "title": title, "created_at": None, "updated_at": None, "message_count": 0}
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO chat_sessions (id, title) VALUES ($1, $2)
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id, title, created_at, updated_at
                """,
                session_id, title,
            )
        return {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "message_count": 0,
        }

    async def list_chat_sessions(self) -> list[dict]:
        """Return all chat sessions ordered by most recently updated, with message counts."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT s.id, s.title, s.created_at, s.updated_at,
                       COUNT(m.id) AS message_count
                FROM chat_sessions s
                LEFT JOIN chat_messages m ON m.session_id = s.id
                GROUP BY s.id, s.title, s.created_at, s.updated_at
                ORDER BY s.updated_at DESC
                LIMIT 50
                """
            )
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "message_count": int(r["message_count"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            for r in rows
        ]

    async def get_chat_messages(self, session_id: str) -> list[dict]:
        """Return all messages for a session in chronological order."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, session_id, role, kind, content, report, latency_ms, created_at
                FROM chat_messages WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                session_id,
            )
        return [
            {
                "id": r["id"],
                "session_id": r["session_id"],
                "role": r["role"],
                "kind": r["kind"],
                "content": r["content"],
                "report": r["report"],
                "latency_ms": r["latency_ms"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]

    async def append_chat_message(
        self,
        message_id: str,
        session_id: str,
        role: str,
        kind: str,
        content: str,
        report: dict | None = None,
        latency_ms: float | None = None,
    ) -> None:
        """Append a message (with optional latency) and bump session updated_at."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO chat_messages (id, session_id, role, kind, content, report, latency_ms)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO NOTHING
                """,
                message_id, session_id, role, kind, content, report, latency_ms,
            )
            await conn.execute(
                "UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1",
                session_id,
            )

    async def update_session_title(self, session_id: str, title: str) -> None:
        """Rename a session (auto-named from first user message)."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                "UPDATE chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2",
                title[:80], session_id,
            )


postgres_service = PostgresService()
