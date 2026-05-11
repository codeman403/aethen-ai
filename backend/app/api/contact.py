"""Contact form endpoint — public, no JWT required."""

import re

import structlog
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.email_service import send_contact_email

router = APIRouter(tags=["contact"])
logger = structlog.get_logger()

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class ContactRequest(BaseModel):
    name:    str
    email:   str
    reason:  str = "General inquiry"
    message: str


@router.post("/contact")
async def contact(body: ContactRequest):
    """Receive a contact form submission and forward it via email."""
    if not body.name.strip() or not body.email.strip() or not body.message.strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Name, email and message are required.")

    if not _EMAIL_RE.match(body.email):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid email address.")

    sent = await send_contact_email(
        name=body.name.strip(),
        email=body.email.strip(),
        reason=body.reason.strip(),
        message=body.message.strip(),
    )

    logger.info("contact_form_received", name=body.name, email=body.email, reason=body.reason, sent=sent)
    return {"data": {"ok": True}, "error": None, "metadata": None}
