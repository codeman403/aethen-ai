"""Add RLS UPDATE policies so users can edit their own profile and org.

Run once after the initial auth schema migration.

Usage:
    cd backend
    poetry run python scripts/migrate_profile_update_policies.py
    poetry run python scripts/migrate_profile_update_policies.py --dry-run
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import os
import asyncpg


_STEPS: list[tuple[str, str]] = [
    (
        "Drop old self_read policy on profiles (replace with combined)",
        "DROP POLICY IF EXISTS self_read ON public.profiles",
    ),
    (
        "Create profiles SELECT policy",
        """
        CREATE POLICY profiles_select ON public.profiles
            FOR SELECT USING (
                id = auth.uid()
                OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
            )
        """,
    ),
    (
        "Create profiles UPDATE policy (own row only)",
        """
        CREATE POLICY profiles_update ON public.profiles
            FOR UPDATE USING (id = auth.uid())
            WITH CHECK (id = auth.uid())
        """,
    ),
    (
        "Drop old org_read policy on organizations",
        "DROP POLICY IF EXISTS org_read ON public.organizations",
    ),
    (
        "Create organizations SELECT policy",
        """
        CREATE POLICY organizations_select ON public.organizations
            FOR SELECT USING (
                id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
            )
        """,
    ),
    (
        "Create organizations UPDATE policy (owner only)",
        """
        CREATE POLICY organizations_update ON public.organizations
            FOR UPDATE USING (
                id = (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
            )
            WITH CHECK (
                id = (SELECT org_id FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
            )
        """,
    ),
]


def _redact(url: str) -> str:
    try:
        from urllib.parse import urlparse, urlunparse
        p = urlparse(url)
        safe = p._replace(netloc=f"{p.username}:***@{p.hostname}{f':{p.port}' if p.port else ''}")
        return urlunparse(safe)
    except Exception:
        return "<redacted>"


async def run(dry_run: bool) -> None:
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        print("ERROR: DATABASE_URL not set in .env", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to: {_redact(database_url)}")
    if dry_run:
        print("DRY-RUN mode — no changes will be made.\n")

    conn = await asyncpg.connect(database_url, statement_cache_size=0)
    try:
        passed = failed = 0
        for label, sql in _STEPS:
            print(f"  ➜  {label} … ", end="", flush=True)
            if dry_run:
                print("(skipped)")
                continue
            try:
                await conn.execute(sql)
                print("OK")
                passed += 1
            except Exception as exc:
                print(f"FAILED\n      {exc}")
                failed += 1

        if not dry_run:
            print(f"\nMigration complete: {passed} passed, {failed} failed.")
            if failed:
                sys.exit(1)
        else:
            print(f"\n{len(_STEPS)} steps would be executed.")
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
