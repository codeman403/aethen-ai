"""Seed Neo4j with synthetic trace sessions.

Generates 500 synthetic sessions and ingests them into Neo4j, building the
full 7-node / 10-relationship graph schema.

Usage:
    cd backend
    poetry run python scripts/seed_neo4j.py
    poetry run python scripts/seed_neo4j.py --count 500 --batch 50
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from scripts.generate_traces import generate_traces
from app.models.trace import Session
from app.services.neo4j_service import neo4j_service
from app.services.postgres_service import postgres_service


async def seed(count: int, batch_size: int) -> None:
    await neo4j_service.initialize()
    await postgres_service.initialize()

    if not neo4j_service.is_available:
        print("ERROR: Neo4j not available — check NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD in .env")
        sys.exit(1)

    print(f"\nGenerating {count} sessions …")
    sessions = [Session(**s) for s in generate_traces(count)]
    print(f"Sessions ready: {len(sessions)}\n")

    total_ok = 0
    errors = 0

    for i in range(0, len(sessions), batch_size):
        batch = sessions[i : i + batch_size]
        for session in batch:
            try:
                await neo4j_service.create_session_node(session)
                await postgres_service.save_session(session)
                total_ok += 1
            except Exception as exc:
                print(f"  ✗ {session.session_id}: {exc}")
                errors += 1

        done = min(i + batch_size, len(sessions))
        print(f"  Batch {i // batch_size + 1}: sessions {i + 1}–{done}  |  ok so far: {total_ok}")

    # Link cross-session patterns
    print("\nLinking failure patterns across sessions …")
    try:
        linked = await neo4j_service.link_failure_patterns()
        print(f"  RELATED_TO relationships created: {linked}")
    except Exception as exc:
        print(f"  Warning: pattern linking failed: {exc}")

    # Print graph stats
    stats = await neo4j_service.get_graph_stats()
    print(f"\n{'─' * 50}")
    print("  Graph stats:")
    if stats.get("nodes"):
        for label, cnt in stats["nodes"].items():
            print(f"    Node  {label:<20} {cnt:>6}")
    if stats.get("relationships"):
        for rel, cnt in stats["relationships"].items():
            print(f"    Rel   {rel:<20} {cnt:>6}")
    print(f"\n  Sessions ingested : {total_ok}")
    print(f"  Errors            : {errors}")

    node_types = len(stats.get("nodes", {}))
    rel_types = len(stats.get("relationships", {}))
    if node_types >= 7 and rel_types >= 10:
        print(f"  ✅ Schema target met ({node_types} node types, {rel_types} relationship types)")
    else:
        print(f"  ⚠️  Schema: {node_types}/7 node types, {rel_types}/10 relationship types")
    print(f"{'─' * 50}\n")

    pg_available = "✅" if postgres_service.is_available else "⚠️  Postgres unavailable (DATABASE_URL not set?)"
    print(f"  Postgres         : {pg_available}")
    print(f"{'─' * 50}\n")

    await neo4j_service.close()
    await postgres_service.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Neo4j with synthetic trace sessions")
    parser.add_argument("--count", type=int, default=500, help="Number of sessions (default: 500)")
    parser.add_argument("--batch", type=int, default=50, help="Sessions per batch (default: 50)")
    args = parser.parse_args()

    asyncio.run(seed(args.count, args.batch))


if __name__ == "__main__":
    main()
