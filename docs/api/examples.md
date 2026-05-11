# API Examples

---

## Ingest a Session

```bash
curl -X POST https://aethen-ai-backend.onrender.com/api/ingest \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "sessions": [{
      "session_id": "sess-demo-001",
      "agent_id": "customer-support-bot",
      "outcome": "failure",
      "failure_type": "memory",
      "failure_summary": "Returned outdated pricing for enterprise tier",
      "llm_calls": [{
        "call_id": "llm-1",
        "model": "gpt-4o",
        "prompt": "What is the enterprise pricing for Acme SaaS?",
        "response": "Enterprise pricing is $99/month per seat.",
        "tokens_in": 45,
        "tokens_out": 12,
        "latency_ms": 850,
        "hallucination_flag": false,
        "source_documents": ["pricing-standard-v1"]
      }],
      "tool_calls": [],
      "retrieval_events": [{
        "event_id": "ret-1",
        "query": "enterprise pricing Acme SaaS",
        "namespace": "docs",
        "chunks_returned": 3,
        "relevance_scores": [0.72, 0.65, 0.58],
        "metadata_filters": {},
        "expected_doc_ids": ["pricing-enterprise-v2"],
        "actual_doc_ids": ["pricing-standard-v1", "pricing-pro-v1", "pricing-free-v1"],
        "doc_content": ["Standard tier: $29/month per seat...", "Pro tier: $59/month...", ""]
      }],
      "metadata": {}
    }]
  }'
```

Response:
```json
{"data": {"sessions_ingested": 1, "events_processed": 4, "errors": []}}
```

---

## Analyse a Session

```bash
curl -X POST https://aethen-ai-backend.onrender.com/api/chat \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sess-demo-001", "query": "Why did the retrieval fail?"}'
```

Response:
```json
{
  "data": {
    "session_id": "sess-demo-001",
    "failure_type": "memory",
    "summary": "The retrieval system returned standard pricing documentation instead of the enterprise pricing document. Expected doc 'pricing-enterprise-v2' was not retrieved, leading to the agent responding with incorrect pricing information.",
    "root_cause": "Embedding similarity peaked at 0.72 for 'pricing-standard-v1' instead of 'pricing-enterprise-v2', causing the retrieval layer to return the wrong pricing tier, which caused the LLM to quote $99/month instead of the correct enterprise rate.",
    "confidence": 0.67,
    "findings": [
      {
        "title": "Doc ID mismatch: enterprise vs standard pricing",
        "severity": "high",
        "description": "Expected 'pricing-enterprise-v2' but retrieved 'pricing-standard-v1'. The enterprise pricing document was not retrieved.",
        "evidence": [
          "expected_doc_ids: ['pricing-enterprise-v2']",
          "actual_doc_ids: ['pricing-standard-v1', 'pricing-pro-v1', 'pricing-free-v1']"
        ],
        "recommendation": "Re-index 'pricing-enterprise-v2' with updated embeddings. Consider adding metadata filter for pricing tier to the retrieval query."
      }
    ],
    "raw_analysis": "..."
  }
}
```

---

## Run Demo Scenario (Public)

```bash
curl -X POST https://aethen-ai-backend.onrender.com/api/demo/run \
  -H "Content-Type: application/json" \
  -d '{"scenario": "tool_misfire"}'
```

---

## Pull from Langfuse

```bash
curl -X POST https://aethen-ai-backend.onrender.com/api/langfuse/pull \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"source": "my-langfuse-source"}'
```

---

## Python SDK

```python
from aethen_sdk import AethenClient
import asyncio

client = AethenClient(
    api_url="https://aethen-ai-backend.onrender.com",
    api_key="your-api-key"
)

async def main():
    # Analyse a Langfuse trace by ID
    report = await client.analyze_langfuse_trace(
        trace_id="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        source="my-agent"  # name of stored source in Settings → Integrations
    )
    print(f"Failure type: {report['failure_type']}")
    print(f"Confidence: {report['confidence']}")
    for finding in report['findings']:
        print(f"  [{finding['severity'].upper()}] {finding['title']}")
        print(f"    → {finding['recommendation']}")

asyncio.run(main())
```
