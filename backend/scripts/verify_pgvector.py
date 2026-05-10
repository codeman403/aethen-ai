"""Compare pgvector vs Pinecone query results to verify migration quality.

Usage:
    poetry run python scripts/verify_pgvector.py [--samples 20]

For N random failure sessions, queries both backends with the same text and
computes the overlap of returned session_ids in top-10 results.

Pass threshold: ≥80% average overlap.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

sys.path.insert(0, ".")


async def main(samples: int = 20) -> None:
    from app.services.postgres_service import postgres_service
    from app.services.pgvector_service  import pgvector_service
    from app.services.pinecone_service  import pinecone_service
    from app.services.embedding_service import embedding_service

    await postgres_service.initialize()
    await embedding_service.initialize()
    await pinecone_service.initialize()

    if not pinecone_service.is_available:
        print("✗ Pinecone not available — cannot verify. Set PINECONE_API_KEY.")
        sys.exit(1)

    if not pgvector_service.is_available:
        print("✗ pgvector not available — run backfill first.")
        sys.exit(1)

    # Pick random failure sessions that have been indexed in pgvector
    async with postgres_service._pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT v.session_id, s.failure_summary
            FROM session_vectors v
            JOIN sessions s ON s.session_id = v.session_id
            WHERE v.namespace = 'failure_patterns'
              AND s.outcome = 'failure'
              AND s.failure_summary IS NOT NULL
              AND s.session_id NOT LIKE 'anti-%%'
              AND s.session_id NOT LIKE 'bias-%%'
              AND s.session_id NOT LIKE 'quota-%%'
            GROUP BY v.session_id, s.failure_summary
            ORDER BY RANDOM()
            LIMIT $1
            """,
            samples,
        )

    if not rows:
        print("✗ No indexed failure sessions found — run backfill first.")
        sys.exit(1)

    print(f"Verifying {len(rows)} sessions…\n")
    overlaps: list[float] = []
    PASS_THRESHOLD = 0.80

    for row in rows:
        sid      = row["session_id"]
        summary  = row["failure_summary"]
        query    = summary[:500]

        try:
            pg_res  = await pgvector_service.query_similar(
                query, namespace="failure_patterns", top_k=10,
                filters={"session_id": {"$ne": sid}},
            )
            pin_res = await pinecone_service.query_similar(
                query, namespace="failure_patterns", top_k=10,
                filters={"session_id": {"$ne": sid}},
            )

            pg_ids  = {r["metadata"]["session_id"] for r in pg_res  if r.get("metadata", {}).get("session_id")}
            pin_ids = {r["metadata"]["session_id"] for r in pin_res if r.get("metadata", {}).get("session_id")}

            if pin_ids:
                overlap = len(pg_ids & pin_ids) / len(pin_ids)
            else:
                overlap = 1.0  # both empty → match

            overlaps.append(overlap)
            icon = "✓" if overlap >= PASS_THRESHOLD else "✗"
            print(f"  {icon} {sid[:20]}…  overlap={overlap:.0%}  "
                  f"pgvector={len(pg_ids)}  pinecone={len(pin_ids)}")

        except Exception as exc:
            print(f"  ? {sid[:20]}… error: {exc}")

    print()
    if overlaps:
        avg_overlap = sum(overlaps) / len(overlaps)
        passed      = avg_overlap >= PASS_THRESHOLD
        print(f"Average overlap : {avg_overlap:.1%}  (threshold: {PASS_THRESHOLD:.0%})")
        print(f"Result          : {'✓ PASS — pgvector results match Pinecone' if passed else '✗ FAIL — overlap below threshold'}")
        await postgres_service.close()
        sys.exit(0 if passed else 1)
    else:
        print("No results to compare.")
        await postgres_service.close()
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=20)
    args = parser.parse_args()
    asyncio.run(main(samples=args.samples))
