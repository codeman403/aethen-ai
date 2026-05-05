"""Eval pipeline endpoints.

POST /api/eval/run     — run eval against golden dataset, return EvalReport
GET  /api/eval/results — latest EvalReport from app_settings
"""

import json
import uuid
from typing import Literal

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.response import ApiResponse, ResponseMetadata
from app.services.postgres_service import postgres_service

router = APIRouter()
logger = structlog.get_logger()

_SETTINGS_KEY = "eval_last_report"
_running = False  # simple in-process guard against concurrent runs


class EvalRunRequest(BaseModel):
    """Request body for POST /api/eval/run."""

    mode: Literal["fast", "full"] = Field(default="fast", description="fast = classify-only; full = complete pipeline + LLM judge")
    limit: int | None = Field(default=None, ge=1, le=100, description="Cap sessions for quick smoke tests")
    push_to_langfuse: bool = Field(default=True, description="Push per-session scores to Langfuse")


@router.post("/eval/run", response_model=ApiResponse[dict])
async def run_eval_endpoint(request: EvalRunRequest) -> ApiResponse[dict]:
    """Run eval pipeline against the golden dataset.

    Fast mode (default): classify-only, keyword synthesis, ~1 LLM call per session.
    Full mode: complete pipeline + LLM-as-judge, requires all services.
    """
    global _running
    if _running:
        raise HTTPException(status_code=409, detail="Eval run already in progress")

    _running = True
    try:
        from app.eval.runner import run_eval

        report = await run_eval(
            mode=request.mode,
            limit=request.limit,
            push_to_langfuse=request.push_to_langfuse,
        )

        report_dict = report.to_dict()

        # Persist latest report in app_settings for GET /api/eval/results
        try:
            await postgres_service.set_setting(_SETTINGS_KEY, json.dumps(report_dict))
        except Exception as exc:
            logger.warning("eval_report_persist_failed", error=str(exc))

        return ApiResponse(
            data=report_dict,
            error=None,
            metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("eval_run_failed", error=str(exc))
        raise HTTPException(status_code=500, detail=f"Eval run failed: {exc}")
    finally:
        _running = False


@router.get("/eval/results", response_model=ApiResponse[dict | None])
async def get_eval_results() -> ApiResponse[dict | None]:
    """Return the latest eval report stored in app_settings."""
    try:
        raw = await postgres_service.get_setting(_SETTINGS_KEY)
        data = json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning("eval_results_fetch_failed", error=str(exc))
        data = None

    return ApiResponse(data=data, error=None, metadata=ResponseMetadata(request_id=str(uuid.uuid4())))
