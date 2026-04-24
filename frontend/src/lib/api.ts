const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Finding {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence: string[];
  recommendation: string;
}

export interface AnalysisReport {
  session_id: string;
  failure_type: string;
  summary: string;
  findings: Finding[];
  root_cause: string;
  confidence: number;
  raw_analysis: string;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  metadata: { request_id: string; duration_ms: number } | null;
}

export async function analyzeSession(
  payload: object
): Promise<AnalysisReport> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: ApiResponse<AnalysisReport> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No data returned from analysis");
  return body.data;
}

// ── Demo session payloads ──────────────────────────────────────────────────────
// Each page sends a pre-built realistic trace so the analysis pipeline has
// meaningful evidence to work with regardless of what session ID is typed.

export function buildMemorySession(sessionId: string) {
  return {
    session_id: sessionId || "sess-memory-demo",
    agent_id: "support-bot",
    outcome: "failed",
    failure_summary:
      "Retrieval returned low similarity scores — relevant documents not surfaced",
    retrieval_events: [
      {
        event_id: "ret-1",
        query: "billing policy refund terms",
        namespace: "support-docs",
        chunks_returned: 3,
        relevance_scores: [0.42, 0.38, 0.31],
        expected_doc_ids: ["doc-1-billing-policy"],
        actual_doc_ids: ["doc-3-legacy", "doc-7-faq", "doc-2-tos"],
      },
      {
        event_id: "ret-2",
        query: "pro-rated refund calculation",
        namespace: "support-docs",
        chunks_returned: 2,
        relevance_scores: [0.29, 0.22],
        expected_doc_ids: ["doc-1-billing-policy", "doc-4-refunds"],
        actual_doc_ids: ["doc-7-faq", "doc-9-outdated"],
      },
    ],
    llm_calls: [
      {
        call_id: "llm-1",
        model: "gpt-4o",
        prompt: "How do pro-rated refunds work for cancelled accounts?",
        response:
          "I was unable to find specific refund terms in the provided context. The retrieved documents did not contain relevant billing policy information.",
        latency_ms: 1100,
        tokens_in: 220,
        tokens_out: 45,
      },
    ],
    tool_calls: [],
  };
}

export function buildToolMisfireSession(sessionId: string) {
  return {
    session_id: sessionId || "sess-tool-demo",
    agent_id: "payment-agent",
    outcome: "failed",
    failure_summary:
      "Payment API timed out after 3 consecutive retries — no circuit breaker in place",
    tool_calls: [
      {
        call_id: "t1",
        tool_name: "payment_api",
        parameters: { amount: 49.99, currency: "USD", user_id: "usr_4892" },
        status: "timeout",
        error: "Connection timed out after 30000ms waiting for upstream gateway",
        latency_ms: 30000,
      },
      {
        call_id: "t2",
        tool_name: "payment_api",
        parameters: { amount: 49.99, currency: "USD", user_id: "usr_4892" },
        status: "timeout",
        error: "Connection timed out after 30000ms waiting for upstream gateway",
        latency_ms: 30000,
      },
      {
        call_id: "t3",
        tool_name: "payment_api",
        parameters: { amount: 49.99, currency: "USD", user_id: "usr_4892" },
        status: "timeout",
        error: "Connection timed out after 30000ms waiting for upstream gateway",
        latency_ms: 30000,
      },
    ],
    llm_calls: [],
    retrieval_events: [],
  };
}

export function buildHallucinationSession(sessionId: string) {
  return {
    session_id: sessionId || "sess-hall-demo",
    agent_id: "qa-bot",
    outcome: "failed",
    failure_summary:
      "LLM stated billing cycle is 30 days — source document explicitly states 14 days",
    llm_calls: [
      {
        call_id: "llm-1",
        model: "gpt-4o",
        prompt:
          "What is the billing cycle for Standard plan customers? Cite your source.",
        response:
          "Based on the terms of service (doc-3), the billing cycle is 30 days. Customers are charged monthly on the same calendar date as their sign-up.",
        hallucination_flag: true,
        source_documents: ["doc-3-billing"],
        latency_ms: 1200,
        tokens_in: 150,
        tokens_out: 55,
      },
    ],
    tool_calls: [],
    retrieval_events: [
      {
        event_id: "ret-1",
        query: "billing cycle Standard plan",
        namespace: "product-docs",
        chunks_returned: 2,
        relevance_scores: [0.78, 0.61],
        expected_doc_ids: ["doc-3-billing"],
        actual_doc_ids: ["doc-3-billing", "doc-8-pricing"],
      },
    ],
  };
}

export function buildBlindSpotSession(sessionId: string) {
  return {
    session_id: sessionId || "sess-blind-demo",
    agent_id: "enterprise-support-bot",
    outcome: "failed",
    failure_summary:
      "Agent consistently unable to answer enterprise SSO configuration questions — 14 failed sessions in 7 days. No relevant documentation in the knowledge base.",
    llm_calls: [
      {
        call_id: "llm-1",
        model: "gpt-4o",
        prompt:
          "How do I configure SAML SSO for our enterprise Okta integration?",
        response:
          "I don't have specific information about enterprise SSO configuration. Please contact our enterprise support team directly.",
        latency_ms: 900,
        tokens_in: 180,
        tokens_out: 35,
      },
    ],
    tool_calls: [],
    retrieval_events: [
      {
        event_id: "ret-1",
        query: "enterprise SSO SAML Okta configuration",
        namespace: "product-docs",
        chunks_returned: 0,
        relevance_scores: [],
        expected_doc_ids: [],
        actual_doc_ids: [],
      },
    ],
  };
}
