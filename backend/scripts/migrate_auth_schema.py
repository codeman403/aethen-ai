"""Run the multi-tenant auth schema migration.

Creates:
  - public.organizations  (tenant table)
  - public.profiles        (extends auth.users)
  - org_id column on sessions, chat_sessions, demo_chat_sessions
  - Indexes for tenant-scoped queries
  - Row-Level Security policies on all four tables
  - Supabase trigger: auto-create org + profile on every new sign-up

Safe to run multiple times — all DDL uses IF NOT EXISTS / IF NOT EXISTS guards,
and existing policies are dropped and recreated to stay idempotent.

Usage:
    cd backend
    poetry run python scripts/migrate_auth_schema.py

    # Dry-run (print SQL only, no execution):
    poetry run python scripts/migrate_auth_schema.py --dry-run
"""

import argparse
import asyncio
import sys
from pathlib import Path

# ── Bootstrap: load .env and project path ────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import os
import asyncpg

# ── SQL statements (ordered — dependencies first) ─────────────────────────────

_STEPS: list[tuple[str, str]] = [
    # ── 1. Organizations ──────────────────────────────────────────────────────
    (
        "Create organizations table",
        """
        CREATE TABLE IF NOT EXISTS public.organizations (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT        NOT NULL,
            slug        TEXT        UNIQUE NOT NULL,
            created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ),

    # ── 2. Profiles ───────────────────────────────────────────────────────────
    (
        "Create profiles table",
        """
        CREATE TABLE IF NOT EXISTS public.profiles (
            id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            org_id      UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
            full_name   TEXT,
            avatar_url  TEXT,
            role        TEXT        NOT NULL DEFAULT 'owner',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ),

    # ── 3. Add org_id to existing tables ─────────────────────────────────────
    (
        "Add org_id to sessions",
        "ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id)",
    ),
    (
        "Add org_id to chat_sessions",
        "ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id)",
    ),
    (
        "Add org_id to demo_chat_sessions",
        "ALTER TABLE public.demo_chat_sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id)",
    ),

    # ── 4. Indexes ────────────────────────────────────────────────────────────
    (
        "Index: sessions(org_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_org_id ON public.sessions(org_id, created_at DESC)",
    ),
    (
        "Index: chat_sessions(org_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_chat_sessions_org_id ON public.chat_sessions(org_id, created_at DESC)",
    ),
    (
        "Index: profiles(org_id)",
        "CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id)",
    ),

    # ── 5. Enable RLS ─────────────────────────────────────────────────────────
    ("Enable RLS on organizations",    "ALTER TABLE public.organizations    ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on profiles",         "ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on sessions",         "ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on chat_sessions",    "ALTER TABLE public.chat_sessions    ENABLE ROW LEVEL SECURITY"),

    # ── 6. RLS policies (drop-then-create for idempotency) ───────────────────
    ("Drop policy: sessions org_read",         "DROP POLICY IF EXISTS org_read ON public.sessions"),
    (
        "Create policy: sessions org_read",
        """
        CREATE POLICY org_read ON public.sessions
            USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
        """,
    ),
    ("Drop policy: chat_sessions org_read",    "DROP POLICY IF EXISTS org_read ON public.chat_sessions"),
    (
        "Create policy: chat_sessions org_read",
        """
        CREATE POLICY org_read ON public.chat_sessions
            USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
        """,
    ),
    ("Drop policy: profiles self_read",        "DROP POLICY IF EXISTS self_read ON public.profiles"),
    (
        "Create policy: profiles self_read",
        """
        CREATE POLICY self_read ON public.profiles
            USING (
                id = auth.uid()
                OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
            )
        """,
    ),
    ("Drop policy: organizations org_read",    "DROP POLICY IF EXISTS org_read ON public.organizations"),
    (
        "Create policy: organizations org_read",
        """
        CREATE POLICY org_read ON public.organizations
            USING (id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
        """,
    ),

    # ── 7. Trigger: auto-create org + profile on sign-up ─────────────────────
    (
        "Create handle_new_user function",
        """
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
            new_org_id  UUID;
            org_name    TEXT;
            org_slug    TEXT;
        BEGIN
            org_name := COALESCE(
                NEW.raw_user_meta_data->>'company',
                split_part(NEW.email, '@', 2)
            );
            org_slug := lower(regexp_replace(org_name, '[^a-z0-9]', '-', 'g'))
                        || '-'
                        || substr(gen_random_uuid()::TEXT, 1, 8);

            INSERT INTO public.organizations(name, slug, created_by)
            VALUES (org_name, org_slug, NEW.id)
            RETURNING id INTO new_org_id;

            INSERT INTO public.profiles(id, org_id, full_name, avatar_url, role)
            VALUES (
                NEW.id,
                new_org_id,
                COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
                NEW.raw_user_meta_data->>'avatar_url',
                'owner'
            );

            RETURN NEW;
        END;
        $$
        """,
    ),
    (
        "Create on_auth_user_created trigger",
        """
        CREATE OR REPLACE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_user()
        """,
    ),
]


# ── Runner ────────────────────────────────────────────────────────────────────

def _redact(url: str) -> str:
    """Replace password in a connection URL with ***."""
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

    conn: asyncpg.Connection | None = None
    try:
        conn = await asyncpg.connect(database_url, statement_cache_size=0)

        passed = 0
        failed = 0

        for label, sql in _STEPS:
            sql_clean = " ".join(sql.split())  # collapse whitespace for display
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
        if conn:
            await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Aethen auth schema migration.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print steps without executing any SQL.",
    )
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
