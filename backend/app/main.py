"""Aethen-AI Backend — FastAPI application."""

import os

# Disable LangSmith auto-tracing BEFORE any LangChain imports.
# Auto-tracing floods LangSmith with every internal Aethen pipeline call
# (LangGraph nodes, analysis, classify, synthesize).
# Aethen uses explicit LangChainTracer callbacks only — those still work
# regardless of this setting.
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.analyze_raw import router as analyze_raw_router
from app.api.api_key import router as api_key_router
from app.api.chat import router as chat_router
from app.api.eval import router as eval_router
from app.api.sources import router as sources_router
from app.api.model_settings import router as model_settings_router
from app.api.chat_sessions import router as chat_sessions_router
from app.api.demo import router as demo_router
from app.api.health import router as health_router
from app.api.ingest import router as ingest_router
from app.api.langfuse import router as langfuse_router
from app.api.langsmith import router as langsmith_router
from app.api.qc import router as qc_router
from app.api.sessions import router as sessions_router
from app.api.stats import router as stats_router
from app.config import settings
from app.services.embedding_service import embedding_service
from app.services.neo4j_service import neo4j_service
from app.services.pinecone_service import pinecone_service
from app.services.postgres_service import postgres_service
from app.utils.rate_limit import RateLimitMiddleware

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if settings.debug else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(settings.log_level),
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown events."""
    logger.info("aethen_backend_started", version="0.1.0")

    # Initialize services (graceful — missing credentials are warnings, not errors)
    await embedding_service.initialize()
    await pinecone_service.initialize()
    await neo4j_service.initialize()
    await postgres_service.initialize()

    # Seed LLM model cache from Postgres (persisted selections survive restarts)
    try:
        from app.agents.llm import set_active_model
        for role, key in [
            ("analysis",  "model_analysis"),
            ("synthesis", "model_synthesis"),
            ("demo",      "model_demo"),
        ]:
            stored = await postgres_service.get_setting(key)
            if stored:
                set_active_model(role, stored)
        # langsmith_last_pull_at is read per-request — no seeding needed
    except Exception as exc:
        logger.warning("model_cache_seed_failed", error=str(exc))

    yield

    # Shutdown
    await neo4j_service.close()
    await postgres_service.close()


app = FastAPI(
    title=settings.app_name,
    description="AI Agent Failure Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# API key middleware — logs Bearer token, does not enforce (single-tenant stub).
# Validates Bearer token against stored SHA-256 hash.
# Open when no key is configured (local dev / fresh install).
# When a key IS configured, all /api/* requests must include it.
class ApiKeyMiddleware(BaseHTTPMiddleware):
    _OPEN_PATHS = {"/api/health", "/api/settings/api-key"}

    async def dispatch(self, request: Request, call_next):
        # Skip auth for health check and key management itself
        if request.url.path in self._OPEN_PATHS or not request.url.path.startswith("/api"):
            return await call_next(request)

        key = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if key:
            logger.info("api_key_received", key_prefix=key[:8] + "...")

        from app.api.api_key import validate_api_key
        if not await validate_api_key(key):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or missing API key", "data": None, "metadata": None},
            )

        return await call_next(request)

app.add_middleware(ApiKeyMiddleware)

# Rate limiting — applied before CORS so it fires first
app.add_middleware(RateLimitMiddleware, per_minute=100, per_hour=1000)

# CORS — allow configured frontend + any Vercel preview deployments
_cors_origins = [settings.frontend_url]
if settings.frontend_url != "http://localhost:3000":
    # Also allow localhost for local dev when a production URL is set
    _cors_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(chat_sessions_router, prefix="/api")
app.include_router(qc_router, prefix="/api")
app.include_router(demo_router, prefix="/api")
app.include_router(langfuse_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(model_settings_router, prefix="/api")
app.include_router(langsmith_router, prefix="/api")
app.include_router(eval_router, prefix="/api")
app.include_router(sources_router, prefix="/api")
app.include_router(analyze_raw_router, prefix="/api")
app.include_router(api_key_router, prefix="/api")
