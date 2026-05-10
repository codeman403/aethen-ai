"""PostgreSQL / Supabase data store.

Owns:
  - Agent session JSON (sessions table) — full trace payloads, CRUD, stats
  - Chat conversation history (chat_sessions + chat_messages tables)

NOT responsible for:
  - Graph relationships → neo4j_service
  - Vector embeddings   → pinecone_service

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
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS analysis_report JSONB;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS analysis_ts    TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS trace_source   TEXT DEFAULT 'langfuse';
CREATE INDEX IF NOT EXISTS idx_sessions_failure_type
    ON sessions (failure_type) WHERE failure_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_created_at
    ON sessions (created_at DESC);
-- org_id queries are the most common access pattern — filter + sort
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS org_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_org_id
    ON sessions (org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_org_created
    ON sessions (org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_org_failure
    ON sessions (org_id, failure_type) WHERE org_id IS NOT NULL AND failure_type IS NOT NULL;
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
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS org_id TEXT;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_org_id
    ON chat_sessions (org_id) WHERE org_id IS NOT NULL;

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

# Normalize legacy "demo-*" agent_id values (e.g. "demo-agent-chat") to "Demo Agent"
# in both the indexed column and the JSONB blob. Idempotent — WHERE clause matches
# only rows that haven't been updated yet.
_MIGRATE_DEMO_AGENT_IDS = """
UPDATE sessions
SET
    agent_id     = 'Demo Agent',
    session_data = jsonb_set(session_data, '{agent_id}', '"Demo Agent"')
WHERE agent_id LIKE 'demo-%';
"""

# Clear misleading failure_summary values on sessions that have no actual failure type.
# These were set from the trace name (e.g. "Demo Agent — Free Form Chat") which is not
# a meaningful failure description.
_MIGRATE_CLEAR_NON_FAILURE_SUMMARIES = """
UPDATE sessions
SET
    failure_summary = NULL,
    session_data    = session_data - 'failure_summary'
WHERE failure_type IS NULL
  AND failure_summary IS NOT NULL;
"""

_UPSERT = """
INSERT INTO sessions
    (session_id, agent_id, failure_type, outcome, failure_summary, session_ts, session_data, trace_source, org_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (session_id) DO UPDATE SET
    failure_type    = EXCLUDED.failure_type,
    failure_summary = EXCLUDED.failure_summary,
    session_ts      = EXCLUDED.session_ts,
    session_data    = EXCLUDED.session_data,
    trace_source    = EXCLUDED.trace_source,
    org_id          = COALESCE(EXCLUDED.org_id, sessions.org_id)
RETURNING (xmax = 0) AS inserted
"""

_CREATE_APP_SETTINGS = """
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_CREATE_DEMO_TABLES = """
CREATE TABLE IF NOT EXISTS demo_chat_sessions (
    id                  TEXT PRIMARY KEY,
    title               TEXT        NOT NULL DEFAULT 'New Demo Chat',
    trace_destination   TEXT        NOT NULL DEFAULT 'langfuse',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE demo_chat_sessions ADD COLUMN IF NOT EXISTS trace_destination TEXT NOT NULL DEFAULT 'langfuse';
CREATE INDEX IF NOT EXISTS idx_demo_chat_sessions_updated_at
    ON demo_chat_sessions (updated_at DESC);

CREATE TABLE IF NOT EXISTS demo_chat_messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT        NOT NULL REFERENCES demo_chat_sessions(id) ON DELETE CASCADE,
    role        TEXT        NOT NULL,
    content     TEXT        NOT NULL DEFAULT '',
    langfuse_traced BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demo_chat_messages_session_id
    ON demo_chat_messages (session_id, created_at ASC);
"""

_CREATE_PGVECTOR = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS session_vectors (
    id           TEXT PRIMARY KEY,
    session_id   TEXT         NOT NULL,
    namespace    TEXT         NOT NULL,
    org_id       TEXT,
    event_type   TEXT,
    metadata     JSONB        NOT NULL DEFAULT '{}',
    embedding    vector(1536) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sv_session_id  ON session_vectors (session_id);
CREATE INDEX IF NOT EXISTS idx_sv_org_ns      ON session_vectors (org_id, namespace)
    WHERE org_id IS NOT NULL;
"""

_CREATE_PGVECTOR_HNSW = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'session_vectors' AND indexname = 'idx_sv_hnsw'
    ) THEN
        CREATE INDEX idx_sv_hnsw ON session_vectors
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
    END IF;
END;
$$;
"""

_MIGRATE_PROFILES_WELCOMED = """
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcomed_at TIMESTAMPTZ;
"""

_MIGRATE_ORGANIZATIONS_TRIAL = """
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_converted  BOOLEAN NOT NULL DEFAULT FALSE;
"""

_MIGRATE_ORG_USAGE_WARNINGS = """
ALTER TABLE org_usage ADD COLUMN IF NOT EXISTS sessions_warning_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE org_usage ADD COLUMN IF NOT EXISTS analysis_warning_sent BOOLEAN NOT NULL DEFAULT FALSE;
"""

_CREATE_QUOTA_TABLES = """
CREATE TABLE IF NOT EXISTS org_quotas (
    org_id                  TEXT PRIMARY KEY,
    sessions_per_month      INT  NOT NULL DEFAULT 1000,
    analysis_runs_per_month INT  NOT NULL DEFAULT 1000,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_usage (
    org_id            TEXT NOT NULL,
    period            TEXT NOT NULL,
    sessions_ingested INT  NOT NULL DEFAULT 0,
    analysis_runs     INT  NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (org_id, period)
);
"""

_DEFAULT_SESSIONS_PER_MONTH      = 1000
_DEFAULT_ANALYSIS_RUNS_PER_MONTH = 1000

_STATS_TOTAL = "SELECT COUNT(*) FROM sessions"
_STATS_BREAKDOWN = """
SELECT failure_type, COUNT(*) AS cnt
FROM sessions WHERE failure_type IS NOT NULL
GROUP BY failure_type
"""
_STATS_RECENT = "SELECT COUNT(*) FROM sessions WHERE created_at > NOW() - INTERVAL '7 days'"
_STATS_RECENT_FAILED = """
SELECT COUNT(*) FROM sessions
WHERE created_at > NOW() - INTERVAL '7 days'
  AND failure_type IS NOT NULL
"""
_STATS_TODAY  = "SELECT COUNT(*) FROM sessions WHERE COALESCE(session_ts, created_at) > NOW() - INTERVAL '1 day'"
_STATS_DAILY = """
SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt
FROM sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY dow
"""
_STATS_DAILY_BY_TYPE = """
SELECT failure_type, COUNT(*) AS cnt
FROM sessions
WHERE COALESCE(session_ts, created_at) > NOW() - INTERVAL '1 day'
  AND failure_type IS NOT NULL
GROUP BY failure_type
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
                max_size=20,  # increased from 10 — supports ~20 concurrent requests at peak
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
            await conn.execute(_CREATE_APP_SETTINGS)
            await conn.execute(_CREATE_TABLE)
            await conn.execute(_CREATE_CHAT_TABLES)
            await conn.execute(_MIGRATE_CHAT_TABLES)
            await conn.execute(_CREATE_DEMO_TABLES)
            await conn.execute(_MIGRATE_DEMO_AGENT_IDS)
            await conn.execute(_MIGRATE_CLEAR_NON_FAILURE_SUMMARIES)
            await conn.execute(_CREATE_QUOTA_TABLES)
            # Run these with try/except — they touch Supabase-managed tables
            # that may have RLS restrictions in hosted environments.
            try:
                await conn.execute(_CREATE_PGVECTOR)
                await conn.execute(_CREATE_PGVECTOR_HNSW)
            except Exception as exc:
                logger.warning("pgvector_schema_failed", error=str(exc))
            try:
                await conn.execute(_MIGRATE_PROFILES_WELCOMED)
            except Exception:
                pass
            try:
                await conn.execute(_MIGRATE_ORG_USAGE_WARNINGS)
            except Exception:
                pass
            try:
                await conn.execute(_MIGRATE_ORGANIZATIONS_TRIAL)
            except Exception:
                pass

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()
            self._pool = None

    # ── Write ──────────────────────────────────────────────────────────────

    async def save_session(self, session: Session, org_id: str | None = None) -> bool:
        """Upsert a full session — insert or update on session_id conflict.

        Returns True if the session was newly inserted, False if an existing
        row was updated. Callers can use this to decide whether to count the
        session as new and queue background analysis.
        """
        if not self.is_available:
            return False
        ft = session.failure_type.value if session.failure_type else None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                _UPSERT,
                session.session_id,
                session.agent_id,
                ft,
                session.outcome,
                session.failure_summary,
                session.timestamp,
                session.model_dump(mode="json"),
                session.trace_source,
                org_id,
            )
        is_new = bool(row["inserted"]) if row else False
        logger.debug("postgres_session_saved", session_id=session.session_id, is_new=is_new)
        return is_new

    # ── Read ───────────────────────────────────────────────────────────────

    async def get_session(self, session_id: str, org_id: str | None = None) -> dict | None:
        """Return the full session dict, or None if not found."""
        if not self.is_available:
            return None
        async with self._pool.acquire() as conn:
            if org_id:
                row = await conn.fetchrow(
                    "SELECT session_data FROM sessions WHERE session_id = $1 AND org_id = $2",
                    session_id, org_id,
                )
            else:
                row = await conn.fetchrow(
                    "SELECT session_data FROM sessions WHERE session_id = $1",
                    session_id,
                )
        return row["session_data"] if row else None

    async def get_all_sessions(self, limit: int = 500, org_id: str | None = None) -> list[dict]:
        """Return full session_data dicts for all sessions (for QC checks)."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            if org_id:
                rows = await conn.fetch(
                    "SELECT session_data FROM sessions WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2",
                    org_id, limit,
                )
            else:
                rows = await conn.fetch(
                    "SELECT session_data FROM sessions ORDER BY created_at DESC LIMIT $1",
                    limit,
                )
        return [r["session_data"] for r in rows]

    async def get_by_failure_type(self, failure_type: str, limit: int = 50, org_id: str | None = None) -> list[dict]:
        """Return full session dicts for a given failure type, newest first."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            if org_id:
                rows = await conn.fetch(
                    "SELECT session_data FROM sessions WHERE failure_type = $1 AND org_id = $2 ORDER BY COALESCE(session_ts, created_at) DESC LIMIT $3",
                    failure_type, org_id, limit,
                )
            else:
                rows = await conn.fetch(
                    "SELECT session_data FROM sessions WHERE failure_type = $1 ORDER BY COALESCE(session_ts, created_at) DESC LIMIT $2",
                    failure_type, limit,
                )
        return [r["session_data"] for r in rows]

    async def get_analysis_report(self, session_id: str) -> dict | None:
        """Return the cached analysis report for a session, or None if not yet run."""
        if not self.is_available:
            return None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT analysis_report FROM sessions WHERE session_id = $1",
                session_id,
            )
        if not row or not row["analysis_report"]:
            return None
        data = row["analysis_report"]
        return data if isinstance(data, dict) else json.loads(data)

    async def save_analysis_report(self, session_id: str, report: dict) -> None:
        """Persist an analysis report against the session row."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE sessions
                SET analysis_report = $1::jsonb, analysis_ts = NOW()
                WHERE session_id = $2
                """,
                json.dumps(report),
                session_id,
            )
        logger.debug("analysis_report_saved", session_id=session_id)

    async def count_sessions(self, org_id: str | None = None) -> int:
        """Return total number of sessions."""
        if not self.is_available:
            return 0
        async with self._pool.acquire() as conn:
            if org_id:
                return (await conn.fetchval("SELECT COUNT(*) FROM sessions WHERE org_id = $1", org_id)) or 0
            return (await conn.fetchval("SELECT COUNT(*) FROM sessions")) or 0

    async def get_all_summaries(self, limit: int = 200, offset: int = 0, org_id: str | None = None) -> list[dict]:
        """Return lightweight session summaries with event counts."""
        if not self.is_available:
            return []
        _SUMMARIES_SQL = """
        SELECT
            session_id,
            agent_id,
            failure_type,
            session_ts                                                           AS timestamp,
            failure_summary,
            COALESCE(trace_source, 'langfuse')                                   AS trace_source,
            COALESCE(jsonb_array_length(session_data->'llm_calls'), 0)          AS llm_calls,
            COALESCE(jsonb_array_length(session_data->'tool_calls'), 0)         AS tool_calls,
            COALESCE(jsonb_array_length(session_data->'retrieval_events'), 0)   AS retrieval_events,
            (analysis_report IS NOT NULL)                                        AS has_report
        FROM sessions
        {where}
        ORDER BY COALESCE(session_ts, created_at) DESC LIMIT ${lp} OFFSET ${op}
        """
        async with self._pool.acquire() as conn:
            if org_id:
                sql = _SUMMARIES_SQL.format(where="WHERE org_id = $1", lp=2, op=3)
                rows = await conn.fetch(sql, org_id, limit, offset)
            else:
                sql = _SUMMARIES_SQL.format(where="", lp=1, op=2)
                rows = await conn.fetch(sql, limit, offset)
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
                "trace_source": r["trace_source"],
                "has_report": bool(r["has_report"]),
            }
            for r in rows
        ]

    # ── Stats ──────────────────────────────────────────────────────────────

    async def compute_stats(self, org_id: str | None = None) -> dict:
        """Aggregate dashboard stats from Postgres (Neo4j fallback)."""
        if not self.is_available:
            return {}
        w = "WHERE org_id = $1" if org_id else ""
        p = [org_id] if org_id else []
        async with self._pool.acquire() as conn:
            total: int = (await conn.fetchval(f"SELECT COUNT(*) FROM sessions {w}", *p)) or 0
            breakdown_rows = await conn.fetch(f"SELECT failure_type, COUNT(*) AS cnt FROM sessions {w} {'AND' if w else 'WHERE'} failure_type IS NOT NULL GROUP BY failure_type".replace("WHERE AND", "WHERE"), *p)
            recent: int = (await conn.fetchval(f"SELECT COUNT(*) FROM sessions {w} {'AND' if w else 'WHERE'} created_at > NOW() - INTERVAL '7 days'".replace("WHERE AND", "WHERE"), *p)) or 0
            recent_failed: int = (await conn.fetchval(f"SELECT COUNT(*) FROM sessions {w} {'AND' if w else 'WHERE'} created_at > NOW() - INTERVAL '7 days' AND failure_type IS NOT NULL".replace("WHERE AND", "WHERE"), *p)) or 0
            today: int = (await conn.fetchval(f"SELECT COUNT(*) FROM sessions {w} {'AND' if w else 'WHERE'} COALESCE(session_ts, created_at) > NOW() - INTERVAL '1 day'".replace("WHERE AND", "WHERE"), *p)) or 0
            daily_rows = await conn.fetch(f"SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*) AS cnt FROM sessions {w} {'AND' if w else 'WHERE'} created_at > NOW() - INTERVAL '7 days' GROUP BY dow".replace("WHERE AND", "WHERE"), *p)
            daily_type_rows = await conn.fetch(f"SELECT failure_type, COUNT(*) AS cnt FROM sessions {w} {'AND' if w else 'WHERE'} COALESCE(session_ts, created_at) > NOW() - INTERVAL '1 day' AND failure_type IS NOT NULL GROUP BY failure_type".replace("WHERE AND", "WHERE"), *p)

        b = {r["failure_type"]: r["cnt"] for r in breakdown_rows}
        d = {r["failure_type"]: r["cnt"] for r in daily_type_rows}

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
            "recent_failed": recent_failed,
            "today_sessions": today,
            "daily_counts": daily,
            "daily_by_type": {
                "memory": d.get("memory", 0),
                "tool_misfire": d.get("tool_misfire", 0),
                "hallucination": d.get("hallucination", 0),
                "blind_spot": d.get("blind_spot", 0),
            },
        }

    async def get_recommendations(self, limit: int = 50, org_id: str | None = None) -> list[dict]:
        """Return aggregated recommendations from cached analysis reports."""
        if not self.is_available:
            return []
        if org_id:
            query = """
                SELECT s.session_id, s.agent_id, s.failure_type, s.session_ts, s.analysis_report
                FROM sessions s
                WHERE s.org_id = $1 AND s.analysis_report IS NOT NULL AND s.analysis_report != 'null'
                ORDER BY COALESCE(s.session_ts, s.created_at) DESC LIMIT $2
            """
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, org_id, limit)
        else:
            query = """
                SELECT s.session_id, s.agent_id, s.failure_type, s.session_ts, s.analysis_report
                FROM sessions s
                WHERE s.analysis_report IS NOT NULL AND s.analysis_report != 'null'
                ORDER BY COALESCE(s.session_ts, s.created_at) DESC LIMIT $1
            """
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, limit)

        results = []
        for r in rows:
            raw = r["analysis_report"]
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except Exception:
                    continue
            if not isinstance(raw, dict):
                continue
            report = raw
            findings = report.get("findings") or []
            for f in findings:
                rec = f.get("recommendation") or ""
                if not rec or not rec.strip():
                    continue
                results.append({
                    "session_id":   r["session_id"],
                    "agent_id":     r["agent_id"],
                    "failure_type": r["failure_type"],
                    "session_ts":   r["session_ts"].isoformat() if r["session_ts"] else None,
                    "title":        f.get("title", ""),
                    "severity":     f.get("severity", "medium"),
                    "recommendation": rec.strip(),
                })
        return results

    async def get_agent_profiles(self, org_id: str | None = None) -> list[dict]:
        """Return per-agent failure breakdown and session counts."""
        if not self.is_available:
            return []
        org_filter = "AND org_id = $1" if org_id else ""
        params = [org_id] if org_id else []
        query = f"""
            SELECT
                agent_id,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE failure_type IS NOT NULL)    AS total_failures,
                COUNT(*) FILTER (WHERE failure_type = 'memory')     AS memory,
                COUNT(*) FILTER (WHERE failure_type = 'tool_misfire')   AS tool_misfire,
                COUNT(*) FILTER (WHERE failure_type = 'hallucination')  AS hallucination,
                COUNT(*) FILTER (WHERE failure_type = 'blind_spot') AS blind_spot,
                MAX(COALESCE(session_ts, created_at)) AS last_seen,
                ROUND(100.0 * COUNT(*) FILTER (WHERE failure_type IS NULL) / COUNT(*), 1) AS success_rate
            FROM sessions
            WHERE agent_id <> '' {org_filter}
            GROUP BY agent_id
            ORDER BY total_failures DESC, total DESC
        """
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
        return [
            {
                "agent_id": r["agent_id"],
                "total": r["total"],
                "total_failures": r["total_failures"],
                "memory": r["memory"],
                "tool_misfire": r["tool_misfire"],
                "hallucination": r["hallucination"],
                "blind_spot": r["blind_spot"],
                "success_rate": float(r["success_rate"] or 0),
                "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
            }
            for r in rows
        ]

    async def compute_trends(self, days: int = 30, org_id: str | None = None) -> list[dict]:
        """Return per-failure-type daily counts for the last N days, one dict per day."""
        if not self.is_available:
            return []
        if org_id:
            query = """
                SELECT
                    DATE_TRUNC('day', COALESCE(session_ts, created_at))::date AS day,
                    COALESCE(failure_type, 'success') AS failure_type,
                    COUNT(*) AS cnt
                FROM sessions
                WHERE org_id = $1
                  AND COALESCE(session_ts, created_at) > NOW() - ($2 || ' days')::interval
                GROUP BY day, failure_type
                ORDER BY day ASC
            """
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, org_id, str(days))
        else:
            query = """
                SELECT
                    DATE_TRUNC('day', COALESCE(session_ts, created_at))::date AS day,
                    COALESCE(failure_type, 'success') AS failure_type,
                    COUNT(*) AS cnt
                FROM sessions
                WHERE COALESCE(session_ts, created_at) > NOW() - ($1 || ' days')::interval
                GROUP BY day, failure_type
                ORDER BY day ASC
            """
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, str(days))

        # Pivot into {date -> {type -> count}} then flatten to list
        from collections import defaultdict
        by_date: dict = defaultdict(lambda: {"memory": 0, "tool_misfire": 0, "hallucination": 0, "blind_spot": 0, "total": 0})
        for r in rows:
            day_str = r["day"].isoformat()
            ft = r["failure_type"]
            cnt = int(r["cnt"])
            if ft in ("memory", "tool_misfire", "hallucination", "blind_spot"):
                by_date[day_str][ft] += cnt
            by_date[day_str]["total"] += cnt

        return [{"date": d, **v} for d, v in sorted(by_date.items())]

    # ── Chat session CRUD ──────────────────────────────────────────────────

    async def create_chat_session(self, session_id: str, title: str = "New Session", org_id: str | None = None) -> dict:
        """Create a new chat session row and return it."""
        if not self.is_available:
            return {"id": session_id, "title": title, "created_at": None, "updated_at": None, "message_count": 0}
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO chat_sessions (id, title, org_id) VALUES ($1, $2, $3)
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id, title, created_at, updated_at
                """,
                session_id, title, org_id,
            )
        return {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "message_count": 0,
        }

    async def list_chat_sessions(self, org_id: str | None = None) -> list[dict]:
        """Return chat sessions ordered by most recently updated, with message counts."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            if org_id:
                rows = await conn.fetch(
                    """
                    SELECT s.id, s.title, s.created_at, s.updated_at,
                           COUNT(m.id) AS message_count
                    FROM chat_sessions s
                    LEFT JOIN chat_messages m ON m.session_id = s.id
                    WHERE s.org_id = $1
                    GROUP BY s.id, s.title, s.created_at, s.updated_at
                    ORDER BY s.updated_at DESC LIMIT 50
                    """,
                    org_id,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT s.id, s.title, s.created_at, s.updated_at,
                           COUNT(m.id) AS message_count
                    FROM chat_sessions s
                    LEFT JOIN chat_messages m ON m.session_id = s.id
                    GROUP BY s.id, s.title, s.created_at, s.updated_at
                    ORDER BY s.updated_at DESC LIMIT 50
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

    async def chat_session_belongs_to_org(self, session_id: str, org_id: str) -> bool:
        """Return True if the chat session exists and belongs to org_id."""
        if not self.is_available:
            return True  # skip check when DB unavailable (dev mode)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id FROM chat_sessions WHERE id = $1 AND org_id = $2",
                session_id, org_id,
            )
        return row is not None

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

    # ── App settings (key-value store) ────────────────────────────────────

    async def get_setting(self, key: str) -> str | None:
        """Return a stored setting value, or None if not set."""
        if not self.is_available:
            return None
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow("SELECT value FROM app_settings WHERE key = $1", key)
        return row["value"] if row else None

    async def set_setting(self, key: str, value: str) -> None:
        """Upsert a setting value."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO app_settings (key, value)
                VALUES ($1, $2)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                """,
                key, value,
            )

    # ── Global admin settings ──────────────────────────────────────────────

    _DEFAULTS = {
        "global:max_batch_analysis":     "10",   # per-user batch analysis limit
        "global:max_daily_auto_analysis": "20",   # cron auto-analysis cap per org/day
    }

    async def get_global_setting(self, key: str) -> int:
        """Return a global integer setting, falling back to the default."""
        raw = await self.get_setting(key)
        if raw is None:
            raw = self._DEFAULTS.get(key, "0")
        try:
            return int(raw)
        except ValueError:
            return int(self._DEFAULTS.get(key, "0"))

    async def set_global_setting(self, key: str, value: int) -> None:
        """Persist a global integer setting."""
        await self.set_setting(key, str(value))

    # ── Demo chat session CRUD ─────────────────────────────────────────────

    async def create_demo_session(
        self, session_id: str, title: str = "New Demo Chat", trace_destination: str = "langfuse",
        org_id: str | None = None,
    ) -> dict:
        """Create a new demo chat session row and return it."""
        if not self.is_available:
            return {"id": session_id, "title": title, "trace_destination": trace_destination,
                    "created_at": None, "updated_at": None, "message_count": 0}
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO demo_chat_sessions (id, title, trace_destination, org_id) VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id, title, trace_destination, created_at, updated_at
                """,
                session_id, title, trace_destination, org_id,
            )
        return {
            "id": row["id"],
            "title": row["title"],
            "trace_destination": row["trace_destination"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "message_count": 0,
        }

    async def list_demo_sessions(self, limit: int = 30, org_id: str | None = None) -> list[dict]:
        """Return demo chat sessions ordered by most recently updated."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            if org_id:
                rows = await conn.fetch(
                    """
                    SELECT s.id, s.title, s.trace_destination, s.created_at, s.updated_at,
                           COUNT(m.id) AS message_count
                    FROM demo_chat_sessions s
                    LEFT JOIN demo_chat_messages m ON m.session_id = s.id
                    WHERE s.org_id = $1
                    GROUP BY s.id, s.title, s.trace_destination, s.created_at, s.updated_at
                    ORDER BY s.updated_at DESC LIMIT $2
                    """,
                    org_id, limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT s.id, s.title, s.trace_destination, s.created_at, s.updated_at,
                           COUNT(m.id) AS message_count
                    FROM demo_chat_sessions s
                    LEFT JOIN demo_chat_messages m ON m.session_id = s.id
                    GROUP BY s.id, s.title, s.trace_destination, s.created_at, s.updated_at
                    ORDER BY s.updated_at DESC LIMIT $1
                    """,
                    limit,
                )
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "trace_destination": r["trace_destination"] or "langfuse",
                "message_count": int(r["message_count"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            for r in rows
        ]

    async def get_demo_messages(self, session_id: str) -> list[dict]:
        """Return all messages for a demo session in chronological order."""
        if not self.is_available:
            return []
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, session_id, role, content, langfuse_traced, created_at
                FROM demo_chat_messages WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                session_id,
            )
        return [
            {
                "id": r["id"],
                "session_id": r["session_id"],
                "role": r["role"],
                "content": r["content"],
                "langfuse_traced": r["langfuse_traced"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]

    async def append_demo_message(
        self,
        message_id: str,
        session_id: str,
        role: str,
        content: str,
        langfuse_traced: bool = False,
    ) -> None:
        """Append a message and bump session updated_at."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO demo_chat_messages (id, session_id, role, content, langfuse_traced)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO NOTHING
                """,
                message_id, session_id, role, content, langfuse_traced,
            )
            await conn.execute(
                "UPDATE demo_chat_sessions SET updated_at = NOW() WHERE id = $1",
                session_id,
            )

    async def update_failure_type(self, session_id: str, failure_type: str) -> None:
        """Update the failure_type for a session after LangGraph classification."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                "UPDATE sessions SET failure_type = $1 WHERE session_id = $2",
                failure_type, session_id,
            )

    async def update_demo_session_title(self, session_id: str, title: str) -> None:
        """Rename a demo session."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                "UPDATE demo_chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2",
                title[:80], session_id,
            )

    async def delete_chat_session(self, session_id: str, org_id: str | None = None) -> bool:
        """Delete a chat session and its messages. Returns True if a row was deleted."""
        if not self.is_available:
            return False
        async with self._pool.acquire() as conn:
            if org_id:
                result = await conn.execute(
                    "DELETE FROM chat_sessions WHERE id = $1 AND org_id = $2",
                    session_id, org_id,
                )
            else:
                result = await conn.execute(
                    "DELETE FROM chat_sessions WHERE id = $1",
                    session_id,
                )
        return result == "DELETE 1"

    async def delete_demo_session(self, session_id: str, org_id: str | None = None) -> bool:
        """Delete a demo session and its messages. Returns True if a row was deleted."""
        if not self.is_available:
            return False
        async with self._pool.acquire() as conn:
            if org_id:
                result = await conn.execute(
                    "DELETE FROM demo_chat_sessions WHERE id = $1 AND org_id = $2",
                    session_id, org_id,
                )
            else:
                result = await conn.execute(
                    "DELETE FROM demo_chat_sessions WHERE id = $1",
                    session_id,
                )
        return result == "DELETE 1"

    # ── Multi-tenant helpers ───────────────────────────────────────────────

    async def get_user_org_id(self, user_id: str) -> str | None:
        """Return the org_id for a user from the profiles table.

        The profiles row is created by the Supabase trigger on first sign-up.
        Returns None if the profile doesn't exist yet (e.g. first request race).
        """
        if not self.is_available:
            return None
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT org_id FROM profiles WHERE id = $1::uuid",
                    user_id,
                )
            return str(row["org_id"]) if row and row["org_id"] else None
        except Exception as exc:
            logger.warning("get_user_org_id_failed", user_id=user_id, error=str(exc))
            return None


    # ── Trial ──────────────────────────────────────────────────────────────

    _TRIAL_SESSIONS  = 50
    _TRIAL_ANALYSIS  = 20
    _TRIAL_DAYS      = 3

    async def start_trial(self, org_id: str) -> None:
        """Set trial_ends_at on a newly created org."""
        if not self.is_available:
            return
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    f"UPDATE organizations SET trial_ends_at = NOW() + INTERVAL '{self._TRIAL_DAYS} days' WHERE id = $1::uuid AND trial_ends_at IS NULL",
                    org_id,
                )
        except Exception as exc:
            logger.warning("start_trial_failed", org_id=org_id, error=str(exc))

    async def get_trial_status(self, org_id: str) -> dict:
        """Return trial state for an org.

        Returns:
            {
              "in_trial": bool,       # trial active and not expired
              "trial_expired": bool,  # trial period has ended and not converted
              "converted": bool,      # trial completed / billing set up
              "trial_ends_at": str | None,
              "days_remaining": int,
            }
        """
        if not self.is_available:
            return {"in_trial": False, "trial_expired": False, "converted": False, "trial_ends_at": None, "days_remaining": 0}
        try:
            from datetime import datetime, timezone
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT trial_ends_at, trial_converted FROM organizations WHERE id = $1::uuid",
                    org_id,
                )
            if not row or row["trial_ends_at"] is None:
                return {"in_trial": False, "trial_expired": False, "converted": False, "trial_ends_at": None, "days_remaining": 0}
            converted = bool(row["trial_converted"])
            ends_at = row["trial_ends_at"].replace(tzinfo=timezone.utc) if row["trial_ends_at"].tzinfo is None else row["trial_ends_at"]
            now = datetime.now(timezone.utc)
            in_trial = not converted and ends_at > now
            expired  = not converted and ends_at <= now
            days_remaining = max(0, (ends_at - now).days) if in_trial else 0
            return {
                "in_trial": in_trial,
                "trial_expired": expired,
                "converted": converted,
                "trial_ends_at": ends_at.isoformat(),
                "days_remaining": days_remaining,
            }
        except Exception as exc:
            logger.warning("get_trial_status_failed", org_id=org_id, error=str(exc))
            return {"in_trial": False, "trial_expired": False, "converted": False, "trial_ends_at": None, "days_remaining": 0}

    # ── Quota & Usage ──────────────────────────────────────────────────────

    def _current_period(self) -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).strftime("%Y-%m")

    async def get_org_quota(self, org_id: str) -> dict:
        """Return quota limits for an org (falls back to defaults)."""
        if not self.is_available:
            return {
                "sessions_per_month": _DEFAULT_SESSIONS_PER_MONTH,
                "analysis_runs_per_month": _DEFAULT_ANALYSIS_RUNS_PER_MONTH,
            }
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT sessions_per_month, analysis_runs_per_month FROM org_quotas WHERE org_id = $1",
                org_id,
            )
        if row:
            return {"sessions_per_month": row["sessions_per_month"],
                    "analysis_runs_per_month": row["analysis_runs_per_month"]}
        return {
            "sessions_per_month": _DEFAULT_SESSIONS_PER_MONTH,
            "analysis_runs_per_month": _DEFAULT_ANALYSIS_RUNS_PER_MONTH,
        }

    async def get_org_usage(self, org_id: str, period: str | None = None) -> dict:
        """Return current-period usage counters for an org."""
        period = period or self._current_period()
        if not self.is_available:
            return {"period": period, "sessions_ingested": 0, "analysis_runs": 0}
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT sessions_ingested, analysis_runs FROM org_usage WHERE org_id = $1 AND period = $2",
                org_id, period,
            )
        if row:
            return {"period": period,
                    "sessions_ingested": row["sessions_ingested"],
                    "analysis_runs": row["analysis_runs"]}
        return {"period": period, "sessions_ingested": 0, "analysis_runs": 0}

    async def increment_usage(self, org_id: str, resource: str, delta: int = 1) -> None:
        """Atomically increment sessions_ingested or analysis_runs for the current period.

        Also fires a quota warning email if the org crosses the 80% threshold for the
        first time in the current period.
        """
        if not self.is_available or delta <= 0:
            return
        period = self._current_period()
        col = "sessions_ingested" if resource == "sessions" else "analysis_runs"
        warning_col = "sessions_warning_sent" if resource == "sessions" else "analysis_warning_sent"
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                INSERT INTO org_usage (org_id, period, {col})
                VALUES ($1, $2, $3)
                ON CONFLICT (org_id, period)
                DO UPDATE SET {col} = org_usage.{col} + EXCLUDED.{col},
                              updated_at = NOW()
                RETURNING {col}, {warning_col}
                """,
                org_id, period, delta,
            )
        if not row:
            return
        new_count = row[col]
        warning_sent = row[warning_col]
        if warning_sent:
            return
        # Check if we just crossed 80% — fire warning email once per period
        quota = await self.get_org_quota(org_id)
        limit = quota["sessions_per_month"] if resource == "sessions" else quota["analysis_runs_per_month"]
        if limit > 0 and new_count / limit >= 0.8:
            await self._send_quota_warning(org_id, resource, new_count, limit, warning_col, period)

    async def _send_quota_warning(
        self, org_id: str, resource: str, used: int, limit: int,
        warning_col: str, period: str,
    ) -> None:
        """Send quota warning email and mark it sent for the period."""
        if not self.is_available:
            return
        # Mark warning sent atomically to avoid double-sends
        async with self._pool.acquire() as conn:
            updated = await conn.execute(
                f"UPDATE org_usage SET {warning_col} = TRUE WHERE org_id = $1 AND period = $2 AND {warning_col} = FALSE",
                org_id, period,
            )
        if updated == "UPDATE 0":
            return  # another process already sent it
        try:
            # Fetch org admin email
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT u.email FROM auth.users u
                    JOIN profiles p ON p.id = u.id
                    WHERE p.org_id::TEXT = $1 AND p.role = 'owner'
                    LIMIT 1
                    """,
                    org_id,
                )
            from app.services.email_service import send_quota_warning_email
            pct = (used / limit) * 100
            for row in rows:
                if row["email"]:
                    await send_quota_warning_email(row["email"], resource, used, limit, pct)
        except Exception as exc:
            logger.warning("quota_warning_email_failed", org_id=org_id, error=str(exc))

    async def check_quota(self, org_id: str, resource: str, requested: int = 1) -> tuple[bool, int, int, str | None]:
        """Check if org has quota remaining.

        Returns (allowed, current_usage, limit, block_reason).
        resource: 'sessions' | 'analysis_runs'
        block_reason is None when allowed, otherwise a human-readable message.
        """
        trial = await self.get_trial_status(org_id)

        # Hard block on expired trial
        if trial["trial_expired"]:
            return False, 0, 0, (
                "Your 3-day trial has ended. "
                "Contact us to continue using Aethen."
            )

        # Apply trial limits when in trial
        if trial["in_trial"]:
            limit = self._TRIAL_SESSIONS if resource == "sessions" else self._TRIAL_ANALYSIS
        else:
            quota = await self.get_org_quota(org_id)
            limit = quota["sessions_per_month"] if resource == "sessions" else quota["analysis_runs_per_month"]

        # 0 means unlimited — always allow
        if limit == 0:
            return True, 0, 0, None

        usage = await self.get_org_usage(org_id)
        current = usage["sessions_ingested"] if resource == "sessions" else usage["analysis_runs"]

        if current + requested > limit:
            remaining = max(0, limit - current)
            label = "sessions" if resource == "sessions" else "analysis runs"
            if trial["in_trial"]:
                reason = (
                    f"Trial limit reached: {current}/{limit} {label} used. "
                    "Trial includes up to 50 sessions and 20 analysis runs."
                )
            else:
                reason = (
                    f"Monthly quota exceeded: {current}/{limit} {label} used. "
                    f"{remaining} remaining. Resets on the 1st of next month."
                )
            return False, current, limit, reason

        return True, current, limit, None

    async def set_org_quota(self, org_id: str, sessions_per_month: int, analysis_runs_per_month: int) -> None:
        """Admin: set custom quota for an org."""
        if not self.is_available:
            return
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO org_quotas (org_id, sessions_per_month, analysis_runs_per_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (org_id) DO UPDATE
                SET sessions_per_month      = EXCLUDED.sessions_per_month,
                    analysis_runs_per_month = EXCLUDED.analysis_runs_per_month,
                    updated_at              = NOW()
                """,
                org_id, sessions_per_month, analysis_runs_per_month,
            )


postgres_service = PostgresService()
