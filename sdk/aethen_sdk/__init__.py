"""aethen-sdk — connect your AI agent to Aethen diagnostics in 3 lines.

    from aethen_sdk import AethenClient

    aethen = AethenClient(
        api_url="https://aethen-backend.onrender.com",
        api_key="aethen-team-key",
    )

    # Option A — stored source (credentials registered in Aethen UI)
    report = await aethen.analyze_langfuse_trace("trace-id", source="my-agent")

    # Option B — per-call credentials (never stored by Aethen)
    report = await aethen.analyze_langfuse_trace_direct(
        "trace-id",
        public_key=LANGFUSE_PUBLIC_KEY,
        secret_key=LANGFUSE_SECRET_KEY,
    )

    print(report["root_cause"])
"""

from aethen_sdk.client import AethenClient

__all__ = ["AethenClient"]
__version__ = "0.1.0"
