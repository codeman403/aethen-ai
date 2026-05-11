"""Anti-Aethen configuration — loaded from environment variables only.
Never hardcode credentials here.

Usage:
    export ANTI_AETHEN_TARGET="http://localhost:8000"
    export ANTI_AETHEN_TOKEN="eyJ..."          # JWT for Org A test user
    export ANTI_AETHEN_ORG_B_TOKEN="eyJ..."   # JWT for Org B (isolation tests)
    export ANTI_AETHEN_ADMIN_TOKEN="eyJ..."    # JWT for admin user (optional)
"""

import os

TARGET_URL:    str = os.getenv("ANTI_AETHEN_TARGET",       "http://localhost:8000")
ORG_A_TOKEN:   str = os.getenv("ANTI_AETHEN_TOKEN",        "")
ORG_B_TOKEN:   str = os.getenv("ANTI_AETHEN_ORG_B_TOKEN",  "")
ADMIN_TOKEN:   str = os.getenv("ANTI_AETHEN_ADMIN_TOKEN",  "")

REQUEST_TIMEOUT: float = 15.0   # seconds per request
INGEST_CLEANUP:  bool  = True    # delete test sessions after each attack module

def validate() -> list[str]:
    """Return list of missing required config items."""
    missing = []
    if not TARGET_URL:
        missing.append("ANTI_AETHEN_TARGET")
    if not ORG_A_TOKEN:
        missing.append("ANTI_AETHEN_TOKEN (Org A JWT)")
    return missing
