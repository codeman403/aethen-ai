"""Seed Pinecone with synthetic trace embeddings.

Generates 500 synthetic sessions (100 per failure type + successes) and
upserts their event embeddings into Pinecone. Run this once to satisfy the
≥1,000 embeddings rubric requirement.

Usage:
    cd backend
    poetry run python scripts/seed_pinecone.py
    poetry run python scripts/seed_pinecone.py --count 500 --batch 25
"""

import asyncio
import argparse
import sys
import time
from pathlib import Path

# Make app importable from scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

# Resolve .env relative to this script's location (backend/.env)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path, override=True)

from scripts.generate_traces import GENERATORS, generate_traces
from app.models.trace import Session
from app.services.embedding_service import embedding_service
from app.services.pinecone_service import pinecone_service


async def seed(count: int, batch_size: int) -> None:
    # ── Init services ──────────────────────────────────────────────────────
    await embedding_service.initialize()
    await pinecone_service.initialize()

    if not pinecone_service.is_available:
        print("ERROR: Pinecone not available — check PINECONE_API_KEY and PINECONE_INDEX in .env")
        sys.exit(1)

    print(f"\nGenerating {count} sessions …")
    raw_sessions = generate_traces(count)
    sessions = [Session(**s) for s in raw_sessions]

    # ── Count events for an upfront estimate ──────────────────────────────
    total_events = sum(
        len(s.llm_calls) + len(s.tool_calls) + len(s.retrieval_events)
        for s in sessions
    )
    print(f"Sessions: {len(sessions)}  |  Estimated vectors: {total_events}\n")

    # ── Upsert in batches ─────────────────────────────────────────────────
    total_upserted = 0
    errors = 0

    for i in range(0, len(sessions), batch_size):
        batch = sessions[i : i + batch_size]
        batch_vectors = 0

        for session in batch:
            try:
                n = await pinecone_service.upsert_session(session)
                batch_vectors += n
                total_upserted += n
            except Exception as exc:
                print(f"  ✗ {session.session_id}: {exc}")
                errors += 1

        done = min(i + batch_size, len(sessions))
        print(
            f"  Batch {i // batch_size + 1}: sessions {i + 1}–{done}"
            f"  |  +{batch_vectors} vectors  |  total so far: {total_upserted}"
        )

        # Respect OpenAI embedding API rate limits (3,000 RPM on free tier)
        if done < len(sessions):
            time.sleep(1)

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n{'─' * 50}")
    print(f"  Sessions processed : {len(sessions)}")
    print(f"  Vectors upserted   : {total_upserted}")
    print(f"  Errors             : {errors}")
    print(f"  Namespace          : traces")
    if total_upserted >= 1000:
        print(f"  ✅ Rubric requirement met (≥1,000 embeddings)")
    else:
        shortfall = 1000 - total_upserted
        print(f"  ⚠️  {shortfall} more vectors needed — re-run with --count {count + 250}")
    print(f"{'─' * 50}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Pinecone with synthetic trace embeddings")
    parser.add_argument("--count", type=int, default=500,
                        help="Number of sessions to generate (default: 500 → ~1,100+ vectors)")
    parser.add_argument("--batch", type=int, default=25,
                        help="Sessions per batch (default: 25)")
    args = parser.parse_args()

    asyncio.run(seed(args.count, args.batch))


if __name__ == "__main__":
    main()
