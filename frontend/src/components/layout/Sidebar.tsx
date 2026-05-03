"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  ShieldCheck,
  Eye,
  MessageSquare,
  ChevronsUpDown,
  Settings,
  TrendingUp,
  Network,
  Timer,
  Lightbulb,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard",         href: "/overview",        icon: LayoutDashboard },
    ],
  },
  {
    label: "Analysis",
    items: [
      { label: "Failure Trends",    href: "/trends",          icon: TrendingUp      },
      { label: "Pattern Clusters",  href: "/patterns",        icon: Network         },
      { label: "Agent Profiles",    href: "/agents",          icon: Bot             },
      { label: "Recommendations",   href: "/recommendations", icon: Lightbulb       },
    ],
  },
  {
    label: "Explore",
    items: [
      { label: "Trace Explorer",    href: "/traces",          icon: Eye             },
      { label: "Session Timeline",  href: "/timeline",        icon: Timer           },
      { label: "Chat Debug",        href: "/chat",            icon: MessageSquare   },
    ],
  },
  {
    label: "Live Demo",
    items: [
      { label: "Demo Agent",        href: "/demo-agent",      icon: Bot             },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Data Quality",      href: "/data-quality",    icon: ShieldCheck     },
      { label: "Model Settings",    href: "/settings",        icon: Settings        },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[240px] border-r border-border bg-background/80 backdrop-blur-2xl flex flex-col h-full border-r border-border/30">
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <Link href="/overview" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <div className="size-7 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center font-bold text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.1)]">
            Ae
          </div>
          <span className="font-bold tracking-tight text-lg">Aethen-AI</span>
        </Link>
      </div>

      <div className="flex-1 overflow-auto py-4 px-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-2">
              {group.label}
            </p>
            <nav className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "?");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground/60")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border/50 mt-auto bg-muted/20">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-border/50 bg-card hover:border-primary/20 transition-all duration-200 cursor-pointer hover:bg-accent">
          <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs border border-primary/20">
            US
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium truncate">System Admin</span>
            <span className="text-xs text-muted-foreground truncate">admin@aethen.ai</span>
          </div>
          <ChevronsUpDown className="size-3.5 text-muted-foreground/50 ml-auto" />
        </div>
      </div>
    </aside>
  );
}
