"use client";

import { Search, Bell, Settings, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Header() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — render toggle only after mount
  useEffect(() => setMounted(true), []);

  return (
    <header className="h-16 border-b border-border/30 bg-background/60 backdrop-blur-2xl sticky top-0 z-30 flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-base font-medium text-muted-foreground/80 flex items-center gap-2 hover:text-foreground transition-colors duration-200">
          <span>Agent Reliability Studio</span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:flex items-center">
          <button className="flex h-9 w-72 items-center justify-between rounded-full border border-input bg-muted/40 px-3 text-base text-muted-foreground shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 transition-all hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <div className="flex items-center gap-2">
              <Search className="size-4 opacity-70" />
              <span>Search traces...</span>
            </div>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-sm">⌘</span>K
            </kbd>
          </button>
        </div>
        <div className="flex items-center gap-1 ml-2 border-l pl-4 py-1">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="size-[18px]" />
              ) : (
                <Moon className="size-[18px]" />
              )}
            </Button>
          )}
          <Button variant="ghost" size="icon" title="Coming soon" className="size-9 rounded-full text-muted-foreground/50 hover:text-foreground">
            <Bell className="size-[18px]" />
          </Button>
          <Button variant="ghost" size="icon" title="Coming soon" className="size-9 rounded-full text-muted-foreground/50 hover:text-foreground">
            <Settings className="size-[18px]" />
          </Button>
        </div>
      </div>
    </header>
  );
}
