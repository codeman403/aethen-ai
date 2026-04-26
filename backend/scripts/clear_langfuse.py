"""Delete all traces from Langfuse — fresh start.

Uses the Langfuse REST API to list every trace and delete it one by one.
Run this when you want to wipe the Langfuse trace history clean.

Usage:
    cd backend
    poetry run python scripts/clear_langfuse.py
    poetry run python scripts/clear_langfuse.py --dry-run   # list without deleting
"""

import asyncio
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

from app.config import settings


def get_client():
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        print("ERROR: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set in .env")
        sys.exit(1)
    from langfuse.api import LangfuseAPI
    return LangfuseAPI(
        base_url=settings.langfuse_base_url or "https://us.cloud.langfuse.com",
        username=settings.langfuse_public_key,
        password=settings.langfuse_secret_key,
    )


def run(dry_run: bool) -> None:
    client = get_client()

    print("\nFetching traces from Langfuse …")
    all_trace_ids: list[str] = []
    page = 1

    while True:
        try:
            resp = client.trace.list(limit=100, page=page)
            traces = resp.data if hasattr(resp, "data") else []
            if not traces:
                break
            all_trace_ids.extend(t.id for t in traces if hasattr(t, "id"))
            if len(traces) < 100:
                break
            page += 1
        except Exception as exc:
            print(f"  Error fetching page {page}: {exc}")
            break

    total = len(all_trace_ids)
    print(f"  Found {total} trace(s)")

    if total == 0:
        print("  Nothing to delete.")
        return

    if dry_run:
        print(f"\n[DRY RUN] Would delete {total} traces. Re-run without --dry-run to proceed.")
        for tid in all_trace_ids[:10]:
            print(f"  • {tid}")
        if total > 10:
            print(f"  … and {total - 10} more")
        return

    print(f"\nDeleting {total} traces …")
    deleted = 0
    errors  = 0

    for tid in all_trace_ids:
        try:
            client.trace.delete(tid)
            deleted += 1
            if deleted % 10 == 0:
                print(f"  Deleted {deleted}/{total} …")
        except Exception as exc:
            print(f"  ✗ {tid}: {exc}")
            errors += 1

    print(f"\n{'─' * 40}")
    print(f"  Deleted : {deleted}")
    print(f"  Errors  : {errors}")
    if errors == 0:
        print("  ✅ Langfuse traces cleared")
    print(f"{'─' * 40}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete all Langfuse traces")
    parser.add_argument("--dry-run", action="store_true",
                        help="List traces without deleting")
    args = parser.parse_args()
    run(args.dry_run)


if __name__ == "__main__":
    main()
