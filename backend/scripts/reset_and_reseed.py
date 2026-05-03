"""Full reset and reseed — clears all 3 stores then populates with clean synthetic data.

Run this whenever you need a completely fresh start with guaranteed clean data.

Steps:
  1. Truncate Postgres sessions table
  2. Wipe Neo4j graph
  3. Delete all Pinecone vectors in the traces namespace
  4. Generate 500 fresh sessions (clean plain-English prompts/responses)
  5. Seed Postgres + Neo4j together
  6. Seed Pinecone

Usage:
    cd backend
    poetry run python scripts/reset_and_reseed.py
    poetry run python scripts/reset_and_reseed.py --count 500
"""

import asyncio
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from scripts.generate_traces import generate_traces
from app.models.trace import FailureType, Session
from app.services.neo4j_service import neo4j_service
from app.services.postgres_service import postgres_service
from app.services.pinecone_service import pinecone_service
from app.services.embedding_service import embedding_service


async def reset_postgres() -> None:
    print("\n[1/6] Clearing Postgres sessions …")
    if not postgres_service.is_available:
        print("  ⚠️  Postgres unavailable — skipping")
        return
    async with postgres_service._pool.acquire() as conn:
        await conn.execute("TRUNCATE sessions, chat_sessions, chat_messages")
    print("  ✓ Postgres cleared (sessions, chat_sessions, chat_messages)")


async def reset_neo4j() -> None:
    print("\n[2/6] Clearing Neo4j graph …")
    if not neo4j_service.is_available:
        print("  ⚠️  Neo4j unavailable — skipping")
        return
    async with neo4j_service._driver.session() as db:
        result = await db.run("MATCH (n) DETACH DELETE n")
        await result.consume()
    print("  ✓ Neo4j cleared")


async def reset_pinecone() -> None:
    print("\n[3/6] Clearing Pinecone traces namespace …")
    if not pinecone_service.is_available:
        print("  ⚠️  Pinecone unavailable — skipping")
        return
    try:
        pinecone_service._index.delete(delete_all=True, namespace="traces")
        print("  ✓ Pinecone traces namespace cleared")
    except Exception as exc:
        print(f"  ⚠️  Pinecone clear warning: {exc}")


async def seed_postgres_and_neo4j(sessions: list[Session]) -> tuple[int, int]:
    print(f"\n[4/6] Seeding Postgres + Neo4j with {len(sessions)} sessions …")
    ok = 0
    errors = 0
    batch_size = 50

    for i in range(0, len(sessions), batch_size):
        batch = sessions[i : i + batch_size]
        for session in batch:
            try:
                if postgres_service.is_available:
                    await postgres_service.save_session(session)
                if neo4j_service.is_available:
                    await neo4j_service.create_session_node(session)
                ok += 1
            except Exception as exc:
                print(f"  ✗ {session.session_id}: {exc}")
                errors += 1
        done = min(i + batch_size, len(sessions))
        print(f"  Batch {i // batch_size + 1}: {i + 1}–{done} | ok so far: {ok}")

    if neo4j_service.is_available:
        print("  Linking failure patterns …")
        try:
            linked = await neo4j_service.link_failure_patterns()
            print(f"  RELATED_TO relationships created: {linked}")
        except Exception as exc:
            print(f"  Warning: pattern linking failed: {exc}")

    return ok, errors


async def seed_pinecone(sessions: list[Session]) -> tuple[int, int]:
    print(f"\n[5/6] Seeding Pinecone with {len(sessions)} sessions …")
    if not pinecone_service.is_available:
        print("  ⚠️  Pinecone unavailable — skipping")
        return 0, 0

    total = 0
    errors = 0
    batch_size = 25

    for i in range(0, len(sessions), batch_size):
        batch = sessions[i : i + batch_size]
        for session in batch:
            try:
                n = await pinecone_service.upsert_session(session)
                total += n
            except Exception as exc:
                print(f"  ✗ {session.session_id}: {exc}")
                errors += 1
        done = min(i + batch_size, len(sessions))
        print(f"  Batch {i // batch_size + 1}: {i + 1}–{done} | vectors so far: {total}")
        if done < len(sessions):
            time.sleep(1)  # respect OpenAI embedding rate limits

    return total, errors


async def run(count: int, no_reset: bool = False, analyze: bool = False) -> None:
    # Initialise all services
    await postgres_service.initialize()
    await neo4j_service.initialize()
    await embedding_service.initialize()
    await pinecone_service.initialize()

    # ── Reset (skipped with --no-reset) ───────────────────────────────────
    if no_reset:
        print("\n[*] --no-reset: skipping store wipe — appending to existing data")
    else:
        await reset_postgres()
        await reset_neo4j()
        await reset_pinecone()

    # ── Generate fresh sessions ───────────────────────────────────────────
    step = "2" if no_reset else "4"
    print(f"\n[{step}/6] Generating {count} fresh synthetic sessions …")
    raw = generate_traces(count)
    sessions = [Session(**s) for s in raw]
    print(f"  Sessions generated: {len(sessions)}")

    # Quick sanity check — first session should have plain-text prompts
    if sessions and sessions[0].llm_calls:
        sample = sessions[0].llm_calls[0].prompt
        print(f"  Sample prompt: {sample[:80]!r}")

    # ── Seed ──────────────────────────────────────────────────────────────
    ok, errs = await seed_postgres_and_neo4j(sessions)

    vectors, verrs = await seed_pinecone(sessions)

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n{'─' * 56}")
    print("[6/6] Summary")
    print(f"  Sessions generated : {len(sessions)}")
    print(f"  Postgres + Neo4j   : {ok} ok, {errs} errors")
    print(f"  Pinecone vectors   : {vectors} upserted, {verrs} errors")

    if ok == len(sessions) and errs == 0:
        print("\n  ✅ Fresh reseed complete — all stores in sync")
    else:
        print(f"\n  ⚠️  Completed with {errs + verrs} error(s)")

    if vectors >= 1000:
        print("  ✅ Pinecone rubric met (≥1,000 vectors)")

    # Neo4j schema check
    stats = await neo4j_service.get_graph_stats()
    node_types = len(stats.get("nodes", {}))
    rel_types  = len(stats.get("relationships", {}))
    if node_types >= 7 and rel_types >= 10:
        print(f"  ✅ Neo4j schema target met ({node_types} node types, {rel_types} rel types)")
    else:
        print(f"  ⚠️  Neo4j schema: {node_types}/7 node types, {rel_types}/10 rel types")

    print(f"{'─' * 56}\n")

    # ── Optional: run LangGraph analysis on all failure sessions ─────────
    if analyze:
        await analyze_sessions(sessions)

    await neo4j_service.close()
    await postgres_service.close()


async def analyze_sessions(sessions: list[Session]) -> None:
    """Run LangGraph analysis on all failure sessions and cache the reports.

    Skips success sessions (synthesize returns a clean empty report immediately).
    Only analyzes sessions with actual failure_type set to avoid wasting LLM calls.
    """
    from app.agents.graph import analysis_graph
    from app.agents.state import AnalysisReport as AgentAnalysisReport

    failure_sessions = [s for s in sessions if s.failure_type is not None]
    print(f"\n[+] Running analysis on {len(failure_sessions)} failure sessions (skipping {len(sessions) - len(failure_sessions)} success sessions)…")
    print("    This runs the full LangGraph pipeline — expect ~25s per session.\n")

    ok = 0
    skipped = 0
    errors  = 0

    for i, session in enumerate(failure_sessions, 1):
        try:
            # Skip if already cached
            cached = await postgres_service.get_analysis_report(session.session_id)
            if cached:
                skipped += 1
                continue

            result = await analysis_graph.ainvoke({"session": session})
            report = AgentAnalysisReport(**result["report"])

            if report.failure_type and report.failure_type != FailureType.UNKNOWN:
                await postgres_service.update_failure_type(session.session_id, str(report.failure_type))

            await postgres_service.save_analysis_report(session.session_id, report.model_dump(mode="json"))
            ok += 1
            print(f"  [{i}/{len(failure_sessions)}] ✓ {session.session_id} — {report.failure_type} ({len(report.findings)} findings)")

        except Exception as exc:
            errors += 1
            print(f"  [{i}/{len(failure_sessions)}] ✗ {session.session_id}: {exc}")

    print(f"\n  Analysis complete: {ok} ok, {skipped} already cached, {errors} errors")


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset all stores and reseed with clean data")
    parser.add_argument("--count", type=int, default=500,
                        help="Number of sessions to generate (default: 500)")
    parser.add_argument("--no-reset", action="store_true",
                        help="Skip store wipe — append new sessions to existing data")
    parser.add_argument("--analyze", action="store_true",
                        help="Run LangGraph analysis on all failure sessions after seeding (~25s each)")
    args = parser.parse_args()
    asyncio.run(run(args.count, no_reset=args.no_reset, analyze=args.analyze))


if __name__ == "__main__":
    main()
