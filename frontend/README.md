# Aethen-AI Frontend

Next.js 14 (App Router) dashboard for the Aethen-AI Agent Reliability Studio.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 (App Router) | Framework, SSR, routing |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| shadcn/ui | UI component primitives |
| Lucide React | Icons |
| next-themes | Dark/light mode |

## Getting Started

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Requires the backend running at `http://localhost:8000` (or set `NEXT_PUBLIC_API_URL`).

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Reliability score gauge, failure distribution chart, recent alerts |
| `/chat` | Chat Debug | Freeform diagnostic chat with text-to-SQL, session persistence |
| `/traces` | Trace Explorer | Browse sessions, search, filter by failure type, run analysis |
| `/demo-agent` | Demo Agent | Generate real LLM traces for each failure type with Langfuse tracing |
| `/memory-debug` | Memory Debug | Analyze retrieval failures — wrong chunks, stale embeddings |
| `/tool-misfire` | Tool Misfire | Analyze tool call failures — timeouts, wrong params, cascading errors |
| `/hallucination-rca` | Hallucination RCA | Root cause analysis for LLM hallucinations |
| `/blind-spots` | Blind Spots | Systemic knowledge gap detection across sessions |
| `/data-quality` | Data Quality | Automated quality report across all 4 data sources |

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # Dashboard route group (shared layout)
│   │   ├── page.tsx          # Main dashboard
│   │   ├── chat/             # Chat Debug page
│   │   ├── traces/           # Trace Explorer page
│   │   ├── demo-agent/       # Demo Agent page
│   │   ├── memory-debug/     # Memory Debug module
│   │   ├── tool-misfire/     # Tool Misfire module
│   │   ├── hallucination-rca/# Hallucination RCA module
│   │   ├── blind-spots/      # Blind Spot module
│   │   ├── data-quality/     # Data Quality page
│   │   └── layout.tsx        # Dashboard layout (sidebar + header)
│   └── layout.tsx            # Root layout (theme, fonts)
├── components/
│   ├── ui/                   # shadcn/ui primitives (Button, etc.)
│   ├── features/             # Feature components
│   │   ├── SessionContext.tsx # Trace execution context display
│   │   └── SessionsList.tsx  # Reusable session list with analysis trigger
│   └── layout/               # Header, Sidebar
├── lib/
│   ├── api.ts                # API client — typed fetch calls to backend
│   └── utils.ts              # cn() utility for Tailwind class merging
```

## Scripts

```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm start        # Production server
pnpm lint         # ESLint
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:8000`) |
