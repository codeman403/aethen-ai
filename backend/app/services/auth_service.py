"""Auth service — user and organization provisioning helpers."""

import structlog

logger = structlog.get_logger()


async def get_user_org_id(user_id: str) -> str | None:
    """Return the org_id for a user, or None if the profile row doesn't exist yet.

    The profile/org are created by the Supabase DB trigger (handle_new_user)
    on first sign-up. This is a read-only cache lookup for the middleware.
    """
    from app.services.postgres_service import postgres_service
    return await postgres_service.get_user_org_id(user_id)
