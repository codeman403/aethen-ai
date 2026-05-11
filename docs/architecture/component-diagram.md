# Component Diagram

See [system-design.md](system-design.md) for the full system overview and [ARCHITECTURE.md](../../ARCHITECTURE.md) for the LangGraph pipeline Mermaid diagrams.

---

## Backend Components

```mermaid
graph TB
    subgraph "Entry Layer"
        MW["Middleware Stack\n(JWT → SecHeaders → SizeLimit → RateLimit → CORS)"]
        API["FastAPI Routers\n(23 routers)"]
    end

    subgraph "Orchestration"
        AG["analysis_graph\nOptimized LangGraph"]
        FAG["fast_analysis_graph\nDemo LangGraph"]
        LG["_legacy_analysis_graph\nRollback target"]
    end

    subgraph "Nodes"
        CI["classify_intent\nGPT-4o-mini"]
        VR["vector_retrieve\npgvector"]
        GT["graph_traverse\nNeo4j"]
        RR["rerank\nCohere v3"]
        FA["fast_analyze\nClaude Haiku 4.5"]
        CS["compute_confidence\n(deterministic)"]
    end

    subgraph "Services"
        PS["postgres_service\nasyncpg pool"]
        PVS["pgvector_service\nHNSW cosine"]
        N4S["neo4j_service\nasync driver"]
        ES["embedding_service\nOpenAI text-embedding-3-small"]
        LFS["Langfuse\n(push eval scores)"]
        LSS["LangSmith\n(trace pull)"]
    end

    subgraph "Security"
        SANTIZE["strip_injection()\nPrompt injection protection"]
        PII["PII Redactor\nscrubadub"]
        CRYPT["credential_crypto\nFernet encryption"]
    end

    MW --> API
    API --> AG & FAG
    AG --> CI & VR & GT & RR & FA
    FA --> CS
    VR --> PVS
    GT --> N4S
    PVS & PS --> ES
    API --> PS
    API --> LFS & LSS
    VR & FA --> SANTIZE
    API --> PII & CRYPT
```

---

## Frontend Components

```mermaid
graph TB
    subgraph "App Router"
        PUB["(public)\nLanding, Demo Agent, Legal"]
        DASH["(dashboard)\nAuthenticated UI"]
        AUTH["auth/callback\nSupabase OAuth"]
        CRON["api/cron/\npull-langfuse, pull-langsmith, digest"]
    end

    subgraph "Dashboard Pages"
        OV["overview"]
        TR["traces"]
        CH["chat"]
        MD["memory-debug"]
        TM["tool-misfire"]
        HR["hallucination-rca"]
        BS["blind-spots"]
        DQ["data-quality"]
        ST["settings/*"]
    end

    subgraph "Components"
        SB["Sidebar\n(navigation)"]
        HD["Header\n(notifications)"]
        CP["CommandPalette\n(Cmd+K)"]
        SL["SessionsList"]
        AM["AnalysisMetrics"]
        AP["AnimatedPipeline"]
    end

    DASH --> OV & TR & CH & MD & TM & HR & BS & DQ & ST
    DASH --> SB & HD & CP
    TR --> SL
    CH --> AM & AP
```
