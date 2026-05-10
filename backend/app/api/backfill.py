"""Async backfill endpoint — bulk-import historical traces from Langfuse / LangSmith.

Unlike the incremental pull (which fetches only new traces since the last watermark),
backfill pages through ALL historical traces and stores them raw, skipping the
expensive LangGraph analysis pipeline. Analysis can be triggered on demand later.

Endpoints:
  POST  /api/backfill        — start a backfill job, returns job_id immediately
  GET   /api/backfill/{id}   — poll job progress
  DELETE /api/backfill/{id}  — cancel a running job

Jobs are kept in memory for 2 hours then auto-purged.
"""

import asyncio
import time
import uuid
from datetime import UTC, datetime
from enum import StrEnum

import structlog
from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel, Field

from app.models.response import ApiResponse, ResponseMetadata
from app.services.postgres_service import postgres_service
from app.services.pinecone_service import pinecone_service
from app.services.neo4j_service import neo4j_service
from app.utils.request_context import get_data_org_id

logger = structlog.get_logger()
router = APIRouter(tags=["backfill"])

# ── Job store ──────────────────────────────────────────────────────────────────

_JOB_TTL = 7200  # 2 hours
_CHUNK   = 200   # traces per page


class JobStatus(StrEnum):
    PENDING    = "pending"
    RUNNING    = "running"
    COMPLETED  = "completed"
    CANCELLED  = "cancelled"
    FAILED     = "failed"


class BackfillJob:
    def __init__(self, job_id: str, provider: str, source_name: str, org_id: str | None):
        self.job_id      = job_id
        self.provider    = provider
        self.source_name = source_name
        self.org_id      = org_id
        self.status      = JobStatus.PENDING
        self.fetched     = 0
        self.stored      = 0
        self.skipped     = 0
        self.errors: list[str] = []
        self.started_at: float | None = None
        self.finished_at: float | None = None
        self._cancel     = False
        self._expires    = time.monotonic() + _JOB_TTL

    def to_dict(self) -> dict:
        elapsed = None
        if self.started_at:
            end = self.finished_at or time.time()
            elapsed = round(end - self.started_at, 1)
        return {
            "job_id":      self.job_id,
            "provider":    self.provider,
            "source_name": self.source_name,
            "status":      self.status,
            "fetched":     self.fetched,
            "stored":      self.stored,
            "skipped":     self.skipped,
            "errors":      self.errors[-10:],   # last 10 errors only
            "elapsed_s":   elapsed,
            "started_at":  self.started_at,
            "finished_at": self.finished_at,
        }


_JOBS: dict[str, BackfillJob] = {}


def _purge_expired() -> None:
    now = time.monotonic()
    stale = [k for k, v in _JOBS.items() if v._expires < now]
    for k in stale:
        del _JOBS[k]


# ── Background worker ──────────────────────────────────────────────────────────

async def _run_backfill(job: BackfillJob) -> None:
    """Page through all historical traces and store them raw (no analysis)."""
    job.status     = JobStatus.RUNNING
    job.started_at = time.time()
    logger.info("backfill_started", job_id=job.job_id, provider=job.provider, source=job.source_name)

    try:
        if job.provider == "langfuse":
            await _backfill_langfuse(job)
        elif job.provider == "langsmith":
            await _backfill_langsmith(job)
        else:
            raise ValueError(f"Unknown provider: {job.provider}")

        if job._cancel:
            job.status = JobStatus.CANCELLED
        else:
            job.status = JobStatus.COMPLETED
    except Exception as exc:
        job.status = JobStatus.FAILED
        job.errors.append(f"Fatal: {str(exc)[:200]}")
        logger.error("backfill_failed", job_id=job.job_id, error=str(exc))
    finally:
        job.finished_at = time.time()
        logger.info("backfill_finished", job_id=job.job_id, status=job.status,
                    stored=job.stored, skipped=job.skipped, errors=len(job.errors))


async def _backfill_langfuse(job: BackfillJob) -> None:
    from app.providers.langfuse_provider import LangfuseProvider
    from app.services.llm_key_service import get_config
    from app.middleware.pii_redactor import redact_session

    # Resolve provider credentials
    provider_obj = await _get_langfuse_provider(job)
    if not provider_obj:
        raise RuntimeError("No Langfuse source configured for this organisation")

    page = 1
    while not job._cancel:
        try:
            sessions = await provider_obj.fetch_traces(limit=_CHUNK, since=None)
        except Exception as exc:
            job.errors.append(f"Page {page} fetch error: {str(exc)[:100]}")
            logger.warning("backfill_langfuse_page_error", page=page, error=str(exc))
            break

        if not sessions:
            break

        job.fetched += len(sessions)
        for session in sessions:
            if job._cancel:
                break
            try:
                session = redact_session(session)
                is_new = await postgres_service.save_session(session, org_id=job.org_id)
                if is_new:
                    job.stored += 1
                    # Store in vector DB and graph (fire-and-forget, no analysis)
                    if pinecone_service.is_available:
                        try:
                            await pinecone_service.upsert_session(session)
                        except Exception:
                            pass
                    if neo4j_service.is_available:
                        try:
                            await neo4j_service.create_session_node(session)
                        except Exception:
                            pass
                else:
                    job.skipped += 1
            except Exception as exc:
                job.errors.append(f"Session {session.session_id}: {str(exc)[:80]}")

        # Yield control — avoid starving the event loop
        await asyncio.sleep(0)

        if len(sessions) < _CHUNK:
            break  # last page
        page += 1

    if neo4j_service.is_available and job.stored > 0:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception:
            pass


async def _backfill_langsmith(job: BackfillJob) -> None:
    from app.providers.langsmith_provider import LangSmithProvider
    from app.middleware.pii_redactor import redact_session
    from app.config import settings

    # Resolve credentials
    provider_obj = await _get_langsmith_provider(job)
    if not provider_obj:
        raise RuntimeError("No LangSmith source configured for this organisation")

    offset = 0
    while not job._cancel:
        try:
            sessions = await provider_obj.fetch_traces(limit=_CHUNK, since=None)
        except Exception as exc:
            job.errors.append(f"Batch {offset} fetch error: {str(exc)[:100]}")
            break

        if not sessions:
            break

        job.fetched += len(sessions)
        for session in sessions:
            if job._cancel:
                break
            try:
                session = redact_session(session)
                is_new = await postgres_service.save_session(session, org_id=job.org_id)
                if is_new:
                    job.stored += 1
                    if pinecone_service.is_available:
                        try:
                            await pinecone_service.upsert_session(session)
                        except Exception:
                            pass
                    if neo4j_service.is_available:
                        try:
                            await neo4j_service.create_session_node(session)
                        except Exception:
                            pass
                else:
                    job.skipped += 1
            except Exception as exc:
                job.errors.append(f"Session {session.session_id}: {str(exc)[:80]}")

        await asyncio.sleep(0)

        if len(sessions) < _CHUNK:
            break
        offset += _CHUNK

    if neo4j_service.is_available and job.stored > 0:
        try:
            await neo4j_service.link_failure_patterns()
        except Exception:
            pass


# ── Credential helpers ─────────────────────────────────────────────────────────

async def _get_langfuse_provider(job: BackfillJob):
    from app.providers.langfuse_provider import LangfuseProvider
    from app.services.llm_key_service import get_config
    from app.api.sources import list_all_sources
    from app.config import settings

    # Try org-specific sources first
    org_sources = await list_all_sources(org_id=job.org_id)
    lf_sources = [s for s in org_sources if s.get("provider") == "langfuse"]
    if lf_sources:
        src = lf_sources[0]
        return LangfuseProvider(
            public_key=src["public_key"],
            secret_key=src["secret_key"],
            host=src.get("base_url") or settings.langfuse_base_url,
        )
    # Admin fallback: env vars
    if not job.org_id and settings.langfuse_public_key and settings.langfuse_secret_key:
        return LangfuseProvider(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_base_url,
        )
    return None


async def _get_langsmith_provider(job: BackfillJob):
    from app.providers.langsmith_provider import LangSmithProvider
    from app.api.sources import list_all_sources
    from app.config import settings

    org_sources = await list_all_sources(org_id=job.org_id)
    ls_sources = [s for s in org_sources if s.get("provider") == "langsmith"]
    if ls_sources:
        src = ls_sources[0]
        return LangSmithProvider(
            api_key=src["secret_key"],
            endpoint=settings.langsmith_endpoint,
            project_name=settings.langsmith_project,
        )
    if not job.org_id and settings.langsmith_api_key:
        return LangSmithProvider(
            api_key=settings.langsmith_api_key,
            endpoint=settings.langsmith_endpoint,
            project_name=settings.langsmith_project,
        )
    return None


# ── Request / response models ──────────────────────────────────────────────────

class StartBackfillRequest(BaseModel):
    provider:    str = Field(description="'langfuse' or 'langsmith'")
    source_name: str = Field(default="default", description="Registered source name or 'default'")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/backfill", response_model=ApiResponse[dict])
async def start_backfill(
    body: StartBackfillRequest,
    background_tasks: BackgroundTasks,
    request: Request,
) -> ApiResponse[dict]:
    """Start an async backfill job. Returns immediately with a job_id to poll."""
    _purge_expired()

    if body.provider not in ("langfuse", "langsmith"):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="provider must be 'langfuse' or 'langsmith'")

    org_id = get_data_org_id(request)
    job_id = f"bf-{uuid.uuid4().hex[:12]}"
    job = BackfillJob(job_id=job_id, provider=body.provider,
                      source_name=body.source_name, org_id=org_id)
    _JOBS[job_id] = job

    background_tasks.add_task(_run_backfill, job)
    logger.info("backfill_job_created", job_id=job_id, provider=body.provider, org_id=org_id)

    return ApiResponse(
        data={"job_id": job_id, "status": JobStatus.PENDING},
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


def _get_job_for_caller(job_id: str, org_id: str | None):
    """Return the job if it exists and belongs to the caller's org, else raise 404."""
    from fastapi import HTTPException
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found or expired")
    if org_id and job.org_id and job.org_id != org_id:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found or expired")
    return job


@router.get("/backfill/{job_id}", response_model=ApiResponse[dict])
async def get_backfill_status(job_id: str, request: Request) -> ApiResponse[dict]:
    """Poll a backfill job's progress."""
    org_id = get_data_org_id(request)
    job = _get_job_for_caller(job_id, org_id)
    return ApiResponse(
        data=job.to_dict(),
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )


@router.delete("/backfill/{job_id}", response_model=ApiResponse[dict])
async def cancel_backfill(job_id: str, request: Request) -> ApiResponse[dict]:
    """Signal a running backfill job to stop after the current chunk."""
    org_id = get_data_org_id(request)
    job = _get_job_for_caller(job_id, org_id)
    if job.status == JobStatus.RUNNING:
        job._cancel = True
        logger.info("backfill_cancel_requested", job_id=job_id)
    return ApiResponse(
        data={"job_id": job_id, "cancelled": True},
        metadata=ResponseMetadata(request_id=str(uuid.uuid4())),
    )
