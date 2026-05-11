# Project Structure

```
aethen-ai/
├── frontend/                          # Next.js 16.2 App Router (Vercel)
├── backend/                           # Python FastAPI backend (Render / Docker)
├── sdk/                               # Python SDK for external integrations
├── docs/                              # Documentation hierarchy
├── skills/                            # Agent coding pattern references
├── rules/                             # Coding conventions (frontend, backend, git, testing)
├── .github/workflows/                 # CI + smoke test + rollback
├── ARCHITECTURE.md                    # System design, diagrams, trade-offs
├── CLAUDE.md                          # AI agent context (dev tooling)
├── CONTRIBUTING.md                    # Contribution guide
├── DEPLOYMENT.md                      # Deployment instructions
├── EVALUATION.md                      # Eval methodology + results
├── LICENSE                            # MIT
├── README.md                          # Project overview (this file)
├── ROADMAP.md                         # Feature roadmap
├── SECURITY.md                        # Security policy
├── TESTING.md                         # Testing guide
└── .env.example                       # Environment variable template
```

---

## `frontend/`

```
frontend/
├── src/
│   ├── app/
│   │   ├── (dashboard)/               # Authenticated dashboard routes (route group)
│   │   │   ├── admin/                 # Admin panel
│   │   │   ├── blind-spots/           # Blind Spot Detector module view
│   │   │   ├── chat/                  # Chat Debug interface
│   │   │   ├── data-quality/          # QC report viewer
│   │   │   ├── hallucination-rca/     # Hallucination RCA module view
│   │   │   ├── memory-debug/          # Memory Debug module view
│   │   │   ├── overview/              # Main dashboard
│   │   │   ├── settings/              # Settings (api-key, integrations, profile, etc.)
│   │   │   ├── timeline/              # Session timeline
│   │   │   ├── tool-misfire/          # Tool Misfire module view
│   │   │   ├── traces/                # Trace Explorer
│   │   │   └── layout.tsx             # Dashboard shell (sidebar + header)
│   │   ├── (public)/                  # Unauthenticated pages
│   │   │   ├── demo-agent/            # Public demo agent page
│   │   │   ├── privacy/               # Privacy policy
│   │   │   ├── support/               # Support page
│   │   │   └── terms/                 # Terms of service
│   │   ├── api/
│   │   │   └── cron/                  # Vercel cron jobs
│   │   │       ├── digest/            # Daily failure digest (07:00 UTC)
│   │   │       ├── pull-langfuse/     # Daily Langfuse trace pull (00:00 UTC)
│   │   │       └── pull-langsmith/    # Daily LangSmith trace pull (00:00 UTC)
│   │   ├── auth/callback/             # Supabase OAuth callback handler
│   │   ├── login/                     # Login page
│   │   ├── forgot-password/           # Password reset flow
│   │   └── page.tsx                   # Landing page
│   ├── components/
│   │   ├── features/                  # Feature-specific components
│   │   │   ├── analysis/              # AnalysisMetrics display
│   │   │   ├── AnimatedPipeline.tsx   # LangGraph pipeline animation
│   │   │   ├── SessionsList.tsx       # Sessions list with status indicators
│   │   │   └── SessionContext.tsx     # Session context provider
│   │   ├── layout/                    # Shell components
│   │   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   │   ├── Header.tsx             # Top header with notifications
│   │   │   ├── CommandPalette.tsx     # Cmd+K command palette
│   │   │   └── SearchBar.tsx          # Global search
│   │   └── ui/                        # Primitive UI components (shadcn/ui based)
│   │       ├── ai-loader.tsx          # Analysis in-progress loader
│   │       ├── pipeline-animation.tsx # Pipeline progress visualization
│   │       └── ...
│   └── hooks/                         # Custom React hooks
├── middleware.ts                       # Next.js middleware (auth route protection)
├── next.config.ts                      # Next.js configuration
├── vercel.json                         # Vercel cron schedule configuration
├── vitest.config.ts                    # Vitest test configuration
└── package.json                        # Dependencies (pnpm)
```

---

## `backend/`

```
backend/
├── app/
│   ├── agents/
│   │   ├── graph.py                   # 3 compiled LangGraph singletons
│   │   ├── llm.py                     # LLM factory + per-org credential context
│   │   ├── state.py                   # AgentState TypedDict + AnalysisReport model
│   │   └── nodes/
│   │       ├── classify.py            # Intent classification (GPT-4o-mini)
│   │       ├── retrieve.py            # vector_retrieve + graph_traverse nodes
│   │       ├── rerank.py              # Cohere Rerank v3
│   │       ├── fast_analyze.py        # Combined analysis+synthesis (Claude Haiku 4.5)
│   │       ├── memory_debug.py        # Memory failure analysis module
│   │       ├── tool_debug.py          # Tool misfire analysis module
│   │       ├── hallucination_rca.py   # Hallucination root-cause module
│   │       ├── blind_spot.py          # Blind spot detection (Graph RAG)
│   │       ├── synthesize.py          # Legacy synthesis node (not in production graph)
│   │       ├── confidence.py          # Deterministic confidence scorer
│   │       └── diagnostic_utils.py    # Shared utilities for analysis nodes
│   ├── api/                           # FastAPI route handlers (23 routers)
│   │   ├── chat.py                    # Main analysis endpoint (POST /api/chat)
│   │   ├── ingest.py                  # Trace ingestion (POST /api/ingest)
│   │   ├── sessions.py                # Session CRUD (GET /api/sessions)
│   │   ├── stats.py                   # Dashboard stats (GET /api/stats)
│   │   ├── langfuse.py                # Langfuse trace pull + health
│   │   ├── langsmith.py               # LangSmith trace import
│   │   ├── demo.py                    # Demo agent endpoints (public)
│   │   ├── eval.py                    # Evaluation pipeline trigger
│   │   ├── qc.py                      # Data quality check reports
│   │   ├── model_settings.py          # Model configuration CRUD
│   │   ├── llm_keys.py                # Per-org LLM credential management
│   │   ├── analyze_raw.py             # Raw trace JSON analysis
│   │   ├── sources.py                 # Observability source management
│   │   ├── usage.py                   # Token + request usage stats
│   │   ├── admin.py                   # Admin cross-org operations
│   │   ├── backfill.py                # Embedding backfill for existing sessions
│   │   ├── webhooks.py                # Webhook configuration
│   │   ├── digest.py                  # Weekly failure digest
│   │   ├── chat_sessions.py           # Chat conversation history
│   │   ├── profile.py                 # User profile management
│   │   ├── api_key.py                 # External API key management
│   │   ├── onboarding.py              # User onboarding state
│   │   └── health.py                  # Health check
│   ├── eval/
│   │   ├── runner.py                  # Eval pipeline orchestrator (fast + full modes)
│   │   ├── metrics.py                 # Classification, retrieval, synthesis metrics
│   │   └── langfuse_eval.py           # Langfuse score push integration
│   ├── middleware/
│   │   ├── auth.py                    # JWT verification (Supabase Auth API, 60 s cache)
│   │   └── pii_redactor.py            # PII redaction middleware
│   ├── mcp/
│   │   ├── server.py                  # MCP server (exposes Aethen tools)
│   │   └── client.py                  # MCP client
│   ├── models/
│   │   ├── trace.py                   # Session, LLMCall, ToolCall, RetrievalEvent, FailureType
│   │   └── response.py                # API response envelope { data, error, metadata }
│   ├── providers/
│   │   ├── langfuse_provider.py       # Langfuse → Session adapter
│   │   ├── langsmith_provider.py      # LangSmith → Session adapter
│   │   ├── synthetic.py               # Synthetic trace generator (for demos/tests)
│   │   └── base.py                    # Provider abstract base class
│   ├── services/
│   │   ├── postgres_service.py        # Async connection pool + session CRUD
│   │   ├── pgvector_service.py        # pgvector embed + similarity search
│   │   ├── neo4j_service.py           # Neo4j async driver + graph operations
│   │   ├── embedding_service.py       # OpenAI text-embedding-3-small (batched)
│   │   ├── vector_service.py          # Router: pgvector (default)
│   │   ├── auth_service.py            # Supabase auth helpers
│   │   ├── llm_key_service.py         # Per-org credential encryption/decryption
│   │   └── email_service.py           # Resend email client
│   ├── utils/
│   │   ├── sanitize.py                # strip_injection() — prompt injection protection
│   │   ├── rate_limit.py              # In-memory rate limiting middleware
│   │   ├── body_size_limit.py         # Request body size enforcement (1 MB)
│   │   ├── security_headers.py        # X-Frame-Options, CSP, HSTS headers
│   │   ├── credential_crypto.py       # Fernet encryption for LLM keys
│   │   ├── request_context.py         # get_data_org_id() helper
│   │   ├── langfuse_utils.py          # Langfuse client helpers
│   │   └── langsmith_utils.py         # LangSmith client helpers
│   ├── config.py                      # Pydantic Settings (all env vars)
│   └── main.py                        # FastAPI app creation + middleware + routers
├── data/
│   └── eval_dataset.json              # Golden dataset for evaluation
├── scripts/
│   ├── generate_eval_dataset.py       # Generate golden eval dataset
│   ├── generate_traces.py             # Generate synthetic traces
│   ├── generate_adversarial_traces.py # Generate adversarial test traces
│   ├── run_eval.py                    # CLI eval runner
│   ├── seed_neo4j.py                  # Neo4j initial data seeding
│   ├── migrate_to_pgvector.py         # Migration from Pinecone to pgvector
│   ├── sync_neo4j_from_postgres.py    # Re-sync Neo4j from Postgres sessions
│   ├── verify_pgvector.py             # pgvector health verification
│   ├── reset_and_reseed.py            # Full reset + reseed for local dev
│   └── run_mcp.py                     # Launch MCP server
├── tests/                             # pytest test suite (25 files)
├── Dockerfile                         # Production Docker image (python:3.11-slim)
├── render.yaml                        # Render deployment blueprint
├── pyproject.toml                     # Poetry dependencies + tool config
└── requirements.txt                   # Flat requirements for Docker pip install
```

---

## `sdk/`

```
sdk/
├── aethen_sdk/
│   ├── __init__.py
│   └── client.py          # AethenClient — async HTTP client, retry logic
└── pyproject.toml
```

**Usage:**
```python
from aethen_sdk import AethenClient

client = AethenClient(api_url="https://aethen-ai-backend.onrender.com", api_key="...")
report = await client.analyze_langfuse_trace(trace_id, source="my-agent")
```

---

## `docs/`

```
docs/
├── architecture/          # Detailed architecture documentation
├── agents/                # LangGraph agent documentation
├── api/                   # API reference documentation
├── deployment/            # Deployment guides
├── evaluation/            # Evaluation methodology + results
├── future/                # Roadmap + technical debt
├── product/               # Product vision + use cases
├── rag/                   # RAG pipeline documentation
├── reference/             # Requirement traceability matrix
├── security/              # Security documentation
├── testing/               # Testing guides
├── troubleshooting/       # Common issues + solutions
├── DEMO_GUIDE.md          # Guide for Demo
```
