"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface OnboardingStep { id: string; title: string; href: string; completed: boolean; }
interface OnboardingStatus { steps: OnboardingStep[]; all_complete: boolean; completed_count: number; total: number; }

async function fetchOnboarding(): Promise<OnboardingStatus | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data: { session } } = await (await createClient()).auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch(`${BASE_URL}/api/onboarding`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!res.ok) return null;
    return (await res.json()).data;
  } catch { return null; }
}

export function OnboardingChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("onboarding_dismissed") === "1") { setDismissed(true); return; }
    fetchOnboarding().then(setStatus);
  }, []);

  const handleDismiss = () => { setDismissed(true); sessionStorage.setItem("onboarding_dismissed", "1"); };

  if (!status || dismissed || status.all_complete) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-3 flex items-center gap-4 text-sm shadow-sm">
      <span className="text-xs font-medium text-muted-foreground shrink-0">Get started</span>
      <div className="flex items-center gap-3 flex-1 flex-wrap">
        {status.steps.map((step) => (
          <Link
            key={step.id}
            href={step.href}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
              step.completed
                ? "text-emerald-600 dark:text-emerald-400 line-through opacity-60 pointer-events-none"
                : "text-primary hover:underline"
            }`}
          >
            {step.completed
              ? <CheckCircle2 className="size-3 shrink-0" />
              : <Circle className="size-3 shrink-0" />
            }
            {step.title}
          </Link>
        ))}
      </div>
      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
        {status.completed_count}/{status.total}
      </span>
      <button onClick={handleDismiss} className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground shrink-0">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
