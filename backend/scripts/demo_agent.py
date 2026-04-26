"""Demo LangChain agent instrumented with Langfuse for live trace generation.

Usage:
    cd backend
    python -m scripts.demo_agent

This script runs a simple LangChain agent that performs various operations
(search, retrieval, tool calls) and sends traces to Langfuse. These traces
can then be pulled into Aethen via the /api/langfuse/pull endpoint.

Requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL in .env.
"""

import os
import random
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(".env", override=True)


def get_langfuse_handler():
    """Create a Langfuse callback handler for LangChain."""
    try:
        from langfuse import Langfuse
        from langfuse.langchain import CallbackHandler

        # Langfuse SDK reads LANGFUSE_HOST; map LANGFUSE_BASE_URL if needed
        if not os.getenv("LANGFUSE_HOST") and os.getenv("LANGFUSE_BASE_URL"):
            os.environ["LANGFUSE_HOST"] = os.environ["LANGFUSE_BASE_URL"]

        client = Langfuse(
            public_key=os.getenv("LANGFUSE_PUBLIC_KEY", ""),
            secret_key=os.getenv("LANGFUSE_SECRET_KEY", ""),
            host=os.getenv("LANGFUSE_HOST", "https://us.cloud.langfuse.com"),
        )

        return CallbackHandler(), client
    except ImportError:
        print("Error: langfuse package not installed. Run: pip install langfuse")
        sys.exit(1)


def run_demo_scenarios():
    """Run demo agent scenarios that produce traces in Langfuse."""
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    handler, langfuse_client = get_langfuse_handler()

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        base_url=os.getenv("OPENAI_BASE_URL", None),
        api_key=os.getenv("OPENAI_API_KEY", ""),
        default_headers={"x-session-id": os.getenv("SESSION_ID", "demo-session")},
    )

    scenarios = [
        {
            "name": "Memory retrieval failure",
            "messages": [
                SystemMessage(content="You are a support agent. Help the user with their billing issue."),
                HumanMessage(content="I can't reset my billing password. The retrieval system returned wrong documents about API keys instead of billing procedures."),
            ],
            "tags": ["memory", "retrieval-failure"],
        },
        {
            "name": "Tool misfire",
            "messages": [
                SystemMessage(content="You are a data assistant. Use available tools to help users."),
                HumanMessage(content="Please update my user profile. The update_user_record tool returned a PermissionError: insufficient privileges."),
            ],
            "tags": ["tool_misfire", "permission-error"],
        },
        {
            "name": "Hallucination scenario",
            "messages": [
                SystemMessage(content="You are a technical assistant. Only use verified information."),
                HumanMessage(content="Explain how quantum encryption works for password resets. Note: there is no such thing as quantum encryption for passwords."),
            ],
            "tags": ["hallucination", "factual-error"],
        },
        {
            "name": "Blind spot - knowledge gap",
            "messages": [
                SystemMessage(content="You are a knowledge base assistant."),
                HumanMessage(content="How do I configure the experimental Zephyr module? The knowledge base returned 0 results for this query."),
            ],
            "tags": ["blind_spot", "knowledge-gap"],
        },
    ]

    print(f"Running {len(scenarios)} demo scenarios with Langfuse tracing...\n")

    for i, scenario in enumerate(scenarios, 1):
        print(f"  [{i}/{len(scenarios)}] {scenario['name']}...")

        try:
            response = llm.invoke(
                scenario["messages"],
                config={
                    "callbacks": [handler],
                    "tags": scenario["tags"],
                    "run_name": f"demo-{scenario['name'].lower().replace(' ', '-')}",
                    "metadata": {"tags": scenario["tags"], "scenario": scenario["name"]},
                },
            )
            print(f"    ✅ Response: {response.content[:80]}...")
        except Exception as e:
            print(f"    ❌ Error: {e}")

    # Flush traces to Langfuse
    try:
        langfuse_client.flush()
        print("\n✅ All traces flushed to Langfuse successfully!")
        print(f"   View at: {os.getenv('LANGFUSE_BASE_URL', 'https://us.cloud.langfuse.com')}")
    except Exception as e:
        print(f"\n⚠️  Flush warning: {e}")

    print("\nNext steps:")
    print("  1. Check traces in Langfuse dashboard")
    print("  2. Pull into Aethen: POST /api/langfuse/pull {\"limit\": 10}")


if __name__ == "__main__":
    run_demo_scenarios()
