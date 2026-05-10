"""Onboarding checklist endpoint.

GET /api/onboarding  — returns completion state for each onboarding step

Steps are derived from existing data — no new tables required.
"""

import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.models.response import ApiResponse
from app.services.postgres_service import postgres_service
from app.utils.request_context import get_data_org_id

router = APIRouter(tags=["onboarding"])
logger = structlog.get_logger()


class OnboardingStep(BaseModel):
    id: str
    title: str
    description: str
    href: str
    completed: bool


class OnboardingStatus(BaseModel):
    steps: list[OnboardingStep]
    all_complete: bool
    completed_count: int
    total: int


@router.get("/onboarding", response_model=ApiResponse[OnboardingStatus])
async def get_onboarding(request: Request) -> ApiResponse[OnboardingStatus]:
    """Return onboarding checklist completion for the caller's org."""
    org_id = get_data_org_id(request)

    # Step 1: LLM keys configured — check app_settings for any llm key entry
    llm_configured = False
    # Step 2: At least one session ingested
    has_sessions = False
    # Step 3: At least one analysis run
    has_analysis = False
    # Step 4: Integration (Langfuse or LangSmith) connected
    integration_connected = False

    if postgres_service.is_available and org_id:
        async with postgres_service._pool.acquire() as conn:
            # LLM keys: look for org-scoped llm_config in app_settings
            llm_row = await conn.fetchrow(
                "SELECT 1 FROM app_settings WHERE key LIKE $1 LIMIT 1",
                f"llm_config_{org_id}%",
            )
            llm_configured = llm_row is not None

            # Sessions ingested
            session_count = await conn.fetchval(
                "SELECT COUNT(*) FROM sessions WHERE org_id = $1",
                org_id,
            )
            has_sessions = (session_count or 0) > 0

            # Analysis runs this period
            period = postgres_service._current_period()
            usage_row = await conn.fetchrow(
                "SELECT analysis_runs FROM org_usage WHERE org_id = $1 AND period = $2",
                org_id, period,
            )
            has_analysis = (usage_row["analysis_runs"] if usage_row else 0) > 0

            # Integration: Langfuse or LangSmith credentials set in app_settings
            integration_row = await conn.fetchrow(
                "SELECT 1 FROM app_settings WHERE key LIKE $1 OR key LIKE $2 LIMIT 1",
                f"langfuse_%_{org_id}", f"langsmith_%_{org_id}",
            )
            if not integration_row:
                # Also check for global keys (pre-org setup)
                integration_row = await conn.fetchrow(
                    "SELECT 1 FROM app_settings WHERE key IN ('langfuse_public_key', 'langsmith_api_key') LIMIT 1"
                )
            integration_connected = integration_row is not None

    steps = [
        OnboardingStep(
            id="llm_keys",
            title="Configure LLM Keys",
            description="Add your OpenAI or Anthropic API key to power the analysis pipeline.",
            href="/settings/integrations",
            completed=llm_configured,
        ),
        OnboardingStep(
            id="integration",
            title="Connect a Trace Source",
            description="Link Langfuse or LangSmith to pull your AI agent execution traces.",
            href="/settings/integrations",
            completed=integration_connected,
        ),
        OnboardingStep(
            id="first_session",
            title="Ingest Your First Session",
            description="Use the Pull Traces button on the Overview page to import sessions from Langfuse or LangSmith.",
            href="/overview",
            completed=has_sessions,
        ),
        OnboardingStep(
            id="first_analysis",
            title="Run Your First Analysis",
            description="Open a session in Trace Explorer and click Analyze to diagnose a failure.",
            href="/traces",
            completed=has_analysis,
        ),
    ]

    completed_count = sum(1 for s in steps if s.completed)
    return ApiResponse(data=OnboardingStatus(
        steps=steps,
        all_complete=completed_count == len(steps),
        completed_count=completed_count,
        total=len(steps),
    ))
