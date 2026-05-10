"""Request context helpers — extract auth state from request.state safely."""

from fastapi import Request

# Sentinel UUID used as org_id when a non-admin user has no org yet.
# This UUID matches no rows in the database, so queries return empty results
# rather than accidentally exposing another tenant's data.
_NO_ORG_SENTINEL = "00000000-0000-0000-0000-000000000000"


def get_data_org_id(request: Request) -> str | None:
    """Return the org_id to use for READ scoping.

    - Admin users  → None  (no filter — sees all data)
    - Regular users with org → their org_id UUID string
    - Regular users without org → sentinel UUID (returns empty results)
    """
    is_admin: bool = getattr(request.state, "is_admin", False)
    if is_admin:
        return None

    org_id: str | None = getattr(request.state, "org_id", None)
    return org_id or _NO_ORG_SENTINEL


def get_actor_org_id(request: Request) -> str | None:
    """Return the org_id to tag WRITES with (ingestion, analysis, usage counters).

    Unlike get_data_org_id, this returns the admin's own org_id rather than None,
    so admin-initiated writes are attributed to their org and appear in org stats.

    - All users (including admins) → their org_id UUID string, or None if unresolvable
    """
    org_id: str | None = getattr(request.state, "org_id", None)
    return org_id or None
