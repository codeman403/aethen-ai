# Getting Started with Aethen

This guide walks you from sign-up to your first AI agent failure diagnosis in four steps. The in-app checklist (visible in the dashboard header until complete) tracks your progress automatically.

---

## Before You Begin

You'll need:
- API keys for the LLM providers you want to use (**OpenAI** required, **Anthropic** optional)
- An account on **Langfuse** or **LangSmith** with at least one AI agent trace recorded

No agent code changes are required — Aethen reads existing traces from your observability platform.

---

## Step 1 — Sign Up and Open the Dashboard

1. Go to [aethen-ai.vercel.app](https://aethen-ai.vercel.app)
2. Click **Open Studio** and sign in with Google, GitHub, or email
3. You'll land on the **Overview** page with the onboarding checklist visible at the top

---

## Step 2 — Configure LLM Keys

Aethen uses LLMs to classify failures and generate root cause analyses. You supply your own API keys — they are encrypted at rest and never shared.

1. Go to **Settings → Integrations**
2. Under **LLM Configuration**, add at minimum:
   - **OpenAI API Key** — required (used for intent classification and embeddings)
   - **Anthropic API Key** — optional (used for Claude analysis; falls back to GPT-4o-mini without it)
3. Click **Save**

✅ The checklist item **"Configure LLM Keys"** marks complete automatically.

---

## Step 3 — Connect a Trace Source

Connect Langfuse or LangSmith so Aethen can pull your agent execution traces.

### Langfuse

1. In **Settings → Integrations**, find the **Langfuse** section
2. Enter your:
   - **Public Key** (from Langfuse → Settings → API Keys)
   - **Secret Key**
   - **Host** — `https://us.cloud.langfuse.com` (US) or `https://cloud.langfuse.com` (EU)
3. Click **Test Connection** to verify, then **Save**

### LangSmith

1. In **Settings → Integrations**, find the **LangSmith** section
2. Enter your:
   - **API Key** (from LangSmith → Settings → API Keys)
   - **Project name**
3. Click **Test Connection**, then **Save**

✅ The checklist item **"Connect a Trace Source"** marks complete automatically.

---

## Step 4 — Ingest Your First Session

1. Go to the **Overview** page
2. Click **Pull Traces** (top-right area of the page)
3. Aethen fetches recent traces from your connected source, embeds them into pgvector, and seeds the Neo4j graph
4. Sessions appear in the **Traces** page, each tagged with a failure type indicator

> **Tip:** Aethen also pulls traces automatically every day at 00:00 UTC via Vercel Cron — manual pull is only needed for the first import or on-demand refreshes.

✅ The checklist item **"Ingest Your First Session"** marks complete automatically.

---

## Step 5 — Run Your First Analysis

1. Go to **Traces**
2. Click any session row — sessions with a ● coloured dot already have a cached analysis
3. Click **Analyze** (or open the session and use **Chat Debug** for a conversational deep-dive)
4. Aethen runs the LangGraph pipeline (~9–12 seconds) and returns:
   - **Failure type** — memory, tool_misfire, hallucination, or blind_spot
   - **Root cause** — one precise sentence with component + evidence + downstream effect
   - **Findings** — 2–4 prioritised findings with severity and remediation steps
   - **Confidence score** — deterministic evidence-based score (0.05–0.95)

✅ The checklist item **"Run Your First Analysis"** marks complete automatically. The checklist dismisses from the header once all four steps are done.

---

## No Real Traces Yet? Use the Demo Agent

The **Demo Agent** page (`/demo-agent`) lets you generate real failure traces directly from the browser without connecting any external service.

1. Go to [aethen-ai.vercel.app/demo-agent](https://aethen-ai.vercel.app/demo-agent)
2. Click a scenario button — **Memory Debug**, **Tool Misfire**, **Hallucination**, or **Blind Spot**
3. Watch the LLM respond in the chat log; the trace is automatically logged to Langfuse
4. Return to the dashboard, pull the trace, and run a full analysis

This is the fastest way to see an end-to-end diagnosis without needing a live agent.

---

## Daily Digest

Once you have sessions flowing in, Aethen sends a **daily failure digest email** at 07:00 UTC summarising:
- Total sessions and failures from the previous day
- Breakdown by failure type
- Most affected agent

Configure recipients in **Settings → Digest Recipients**.

---

## What's Next

| Goal | Where to go |
|---|---|
| Understand a specific failure in depth | **Chat Debug** — ask follow-up questions about any session |
| Find recurring patterns across sessions | **Pattern Clusters** |
| See which agents fail most | **Agent Profiles** |
| Get prioritised fixes | **Recommendations** |
| Explore knowledge gaps | **Blind Spots** |
| Check data quality | **Data Quality** |
| Set up Discord / webhook alerts | **Settings → Webhooks** |
