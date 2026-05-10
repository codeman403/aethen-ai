"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, TrendingUp, Network, Bot,
  Lightbulb, Eye, Timer, MessageSquare, ShieldCheck,
  BookOpen, BarChart3, BrainCircuit, Webhook, Mail,
  KeyRound, UserCircle, ShieldAlert, X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  group: string;
  icon: React.ElementType;
  keywords?: string;
}

const ALL_ITEMS: NavItem[] = [
  { group: "Overview",  label: "Dashboard",        href: "/overview",                icon: LayoutDashboard, keywords: "home main" },
  { group: "Analysis",  label: "Failure Trends",   href: "/trends",                  icon: TrendingUp,      keywords: "charts graphs statistics" },
  { group: "Analysis",  label: "Pattern Clusters", href: "/patterns",                icon: Network,         keywords: "clusters groups similar" },
  { group: "Analysis",  label: "Agent Profiles",   href: "/agents",                  icon: Bot,             keywords: "agents bots profile reliability" },
  { group: "Analysis",  label: "Recommendations",  href: "/recommendations",         icon: Lightbulb,       keywords: "fixes remediations suggestions" },
  { group: "Explore",   label: "Trace Explorer",   href: "/traces",                  icon: Eye,             keywords: "sessions traces logs ingest pull" },
  { group: "Explore",   label: "Session Timeline", href: "/timeline",                icon: Timer,           keywords: "timeline events history" },
  { group: "Explore",   label: "Chat Debug",       href: "/chat",                    icon: MessageSquare,   keywords: "chat freeform ask query debug" },
  { group: "Live Demo", label: "Demo Agent",       href: "/demo-agent",              icon: Bot,             keywords: "demo example try" },
  { group: "System",    label: "Data Quality",     href: "/data-quality",            icon: ShieldCheck,     keywords: "quality checks health pii" },
  { group: "System",    label: "Docs",             href: "/docs",                    icon: BookOpen,        keywords: "documentation api reference guide" },
  { group: "System",    label: "Usage",            href: "/settings/usage",          icon: BarChart3,       keywords: "quota limits billing sessions" },
  { group: "System",    label: "Integrations",     href: "/settings/integrations",   icon: BrainCircuit,    keywords: "langfuse langsmith connect source" },
  { group: "System",    label: "Webhooks",         href: "/settings/webhooks",       icon: Webhook,         keywords: "webhook events notifications" },
  { group: "System",    label: "Digest",           href: "/settings/digest",         icon: Mail,            keywords: "email digest daily summary" },
  { group: "System",    label: "API Key",          href: "/settings/api-key",        icon: KeyRound,        keywords: "api key token secret" },
  { group: "System",    label: "Profile",          href: "/settings/profile",        icon: UserCircle,      keywords: "account name avatar user" },
  { group: "Admin",     label: "Admin Panel",      href: "/admin",                   icon: ShieldAlert,     keywords: "admin users orgs organisations" },
];

function score(item: NavItem, q: string): number {
  const low = q.toLowerCase();
  const label = item.label.toLowerCase();
  const group = item.group.toLowerCase();
  const kw = (item.keywords ?? "").toLowerCase();
  if (label === low) return 3;
  if (label.startsWith(low)) return 2;
  if (label.includes(low) || group.includes(low) || kw.includes(low)) return 1;
  return 0;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = query.trim()
    ? ALL_ITEMS.map(item => ({ item, s: score(item, query) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.item)
    : ALL_ITEMS;

  const navigate = useCallback((href: string) => {
    onClose();
    router.push(href);
  }, [onClose, router]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && results[cursor]) navigate(results[cursor].href);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, cursor, results, navigate, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-background border border-border/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground/50 hover:text-muted-foreground">
              <X className="size-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/60 bg-muted text-[10px] font-mono text-muted-foreground">
            esc
          </kbd>
        </div>

        {/* Results */}
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">No pages found.</li>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === cursor;
              return (
                <li key={item.href}>
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-muted/70 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => navigate(item.href)}
                  >
                    <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-primary/10" : "bg-muted/50"}`}>
                      <Icon className={`size-3.5 ${isActive ? "text-primary" : "text-muted-foreground/60"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40 font-mono uppercase tracking-wide shrink-0">{item.group}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border/30 flex items-center gap-4 text-[10px] font-mono text-muted-foreground/40">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
