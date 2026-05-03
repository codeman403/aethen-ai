"""Chat session persistence endpoints.

POST   /api/chat/sessions                    — create a new session
GET    /api/chat/sessions                    — list all sessions
GET    /api/chat/sessions/{id}/messages      — load full history for a session
POST   /api/chat/sessions/{id}/messages      — append a message
PATCH  /api/chat/sessions/{id}               — rename a session
"""

import uuid

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service

logger = structlog.get_logger()
router = APIRouter(tags=["chat-sessions"])


## ── Request / Response models ─────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    title: str = "New Session"


class AppendMessageRequest(BaseModel):
    id: str
    role: str               # "user" | "assistant"
    kind: str               # "user" | "assistant" | "analysis"
    content: str = ""
    report: dict | None = None
    latency_ms: float | None = None   # ms from user send → response received (None for user messages)


class PatchSessionRequest(BaseModel):
    title: str


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/chat/sessions", response_model=ApiResponse[dict])
async def create_session(request: CreateSessionRequest) -> ApiResponse[dict]:
    """Create a new chat session."""
    session_id = f"cs-{uuid.uuid4().hex[:12]}"
    session = await postgres_service.create_chat_session(session_id, request.title)
    logger.info("chat_session_created", session_id=session_id)
    return ApiResponse(data=session)


@router.get("/chat/sessions", response_model=ApiResponse[list[dict]])
async def list_sessions() -> ApiResponse[list[dict]]:
    """Return all chat sessions ordered by most recent activity."""
    sessions = await postgres_service.list_chat_sessions()
    return ApiResponse(data=sessions)


@router.get("/chat/sessions/{session_id}/messages", response_model=ApiResponse[list[dict]])
async def get_messages(session_id: str) -> ApiResponse[list[dict]]:
    """Return the full message history for a session."""
    messages = await postgres_service.get_chat_messages(session_id)
    if not messages:
        # Return empty list — session may exist but have no messages yet
        return ApiResponse(data=[])
    return ApiResponse(data=messages)


@router.post("/chat/sessions/{session_id}/messages", response_model=ApiResponse[dict])
async def append_message(session_id: str, request: AppendMessageRequest) -> ApiResponse[dict]:
    """Append a single message to an existing session."""
    await postgres_service.append_chat_message(
        message_id=request.id,
        session_id=session_id,
        role=request.role,
        kind=request.kind,
        content=request.content,
        report=request.report,
        latency_ms=request.latency_ms,
    )
    return ApiResponse(data={"ok": True})


@router.patch("/chat/sessions/{session_id}", response_model=ApiResponse[dict])
async def rename_session(session_id: str, request: PatchSessionRequest) -> ApiResponse[dict]:
    """Rename a chat session."""
    await postgres_service.update_session_title(session_id, request.title)
    logger.info("chat_session_renamed", session_id=session_id, title=request.title)
    return ApiResponse(data={"ok": True})
