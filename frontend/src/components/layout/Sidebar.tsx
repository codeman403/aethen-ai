"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BrainCircuit,
  Wrench,
  ScanSearch,
  Network,
  Bot,
  ShieldCheck,
  Eye,
  MessageSquare,
  ChevronsUpDown,
} from "lucide-react";

const navItems = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Memory Debug", href: "/memory-debug", icon: BrainCircuit },
  { label: "Tool Misfire", href: "/tool-misfire", icon: Wrench },
  { label: "Hallucination RCA", href: "/hallucination-rca", icon: ScanSearch },
  { label: "Blind Spots", href: "/blind-spots", icon: Network },
  { label: "Trace Explorer", href: "/traces", icon: Eye },
  { label: "Chat Debug", href: "/chat", icon: MessageSquare },
];

const demoItems = [
  { label: "Demo Agent", href: "/demo-agent", icon: Bot },
];

const systemItems = [
  { label: "Data Quality", href: "/data-quality", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[260px] border-r border-border bg-card flex flex-col h-full shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <Link href="/overview" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <div className="size-7 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center font-bold text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.1)]">
            Ae
          </div>
          <span className="font-bold tracking-tight text-lg">Aethen-AI</span>
        </Link>
      </div>
      
      <div className="flex-1 overflow-auto py-6 px-4 space-y-6">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Intelligence Modules
          </div>
          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-[18px]", isActive ? "text-primary" : "text-muted-foreground/70")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Live Demo
          </div>
          <nav className="flex flex-col gap-1.5">
            {demoItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-[18px]", isActive ? "text-primary" : "text-muted-foreground/70")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            System
          </div>
          <nav className="flex flex-col gap-1.5">
            {systemItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-[18px]", isActive ? "text-primary" : "text-muted-foreground/70")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      
      <div className="p-4 border-t border-border/50 mt-auto bg-muted/20">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-card shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer hover:bg-accent transition-colors">
          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm border border-primary/20">
            US
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-base font-medium truncate">System Admin</span>
            <span className="text-sm text-muted-foreground truncate">admin@aethen.ai</span>
          </div>
          <ChevronsUpDown className="size-4 text-muted-foreground/50 ml-auto" />
        </div>
      </div>
    </aside>
  );
}
