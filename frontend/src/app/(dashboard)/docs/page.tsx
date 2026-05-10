"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, Code2, ChevronDown, ChevronRight, Zap, BrainCircuit, Network, Database, Key } from "lucide-react";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Collapsible section ───────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="p-1.5 bg-primary/10 text-primary rounded-lg border border-primary/20 shrink-0">
          <Icon className="size-4" />
        </div>
        <span className="font-semibold text-sm flex-1">{title}</span>
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed space-y-3 border-t border-border/30 pt-4">{children}</div>}
    </div>
  );
}

function Code({ children, lang = "bash" }: { children: string; lang?: string }) {
  return (
    <pre className={`text-xs bg-muted rounded-xl p-4 overflow-auto language-${lang}`}>
      <code>{children.trim()}</code>
    </pre>
  );
}

function Badge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    POST: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    PATCH: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    DELETE: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded font-mono w-12 text-center ${colors[method] ?? ""}`}>
      {method}
    </span>
  );
}

// ── API endpoint row ──────────────────────────────────────────────────────

const ENDPOINTS = [
  { method: "POST", path: "/api/ingest",          desc: "Ingest one or more session traces" },
  { method: "POST", path: "/api/chat",             desc: "Run full LangGraph analysis on a session" },
  { method: "POST", path: "/api/chat/freeform",    desc: "Natural-language query against your sessions" },
  { method: "GET",  path: "/api/sessions",         desc: "List ingested sessions (paginated)" },
  { method: "GET",  path: "/api/sessions/{id}",    desc: "Fetch a single session by ID" },
  { method: "GET",  path: "/api/stats",            desc: "Dashboard statistics for your org" },
  { method: "GET",  path: "/api/usage",            desc: "Current-period usage and quota limits" },
  { method: "POST", path: "/api/webhooks",         desc: "Register a webhook endpoint" },
  { method: "GET",  path: "/api/onboarding",       desc: "Onboarding checklist completion state" },
  { method: "GET",  path: "/api/health",           desc: "Health check — no auth required" },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default function DocsPage() {
  return (
    <div className="max-w-3xl space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-2xl border border-primary/20">
            <BookOpen className="size-6" />
          </div>
          Docs
        </h2>
        <p className="text-muted-foreground">
          Get up and running with Aethen. Ingest your first traces and start diagnosing AI agent failures.
        </p>
      </div>

      {/* Quick start steps */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 space-y-4">
        <h3 className="font-semibold text-base">Quick Start</h3>
        <ol className="space-y-3">
          {[
            { n: 1, text: "Add your OpenAI or Anthropic API key", href: "/settings/integrations", cta: "LLM Configuration →" },
            { n: 2, text: "Connect Langfuse or LangSmith", href: "/settings/integrations", cta: "Integrations →" },
            { n: 3, text: "Pull your first traces", href: "/traces", cta: "Trace Explorer →" },
            { n: 4, text: "Run an analysis on a session", href: "/traces", cta: "Analyze →" },
          ].map(step => (
            <li key={step.n} className="flex items-start gap-4">
              <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.n}
              </span>
              <div className="flex-1 flex items-center justify-between gap-4">
                <span className="text-sm">{step.text}</span>
                <Link href={step.href} className="text-xs text-primary hover:underline shrink-0 font-medium">
                  {step.cta}
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Key concepts */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Core Concepts</h3>

        <Section title="Failure Types" icon={Zap} defaultOpen>
          <div className="grid gap-2">
            {[
              { type: "memory", color: "bg-blue-500", desc: "Wrong or missing documents retrieved. Low similarity scores, doc ID mismatches." },
              { type: "tool_misfire", color: "bg-orange-500", desc: "Tool calls failed, timed out, or used wrong parameters." },
              { type: "hallucination", color: "bg-rose-500", desc: "LLM output contradicts the retrieved source documents." },
              { type: "blind_spot", color: "bg-purple-500", desc: "Zero retrieval results — topic absent from the knowledge base." },
            ].map(f => (
              <div key={f.type} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
                <span className={`size-2 rounded-full mt-1.5 shrink-0 ${f.color}`} />
                <div>
                  <code className="text-xs font-mono font-bold text-foreground">{f.type}</code>
                  <p className="text-xs mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Confidence Score" icon={BrainCircuit}>
          <p>Every analysis returns a score between 0–1, computed from trace signals — not LLM self-reporting.</p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { range: "0.7 – 1.0", label: "High", color: "text-rose-500", desc: "Act on findings" },
              { range: "0.4 – 0.7", label: "Medium", color: "text-amber-500", desc: "Investigate further" },
              { range: "0 – 0.4", label: "Low", color: "text-muted-foreground", desc: "Insufficient signals" },
            ].map(c => (
              <div key={c.range} className="rounded-xl bg-muted/30 px-3 py-2 text-center">
                <p className={`text-xs font-bold ${c.color}`}>{c.label}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{c.range}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{c.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Analysis Pipeline" icon={Network}>
          <p>Every session goes through a 3-stage pipeline (~9–12 s):</p>
          <ol className="space-y-1.5 mt-2 list-decimal list-inside">
            <li><strong className="text-foreground">Classify</strong> — GPT-4o-mini identifies the failure type from trace structure.</li>
            <li><strong className="text-foreground">Retrieve</strong> — Pinecone finds related sessions; Neo4j detects systemic patterns.</li>
            <li><strong className="text-foreground">Analyze</strong> — Claude Sonnet generates root cause, findings, and recommendations.</li>
          </ol>
          <p className="text-xs mt-2 text-muted-foreground/70">Completed analyses are cached — repeat calls return instantly. Use <code className="bg-muted px-1 rounded">refresh=true</code> to rerun.</p>
        </Section>

        <Section title="Trace Sources" icon={Database}>
          <ul className="space-y-2">
            <li><strong className="text-foreground">Langfuse</strong> — connect in LLM Configuration, then Pull Traces from Trace Explorer.</li>
            <li><strong className="text-foreground">LangSmith</strong> — same flow, different credentials.</li>
            <li><strong className="text-foreground">Direct API</strong> — POST session payloads to <code className="bg-muted px-1 rounded text-xs">/api/ingest</code> using your API key.</li>
          </ul>
        </Section>
      </div>

      {/* API reference */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">REST API</h3>
          <a href={`${BASE_URL}/docs`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
            Interactive explorer <ExternalLink className="size-3" />
          </a>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="px-4 py-2.5 bg-muted/20 border-b border-border/50 flex items-center gap-2">
            <Key className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">All endpoints require <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;key&gt;</code> except <code className="bg-muted px-1 rounded">/api/health</code></span>
          </div>
          <div className="divide-y divide-border/30">
            {ENDPOINTS.map(({ method, path, desc }) => (
              <div key={path} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <Badge method={method} />
                <code className="text-xs font-mono text-foreground shrink-0">{path}</code>
                <span className="text-xs text-muted-foreground flex-1 truncate">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-primary" />
            <h4 className="text-sm font-semibold">Ingest a session</h4>
          </div>
          <Code lang="bash">{`curl -X POST ${BASE_URL}/api/ingest \\
  -H "Authorization: Bearer <your_api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sessions": [{
      "session_id": "my-session-001",
      "agent_id": "my-agent",
      "outcome": "failure",
      "failure_summary": "Agent failed to find contract date",
      "llm_calls": [],
      "tool_calls": [{"tool_name": "search", "status": "timeout", "latency_ms": 6200}],
      "retrieval_events": [],
      "trace_source": "custom"
    }]
  }'`}</Code>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <Key className="size-4 text-primary" />
            <h4 className="text-sm font-semibold">Get your API key</h4>
          </div>
          <p className="text-xs text-muted-foreground">Generate an API key in <Link href="/settings/api-key" className="text-primary hover:underline font-medium">Settings → API Key</Link>, then pass it as a Bearer token.</p>
          <Code lang="bash">{`export AETHEN_KEY="aethen_..."

# List recent sessions
curl -H "Authorization: Bearer $AETHEN_KEY" ${BASE_URL}/api/sessions

# Get dashboard stats
curl -H "Authorization: Bearer $AETHEN_KEY" ${BASE_URL}/api/stats`}</Code>
        </div>
      </div>

    </div>
  );
}
