"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, TrendingUp, Network, Bot,
  Lightbulb, Eye, Timer, MessageSquare, ShieldCheck,
  BookOpen, BarChart3, BrainCircuit, Webhook, Mail,
  KeyRound, UserCircle, ShieldAlert, Settings,
  Wrench, ScanSearch, GitBranch, X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  group: string;
  icon: React.ElementType;
  keywords: string;
}

const ALL_ITEMS: NavItem[] = [
  // ── Overview ────────────────────────────────────────────────────────────────
  {
    group: "Overview", label: "Dashboard", href: "/overview",
    icon: LayoutDashboard,
    keywords: "home main overview stats summary sessions analyses count",
  },
  // ── Analysis ────────────────────────────────────────────────────────────────
  {
    group: "Analysis", label: "Failure Trends", href: "/trends",
    icon: TrendingUp,
    keywords: "trends charts graphs statistics weekly monthly failure rate over time line area",
  },
  {
    group: "Analysis", label: "Pattern Clusters", href: "/patterns",
    icon: Network,
    keywords: "clusters groups patterns similar recurring batch cluster network",
  },
  {
    group: "Analysis", label: "Agent Profiles", href: "/agents",
    icon: Bot,
    keywords: "agents bots profile reliability score performance per agent",
  },
  {
    group: "Analysis", label: "Recommendations", href: "/recommendations",
    icon: Lightbulb,
    keywords: "recommendations fixes remediations suggestions actions improve",
  },
  // ── Explore ─────────────────────────────────────────────────────────────────
  {
    group: "Explore", label: "Trace Explorer", href: "/traces",
    icon: Eye,
    keywords: "trace traces explorer sessions logs ingest pull backfill analyze explore view list",
  },
  {
    group: "Explore", label: "Memory Debug", href: "/traces?type=memory",
    icon: GitBranch,
    keywords: "memory debug retrieval embedding vector stale chunk mismatch recall",
  },
  {
    group: "Explore", label: "Tool Misfire", href: "/traces?type=tool_misfire",
    icon: Wrench,
    keywords: "tool misfire error timeout parameter permission call failure",
  },
  {
    group: "Explore", label: "Hallucination RCA", href: "/traces?type=hallucination",
    icon: ShieldAlert,
    keywords: "hallucination rca root cause fabrication unsupported false claim",
  },
  {
    group: "Explore", label: "Blind Spot", href: "/traces?type=blind_spot",
    icon: ScanSearch,
    keywords: "blind spot knowledge gap missing topic zero chunks coverage",
  },
  {
    group: "Explore", label: "Session Timeline", href: "/timeline",
    icon: Timer,
    keywords: "timeline events history chronological order session replay",
  },
  {
    group: "Explore", label: "Chat Debug", href: "/chat",
    icon: MessageSquare,
    keywords: "chat freeform ask query debug conversation assistant ai",
  },
  // ── Live Demo ───────────────────────────────────────────────────────────────
  {
    group: "Live Demo", label: "Demo Agent", href: "/demo-agent",
    icon: Bot,
    keywords: "demo example try test playground live preview",
  },
  // ── System ──────────────────────────────────────────────────────────────────
  {
    group: "Settings", label: "LLM Configuration", href: "/settings",
    icon: Settings,
    keywords: "llm configuration model openai anthropic claude gpt api key provider settings credential setup",
  },
  {
    group: "System", label: "Data Quality", href: "/data-quality",
    icon: ShieldCheck,
    keywords: "data quality checks health pii redaction validation pipeline",
  },
  {
    group: "System", label: "Docs", href: "/docs",
    icon: BookOpen,
    keywords: "documentation docs api reference guide help how to pipeline ingest analyze",
  },
  {
    group: "System", label: "Usage & Quotas", href: "/settings/usage",
    icon: BarChart3,
    keywords: "usage quota limits billing sessions analyses plan trial subscription",
  },
  {
    group: "System", label: "Integrations", href: "/settings/integrations",
    icon: BrainCircuit,
    keywords: "integrations langfuse langsmith connect source trace provider setup",
  },
  {
    group: "System", label: "Webhooks", href: "/settings/webhooks",
    icon: Webhook,
    keywords: "webhooks events notifications discord alerts ping http endpoint",
  },
  {
    group: "System", label: "Digest", href: "/settings/digest",
    icon: Mail,
    keywords: "digest email daily summary report notification send",
  },
  {
    group: "System", label: "API Key", href: "/settings/api-key",
    icon: KeyRound,
    keywords: "api key token secret auth aethen access bearer",
  },
  {
    group: "System", label: "Profile", href: "/settings/profile",
    icon: UserCircle,
    keywords: "profile account name avatar user settings personal",
  },
  // ── Admin ───────────────────────────────────────────────────────────────────
  {
    group: "Admin", label: "Admin Panel", href: "/admin",
    icon: ShieldAlert,
    keywords: "admin users orgs organisations management panel overview all",
  },
];

function matchScore(item: NavItem, rawQuery: string): number {
  const words = rawQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const label = item.label.toLowerCase();
  const group = item.group.toLowerCase();
  const kw    = item.keywords.toLowerCase();
  const full  = `${label} ${group} ${kw}`;

  // Every word must appear somewhere in the searchable text
  if (!words.every(w => full.includes(w))) return 0;

  const q = words.join(" ");
  if (label === q)           return 5;
  if (label.startsWith(q))   return 4;
  if (label.includes(q))     return 3;
  if (group.includes(q))     return 2;
  return 1;
}

function filterItems(query: string): NavItem[] {
  if (!query.trim()) return [];
  return ALL_ITEMS
    .map(item => ({ item, s: matchScore(item, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.item);
}

export function SearchBar() {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);

  const results = filterItems(query);

  // Open dropdown whenever there are results
  useEffect(() => {
    setOpen(results.length > 0);
    setCursor(0);
  }, [results.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ⌘K / Ctrl+K focuses the input (no modal)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const navigate = useCallback((href: string) => {
    setQuery("");
    setOpen(false);
    router.push(href);
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape")    { setQuery(""); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return; }
    if (e.key === "Enter" && results[cursor]) { navigate(results[cursor].href); return; }
  };

  return (
    <div ref={containerRef} className="relative hidden md:flex items-center">
      {/* Search input */}
      <div className="flex h-9 w-72 items-center gap-2 rounded-full border border-input bg-muted/40 px-3 text-base text-muted-foreground shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-[1px] transition-all duration-300 hover:bg-muted/60 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring/50">
        <Search className="size-4 opacity-70 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none min-w-0"
        />
        {query ? (
          <button
            onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            tabIndex={-1}
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground shrink-0">
            <span className="text-sm">⌘</span>K
          </kbd>
        )}
      </div>

      {/* Inline dropdown — no modal, no overlay */}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 left-0 w-80 bg-background border border-border/60 rounded-2xl shadow-xl overflow-hidden z-50">
          <ul ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
            {results.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === cursor;
              return (
                <li key={item.href + i}>
                  <button
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-muted/70 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => navigate(item.href)}
                  >
                    <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-primary/10" : "bg-muted/50"}`}>
                      <Icon className={`size-3.5 ${isActive ? "text-primary" : "text-muted-foreground/60"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40 font-mono uppercase tracking-wide shrink-0">
                      {item.group}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-3 py-1.5 border-t border-border/30 flex items-center gap-3 text-[10px] font-mono text-muted-foreground/40">
            <span>↑↓ navigate</span><span>↵ open</span><span>esc clear</span>
          </div>
        </div>
      )}
    </div>
  );
}
