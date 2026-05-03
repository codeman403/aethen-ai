const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Wrapper around fetch with exponential backoff retries.
 * Retries on network errors and 5xx/429 status codes.
 */
async function fetchWithRetry(url: string, options?: RequestInit, retries = 3, backoff = 1000): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      // 503 = provider not configured — don't retry, return immediately
      if (res.status === 503) return res;
      if (!res.ok && (res.status >= 500 || res.status === 429)) {
        if (i === retries - 1) return res;
      } else {
        return res;
      }
    } catch (error: any) {
      lastError = error;
      if (i === retries - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, backoff * Math.pow(2, i)));
  }
  throw lastError || new Error("Fetch failed");
}

// ── Dashboard Stats ────────────────────────────────────────────────────────

export interface FailureBreakdown {
  memory: number;
  tool_misfire: number;
  hallucination: number;
  blind_spot: number;
}

export interface DashboardStats {
  total_sessions: number;
  failure_breakdown: FailureBreakdown;
  recent_sessions: number;
  today_sessions: number;
  daily_counts: number[];
  reliability_score: number;
  reliability_score_7d: number;
  daily_by_type?: {
    memory: number;
    tool_misfire: number;
    hallucination: number;
    blind_spot: number;
  };
}

export interface TrendPoint {
  date: string;
  memory: number;
  tool_misfire: number;
  hallucination: number;
  blind_spot: number;
  total: number;
}

export interface PatternsData {
  blind_spots: { topic: string; count: number }[];
  clusters: { failure_type: string; session_count: number; sample_ids: string[]; agents: string[] }[];
  agent_failures: { agent: string; failure_type: string; count: number; total_sessions: number }[];
  model_failures: { model: string; failure_type: string; count: number }[];
  neo4j_available: boolean;
}

export interface AgentProfile {
  agent_id: string;
  total: number;
  total_failures: number;
  memory: number;
  tool_misfire: number;
  hallucination: number;
  blind_spot: number;
  success_rate: number;
  last_seen: string | null;
}

export interface RecommendationItem {
  session_id: string;
  agent_id: string;
  failure_type: string | null;
  session_ts: string | null;
  title: string;
  severity: string;
  recommendation: string;
}

export async function fetchRecommendations(): Promise<RecommendationItem[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/stats/recommendations`);
  const body: ApiResponse<RecommendationItem[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

export async function fetchAgentProfiles(): Promise<AgentProfile[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/stats/agents`);
  const body: ApiResponse<AgentProfile[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

export async function fetchPatterns(): Promise<PatternsData> {
  const res = await fetchWithRetry(`${BASE_URL}/api/stats/patterns`);
  const body: ApiResponse<PatternsData> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? { blind_spots: [], clusters: [], agent_failures: [], model_failures: [], neo4j_available: false };
}

export async function fetchTrends(days: number = 30): Promise<TrendPoint[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/stats/trends?days=${days}`);
  const body: ApiResponse<{ points: TrendPoint[]; days: number }> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data?.points ?? [];
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetchWithRetry(`${BASE_URL}/api/stats`);
  const body: ApiResponse<DashboardStats> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No stats data returned");
  return body.data;
}

// ── Trace Pull (Langfuse + LangSmith) ────────────────────────────────────

export interface TracePullResult {
  sessions_ingested: number;
  events_processed: number;
  analyses_queued?: number;
  errors: string[];
}

export async function pullLangfuseTraces(limit: number = 20): Promise<TracePullResult | null> {
  const res = await fetchWithRetry(`${BASE_URL}/api/langfuse/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
  });
  if (res.status === 503) return null; // not configured — skip silently
  const body: ApiResponse<TracePullResult> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No data returned from Langfuse pull");
  return body.data;
}

export async function pullLangsmithTraces(limit: number = 20): Promise<TracePullResult | null> {
  const res = await fetchWithRetry(`${BASE_URL}/api/langsmith/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
  });
  if (res.status === 503) return null; // not configured — skip silently
  const body: ApiResponse<TracePullResult> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No data returned from LangSmith pull");
  return body.data;
}

export async function checkLangsmithHealth(): Promise<{ status: string; detail: string }> {
  const res = await fetchWithRetry(`${BASE_URL}/api/langsmith/health`);
  const body: ApiResponse<{ status: string; detail: string }> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No health data");
  return body.data;
}

// ── Data Quality ───────────────────────────────────────────────────────────

export interface QualityCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  count: number;
  flagged: number;
  flagged_session_ids: string[];
}

export interface SourceReport {
  source: string;
  total: number;
  status: "pass" | "warn" | "fail";
  checks: QualityCheck[];
}

export interface DataQualityReport {
  generated_at: string;
  overall_status: "pass" | "warn" | "fail";
  sources: SourceReport[];
  summary_text: string;
}

export async function fetchQualityReport(): Promise<DataQualityReport> {
  const res = await fetchWithRetry(`${BASE_URL}/api/qc/report`);
  const body: ApiResponse<DataQualityReport> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No quality report returned");
  return body.data;
}

// ── Model Settings ─────────────────────────────────────────────────────────

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  provider: string;
}

export interface RoleConfig {
  role: string;
  role_label: string;
  role_subtitle: string;
  current_model: string;
  current_provider: string;
  options: ModelOption[];
}

export interface ModelSettingsData {
  roles: RoleConfig[];
}

export interface TestModelResult {
  ok: boolean;
  model_id: string;
  provider: string;
  message: string;
}

export async function fetchModelSettings(): Promise<ModelSettingsData> {
  const res = await fetchWithRetry(`${BASE_URL}/api/settings/models`);
  const body: ApiResponse<ModelSettingsData> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No model settings returned");
  return body.data;
}

export async function updateModelSetting(role: string, model_id: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE_URL}/api/settings/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, model_id }),
  });
  const body: ApiResponse<unknown> = await res.json();
  if (body.error) throw new Error(body.error);
}

export async function testModelConnectivity(model_id: string): Promise<TestModelResult> {
  const res = await fetchWithRetry(`${BASE_URL}/api/settings/models/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id }),  // provider inferred server-side from model name
  });
  const body: ApiResponse<TestModelResult> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No test result returned");
  return body.data;
}

// ── Demo Agent ─────────────────────────────────────────────────────────────

export interface DemoRunResult {
  scenario: string;
  scenario_name: string;
  user_message: string;
  assistant_response: string;
  session_id: string;
  langfuse_traced: boolean;
  langsmith_traced: boolean;
  trace_destination: string;
}

export interface ScenarioInfo {
  key: string;
  name: string;
  description: string;
}

export interface DemoChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DemoChatResult {
  user_message: string;
  assistant_response: string;
  session_id: string;
  langfuse_traced: boolean;
  langsmith_traced: boolean;
  trace_destination: string;
}

export interface DemoSession {
  id: string;
  title: string;
  trace_destination: string;
  message_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface DemoStoredMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  langfuse_traced: boolean;
  created_at: string | null;
}

export async function sendDemoChat(
  message: string,
  history: DemoChatMessage[] = [],
  sessionId: string | null = null,
  traceDestination: string = "langfuse"
): Promise<DemoChatResult> {
  const res = await fetchWithRetry(`${BASE_URL}/api/demo/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, session_id: sessionId, trace_destination: traceDestination }),
  });
  const body: ApiResponse<DemoChatResult> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No data returned from chat");
  return body.data;
}

export async function listDemoSessions(): Promise<DemoSession[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/demo/sessions`);
  const body: ApiResponse<DemoSession[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

export async function getDemoMessages(sessionId: string): Promise<DemoStoredMessage[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/demo/sessions/${encodeURIComponent(sessionId)}/messages`);
  const body: ApiResponse<DemoStoredMessage[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

export async function runDemoScenario(scenario: string, traceDestination: string = "langfuse"): Promise<DemoRunResult> {
  const res = await fetchWithRetry(`${BASE_URL}/api/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, trace_destination: traceDestination }),
  });
  const body: ApiResponse<DemoRunResult> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No data returned from demo run");
  return body.data;
}

export async function fetchDemoScenarios(): Promise<ScenarioInfo[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/demo/scenarios`);
  const body: ApiResponse<ScenarioInfo[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

// ── Sessions ───────────────────────────────────────────────────────────────

export interface SessionSummary {
  session_id: string;
  agent_id: string;
  failure_type: string | null;
  timestamp: string;
  failure_summary: string | null;
  llm_calls: number;
  tool_calls: number;
  retrieval_events: number;
  trace_source: string;  // "langfuse" | "langsmith" | "demo" | "synthetic"
  has_report: boolean;
}

export async function fetchSessionCount(): Promise<number> {
  const res = await fetchWithRetry(`${BASE_URL}/api/sessions/count`);
  const body: ApiResponse<number> = await res.json();
  return body.data ?? 0;
}

export async function fetchAllSessions(limit = 200, offset = 0): Promise<SessionSummary[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/sessions?limit=${limit}&offset=${offset}`);
  const body: ApiResponse<SessionSummary[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

export async function fetchSession(sessionId: string): Promise<object | null> {
  const res = await fetchWithRetry(`${BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  const body: ApiResponse<object> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? null;
}

export async function fetchSessionsByType(failureType: string): Promise<object[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/sessions?failure_type=${encodeURIComponent(failureType)}`);
  const body: ApiResponse<object[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

// ── Analysis ───────────────────────────────────────────────────────────────

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

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Chat Sessions ──────────────────────────────────────────────────────────

export interface ChatSessionSummary {
  id: string;
  title: string;
  message_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  role: string;
  kind: string;
  content: string;
  report: AnalysisReport | null;
  latency_ms: number | null;
  created_at: string | null;
}

export async function createChatSession(title = "New Session"): Promise<ChatSessionSummary> {
  const res = await fetchWithRetry(`${BASE_URL}/api/chat/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const body: ApiResponse<ChatSessionSummary> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data!;
}

export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/chat/sessions`);
  const body: ApiResponse<ChatSessionSummary[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

export async function loadChatSession(sessionId: string): Promise<ChatMessageRecord[]> {
  const res = await fetchWithRetry(`${BASE_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`);
  const body: ApiResponse<ChatMessageRecord[]> = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data ?? [];
}

export async function appendChatMessage(
  sessionId: string,
  message: { id: string; role: string; kind: string; content: string; report?: AnalysisReport | null; latency_ms?: number | null },
): Promise<void> {
  await fetchWithRetry(`${BASE_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}

export async function renameChatSession(sessionId: string, title: string): Promise<void> {
  await fetchWithRetry(`${BASE_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function sendFreeformQuery(
  query: string,
  history: ChatHistoryMessage[] = [],
  model?: string,
): Promise<AnalysisReport> {
  const res = await fetchWithRetry(`${BASE_URL}/api/chat/freeform`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history, ...(model ? { model } : {}) }),
  });
  const body: ApiResponse<AnalysisReport> = await res.json();
  if (body.error) throw new Error(body.error);
  if (!body.data) throw new Error("No analysis returned");
  return body.data;
}

export async function analyzeSession(
  payload: object,
  refresh = false
): Promise<AnalysisReport> {
  const res = await fetchWithRetry(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, refresh }),
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
