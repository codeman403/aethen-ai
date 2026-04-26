"""Trace provider abstraction layer.

Supports dual-mode ingestion:
- SyntheticProvider: generates test traces via generate_traces.py logic
- LangfuseProvider: pulls live traces from Langfuse API
"""

from app.providers.base import TraceProvider
from app.providers.langfuse_provider import LangfuseProvider
from app.providers.synthetic import SyntheticProvider

__all__ = ["TraceProvider", "SyntheticProvider", "LangfuseProvider"]
