"""Aethen-AI Backend — FastAPI application."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.api.health import router as health_router
from app.api.ingest import router as ingest_router
from app.api.qc import router as qc_router
from app.config import settings
from app.services.embedding_service import embedding_service
from app.services.neo4j_service import neo4j_service
from app.services.pinecone_service import pinecone_service

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

    yield

    # Shutdown
    await neo4j_service.close()


app = FastAPI(
    title=settings.app_name,
    description="AI Agent Failure Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(qc_router, prefix="/api")
