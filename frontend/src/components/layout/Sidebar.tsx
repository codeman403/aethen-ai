"use client";

import Link from "next/link";
import { AethenLogo } from "@/components/ui/logo";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/app/(dashboard)/layout";
import {
  LayoutDashboard,
  Bot,
  ShieldCheck,
  Eye,
  MessageSquare,
  BrainCircuit,
  TrendingUp,
  Network,
  Timer,
  Lightbulb,
  UserCircle,
  KeyRound,
  BarChart3,
  ShieldAlert,
  Webhook,
  BookOpen,
  Mail,
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
      { label: "Data Quality",        href: "/data-quality",          icon: ShieldCheck  },
      { label: "Docs",                  href: "/docs",                  icon: BookOpen     },
      { label: "Usage",                href: "/settings/usage",        icon: BarChart3    },
      { label: "Integrations",        href: "/settings/integrations", icon: BrainCircuit },
      { label: "Webhooks",            href: "/settings/webhooks",     icon: Webhook      },
      { label: "Digest",              href: "/settings/digest",       icon: Mail         },
      { label: "API Key",             href: "/settings/api-key",      icon: KeyRound     },
      { label: "Profile",             href: "/settings/profile",      icon: UserCircle   },
    ],
  },
];


export function Sidebar({ userProfile }: { userProfile: UserProfile }) {
  const pathname = usePathname();

  return (
    <aside className="w-[240px] border-r border-border bg-background/80 backdrop-blur-2xl flex flex-col h-full border-r border-border/30">
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <AethenLogo size={28} />
          <span className="font-bold tracking-tight text-lg bg-gradient-to-r from-[#6D28D9] to-[#059669] bg-clip-text text-transparent">Aethen AI</span>
        </Link>
      </div>

      {userProfile.orgName && (
        <div className="px-6 py-2 border-b border-border/30 bg-muted/20">
          <p className="text-xs text-muted-foreground truncate">
            <span className="text-foreground/60 font-medium">{userProfile.orgName}</span>
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto py-4 px-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-2">
              {group.label}
            </p>
            <nav className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || pathname.startsWith(item.href + "?");
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

        {/* Admin section — only visible to admin users */}
        {userProfile.isAdmin && (
          <div>
            <p className="text-[10px] font-semibold text-amber-500/80 uppercase tracking-wider mb-1.5 px-2">
              Admin
            </p>
            <nav className="flex flex-col gap-0.5">
              {[{ label: "Admin Panel", href: "/admin", icon: ShieldAlert }].map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", isActive ? "text-amber-500" : "text-muted-foreground/60")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>

    </aside>
  );
}
