"""Aethen MCP Server — stdio transport entry point.

Runs as a subprocess that Claude Desktop, Cursor, and other MCP
clients communicate with via stdin/stdout.

Environment variables:
  AETHEN_API_URL   Base URL of the Aethen backend (default: http://localhost:8000)
  AETHEN_API_KEY   Bearer token for authentication (default: empty = open for local dev)

Claude Desktop / Cursor config:
  {
    "mcpServers": {
      "aethen": {
        "command": "poetry",
        "args": ["run", "python", "scripts/run_mcp.py"],
        "cwd": "/path/to/aethen-ai/backend",
        "env": {
          "AETHEN_API_URL": "https://aethen-backend.onrender.com",
          "AETHEN_API_KEY": "aethen-team-key"
        }
      }
    }
  }
"""

import sys
from pathlib import Path

# Ensure the backend directory is on sys.path when run as a script
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.mcp.server import mcp

if __name__ == "__main__":
    mcp.run(transport="stdio")
