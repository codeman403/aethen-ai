# Skills — Reusable Patterns for Aethen-AI

> **Created**: 2026-04-24 (Session 4)
> **Purpose**: Auto-triggered skill files capturing recurring patterns extracted from the 4 functional diagnostic modules.

---

## Directory Structure

```
skills/
├── README.md                  ← This file
├── langgraph_patterns.md      ← State machine & node patterns
├── neo4j_cypher_patterns.md   ← Graph traversal queries
└── pinecone_patterns.md       ← Embedding & ingestion flows
```

## When to Use

Reference these files when:
- Building new analysis modules or extending existing ones
- Writing Neo4j queries for cross-trace reasoning
- Adding new ingestion flows or embedding strategies
- Onboarding new AI agents to the codebase

## How to Update

When you discover a new reusable pattern during development:
1. Add it to the appropriate skill file
2. Include a brief description, code example, and which module uses it
3. Note any gotchas or edge cases
