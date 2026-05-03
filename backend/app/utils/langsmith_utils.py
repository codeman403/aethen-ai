"""LangSmith callback handler factory for LangChain tracing."""

import structlog

from app.config import settings

logger = structlog.get_logger()


def make_langsmith_handler():
    """Return a LangChainTracer configured for LangSmith, or None if not configured.

    Returns:
        tracer: LangChainTracer instance, or None if LANGSMITH_API_KEY not set.
    """
    if not settings.langsmith_api_key:
        logger.debug("langsmith_handler_skipped", reason="LANGSMITH_API_KEY not set")
        return None

    try:
        from langchain_core.tracers.langchain import LangChainTracer
        from langsmith import Client

        client = Client(
            api_key=settings.langsmith_api_key,
            api_url=settings.langsmith_endpoint,
        )
        tracer = LangChainTracer(
            project_name=settings.langsmith_project,
            client=client,
        )
        logger.info("langsmith_handler_created", project=settings.langsmith_project)
        return tracer
    except Exception as exc:
        logger.warning("langsmith_handler_failed", error=str(exc))
        return None
