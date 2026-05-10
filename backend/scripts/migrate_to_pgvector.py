"""Backfill existing sessions from Postgres into pgvector session_vectors table.

Usage:
    poetry run python scripts/migrate_to_pgvector.py [--batch 50] [--dry-run]

The script re-embeds session data from Postgres (same model + same text as
original Pinecone ingest), so vectors are byte-identical. Idempotent — uses
ON CONFLICT DO UPDATE so safe to re-run.

Steps:
  1. Count sessions without any vectors in session_vectors
  2. Process in batches, embedding and inserting
  3. Print progress + final count
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time

sys.path.insert(0, ".")


async def main(batch_size: int = 50, dry_run: bool = False) -> None:
    from app.services.postgres_service import postgres_service
    from app.services.pgvector_service import pgvector_service
    from app.services.embedding_service import embedding_service
    from app.models.trace import Session

    await postgres_service.initialize()
    await embedding_service.initialize()

    print(f"{'[DRY RUN] ' if dry_run else ''}Starting pgvector backfill…")
    print(f"  Batch size : {batch_size}")

    async with postgres_service._pool.acquire() as conn:
        total_sessions = await conn.fetchval("SELECT COUNT(*) FROM sessions") or 0
        already_done   = await conn.fetchval(
            "SELECT COUNT(DISTINCT session_id) FROM session_vectors"
        ) or 0

    print(f"  Total sessions  : {total_sessions}")
    print(f"  Already indexed : {already_done}")
    print(f"  Remaining       : {total_sessions - already_done}")
    print()

    if total_sessions == already_done:
        print("✓ All sessions already indexed — nothing to do.")
        await postgres_service.close()
        return

    # Collect all unindexed session_ids upfront — avoids offset pagination bug
    # (WHERE NOT EXISTS changes as we insert, making OFFSET skip sessions).
    async with postgres_service._pool.acquire() as conn:
        pending = await conn.fetch(
            """
            SELECT s.session_id, s.session_data, s.org_id::TEXT AS org_id
            FROM sessions s
            WHERE NOT EXISTS (
                SELECT 1 FROM session_vectors v WHERE v.session_id = s.session_id
            )
            ORDER BY s.created_at
            """
        )

    print(f"  Pending sessions: {len(pending)}\n")

    processed = 0
    errors    = 0
    t_start   = time.monotonic()
    total_pending = len(pending)

    for i in range(0, total_pending, batch_size):
        batch = pending[i:i + batch_size]
        for row in batch:
            try:
                data = dict(row["session_data"]) if isinstance(row["session_data"], dict) else {}
                data["session_id"] = row["session_id"]
                session = Session(**data)

                if not dry_run:
                    await pgvector_service.upsert_session(session, org_id=row["org_id"])

                processed += 1
                elapsed = time.monotonic() - t_start
                rate    = processed / elapsed if elapsed > 0 else 0
                print(f"  [{processed}/{total_pending}] "
                      f"{row['session_id']} "
                      f"({rate:.1f} sessions/s)", end="\r", flush=True)

            except Exception as exc:
                errors += 1
                print(f"\n  ✗ {row['session_id']}: {exc}")

    print()
    elapsed = time.monotonic() - t_start
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Backfill complete.")
    print(f"  Processed : {processed}")
    print(f"  Errors    : {errors}")
    print(f"  Time      : {elapsed:.1f}s")

    if not dry_run:
        async with postgres_service._pool.acquire() as conn:
            final = await conn.fetchval(
                "SELECT COUNT(DISTINCT session_id) FROM session_vectors"
            ) or 0
        print(f"  Vectors in DB : {final} distinct sessions indexed")

    await postgres_service.close()
    sys.exit(1 if errors > 0 else 0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(batch_size=args.batch, dry_run=args.dry_run))
