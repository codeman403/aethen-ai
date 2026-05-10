"""User profile endpoint.

GET  /api/profile          — return current user's profile + org (creates if missing)
"""

import re
import uuid

import structlog
from fastapi import Request
from fastapi import APIRouter

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service
from app.services.email_service import send_welcome_email

logger = structlog.get_logger()
router = APIRouter(tags=["profile"])


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]", "-", text.lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:48] + "-" + uuid.uuid4().hex[:8]


async def _mark_welcomed(conn, user_id: str) -> None:
    """Set welcomed_at on the profile row."""
    try:
        await conn.execute(
            "UPDATE profiles SET welcomed_at = NOW() WHERE id = $1::uuid AND welcomed_at IS NULL",
            user_id,
        )
    except Exception as exc:
        logger.warning("mark_welcomed_failed", user_id=user_id, error=str(exc))


@router.get("/profile", response_model=ApiResponse[dict])
async def get_profile(request: Request) -> ApiResponse[dict]:
    """Return the current user's profile and org.

    If the profile row doesn't exist (user pre-dates the signup trigger),
    it is created here so the UI never shows an error.
    On first visit (welcomed_at IS NULL), sends a welcome email.
    """
    user_id: str | None = getattr(request.state, "user_id", None)
    if not user_id:
        return ApiResponse(data=None, error="Not authenticated")

    if not postgres_service.is_available:
        return ApiResponse(data=None, error="Database unavailable")

    async with postgres_service._pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.id, p.full_name, p.avatar_url, p.role, p.org_id,
                   p.welcomed_at,
                   o.name AS org_name, o.slug AS org_slug
            FROM profiles p
            LEFT JOIN organizations o ON o.id = p.org_id
            WHERE p.id = $1::uuid
            """,
            user_id,
        )

        if row:
            # Send welcome email on first visit (welcomed_at not yet set)
            if row["welcomed_at"] is None:
                try:
                    auth_row = await conn.fetchrow(
                        "SELECT email FROM auth.users WHERE id = $1::uuid", user_id
                    )
                    if auth_row and auth_row["email"]:
                        await send_welcome_email(auth_row["email"], row["full_name"])
                    await _mark_welcomed(conn, user_id)
                except Exception as exc:
                    logger.warning("welcome_email_check_failed", user_id=user_id, error=str(exc))

            data = dict(row)
            data.pop("welcomed_at", None)
            data["is_admin"] = getattr(request.state, "is_admin", False)
            return ApiResponse(data=data)

        # ── Profile missing — create org + profile (replicates the DB trigger) ──
        logger.info("profile_missing_creating", user_id=user_id)

        auth_row = await conn.fetchrow(
            "SELECT email, raw_user_meta_data FROM auth.users WHERE id = $1::uuid",
            user_id,
        )
        if not auth_row:
            return ApiResponse(data=None, error="Auth user not found")

        email = auth_row["email"] or ""
        meta = auth_row["raw_user_meta_data"] or {}

        org_name = meta.get("company") or email.split("@")[-1] or "My Org"
        org_slug = _slugify(org_name)
        full_name = meta.get("full_name") or email.split("@")[0] or ""
        avatar_url = meta.get("avatar_url") or ""

        org_id = await conn.fetchval(
            "INSERT INTO organizations (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id",
            org_name, org_slug, user_id,
        )

        await conn.execute(
            """
            INSERT INTO profiles (id, org_id, full_name, avatar_url, role, welcomed_at)
            VALUES ($1, $2, $3, $4, 'owner', NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            user_id, org_id, full_name, avatar_url,
        )

        # Start trial for brand-new orgs
        await postgres_service.start_trial(str(org_id))

        # Send welcome email for brand-new users
        if email:
            await send_welcome_email(email, full_name)

        logger.info("profile_created", user_id=user_id, org_id=str(org_id))
        return ApiResponse(data={
            "id": user_id,
            "full_name": full_name,
            "avatar_url": avatar_url,
            "role": "owner",
            "org_id": str(org_id),
            "org_name": org_name,
            "org_slug": org_slug,
            "is_admin": getattr(request.state, "is_admin", False),
        })
