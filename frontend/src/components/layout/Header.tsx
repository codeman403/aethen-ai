"use client";

import { Bell, Sun, Moon, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/layout/SearchBar";
import type { UserProfile } from "@/app/(dashboard)/layout";

function UserMenu({ profile }: { profile: UserProfile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSignOut = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    window.location.href = "/";
  };

  const initials = (profile.fullName?.split(" ").map(w => w[0]).join("").slice(0, 2)
    ?? profile.email.slice(0, 2)).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="size-8 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center justify-center hover:bg-primary/20 transition-colors overflow-hidden"
        aria-label="User menu"
      >
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-border/60 bg-card shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-sm font-medium truncate">{profile.fullName ?? profile.email}</p>
            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
            {profile.orgName && (
              <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{profile.orgName}</p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({ userProfile }: { userProfile: UserProfile }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="h-16 border-b border-border/30 bg-background/60 backdrop-blur-2xl sticky top-0 z-30 flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-base font-medium text-muted-foreground/80 flex items-center gap-2 hover:text-foreground transition-colors duration-200">
          <span>Agent Reliability Studio</span>
        </Link>
        {userProfile.orgName && (
          <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md bg-muted/50 border border-border/40 text-xs text-muted-foreground font-medium">
            {userProfile.orgName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SearchBar />
        <div className="flex items-center gap-1 ml-2 border-l pl-3 py-1">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          )}
          <div className="relative group">
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="size-8 rounded-full text-muted-foreground/40 cursor-not-allowed"
              aria-label="Notifications — coming soon"
            >
              <Bell className="size-4" />
            </Button>
            <div className="absolute top-full right-0 mt-2 hidden group-hover:flex items-center whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-popover border border-border/60 shadow-md text-xs text-muted-foreground pointer-events-none z-50">
              Notifications — Coming Soon
            </div>
          </div>
          <UserMenu profile={userProfile} />
        </div>
      </div>
    </header>
  );
}
