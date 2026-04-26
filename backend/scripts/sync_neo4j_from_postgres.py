"""Rebuild Neo4j graph from Postgres (the source of truth).

This script:
  1. Wipes all Neo4j nodes and relationships
  2. Reads every session from Postgres (full JSON payload)
  3. Re-creates the full 7-node / 10-relationship graph schema in Neo4j
  4. Links cross-session failure patterns (RELATED_TO edges)

Use this whenever Neo4j has stale or duplicate data, or after any Postgres
re-seed. Postgres is authoritative — Neo4j is always derivable from it.

Usage:
    cd backend
    poetry run python scripts/sync_neo4j_from_postgres.py
    poetry run python scripts/sync_neo4j_from_postgres.py --dry-run
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from app.models.trace import Session
from app.services.neo4j_service import neo4j_service
from app.services.postgres_service import postgres_service


async def sync(batch_size: int, dry_run: bool) -> None:
    await neo4j_service.initialize()
    await postgres_service.initialize()

    if not neo4j_service.is_available:
        print("ERROR: Neo4j not available — check NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD in .env")
        sys.exit(1)

    if not postgres_service.is_available:
        print("ERROR: Postgres not available — check DATABASE_URL in .env")
        sys.exit(1)

    # ── 1. Read all sessions from Postgres ────────────────────────────────
    print("\nReading sessions from Postgres …")
    summaries = await postgres_service.get_all_summaries(limit=10_000)
    total = len(summaries)
    print(f"  Found {total} sessions in Postgres\n")

    if total == 0:
        print("Nothing to sync — Postgres has no sessions. Run seed_neo4j.py first.")
        await neo4j_service.close()
        await postgres_service.close()
        return

    if dry_run:
        print(f"[DRY RUN] Would wipe Neo4j and rebuild {total} sessions. Exiting without changes.")
        await neo4j_service.close()
        await postgres_service.close()
        return

    # ── 2. Wipe Neo4j ─────────────────────────────────────────────────────
    print("Wiping Neo4j (DETACH DELETE all nodes) …")
    async with neo4j_service._driver.session() as db:
        result = await db.run("MATCH (n) DETACH DELETE n")
        await result.consume()
    print("  ✓ Neo4j cleared\n")

    # ── 3. Rebuild graph from Postgres ────────────────────────────────────
    print(f"Rebuilding Neo4j graph from {total} Postgres sessions …")
    ok = 0
    errors = 0

    for i in range(0, total, batch_size):
        batch_ids = [s["session_id"] for s in summaries[i : i + batch_size]]

        for session_id in batch_ids:
            raw = await postgres_service.get_session(session_id)
            if not raw:
                print(f"  ✗ {session_id}: not found in Postgres (skipped)")
                errors += 1
                continue
            try:
                session = Session(**raw)
                await neo4j_service.create_session_node(session)
                ok += 1
            except Exception as exc:
                print(f"  ✗ {session_id}: {exc}")
                errors += 1

        done = min(i + batch_size, total)
        print(f"  Batch {i // batch_size + 1}: {i + 1}–{done}  |  ok so far: {ok}")

    # ── 4. Link cross-session failure patterns ────────────────────────────
    print("\nLinking failure patterns across sessions …")
    try:
        linked = await neo4j_service.link_failure_patterns()
        print(f"  RELATED_TO relationships created: {linked}")
    except Exception as exc:
        print(f"  Warning: pattern linking failed: {exc}")

    # ── 5. Summary ────────────────────────────────────────────────────────
    stats = await neo4j_service.get_graph_stats()
    print(f"\n{'─' * 52}")
    print("  Neo4j graph stats after sync:")
    if stats.get("nodes"):
        for label, cnt in stats["nodes"].items():
            print(f"    Node  {label:<22} {cnt:>6}")
    if stats.get("relationships"):
        for rel, cnt in stats["relationships"].items():
            print(f"    Rel   {rel:<22} {cnt:>6}")

    print(f"\n  Postgres sessions : {total}")
    print(f"  Neo4j sessions    : {ok}")
    print(f"  Errors            : {errors}")

    node_types = len(stats.get("nodes", {}))
    rel_types  = len(stats.get("relationships", {}))
    if ok == total and errors == 0:
        print(f"\n  ✅ Sync complete — Neo4j is in sync with Postgres")
    else:
        print(f"\n  ⚠️  Sync finished with {errors} error(s)")

    if node_types >= 7 and rel_types >= 10:
        print(f"  ✅ Schema target met ({node_types} node types, {rel_types} rel types)")
    else:
        print(f"  ⚠️  Schema: {node_types}/7 node types, {rel_types}/10 rel types")
    print(f"{'─' * 52}\n")

    await neo4j_service.close()
    await postgres_service.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild Neo4j graph from Postgres (source of truth)"
    )
    parser.add_argument(
        "--batch", type=int, default=25,
        help="Sessions per batch (default: 25)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would happen without making any changes"
    )
    args = parser.parse_args()
    asyncio.run(sync(args.batch, args.dry_run))


if __name__ == "__main__":
    main()
