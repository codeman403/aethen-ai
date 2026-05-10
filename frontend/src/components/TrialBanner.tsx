"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle, X } from "lucide-react";
import { fetchUsage, type TrialStatus } from "@/lib/api";

export function TrialBanner() {
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchUsage()
      .then(u => { if (u.trial) setTrial(u.trial); })
      .catch(() => {/* non-fatal */});
  }, []);

  if (!trial || dismissed) return null;
  if (trial.converted) return null;
  if (!trial.in_trial && !trial.trial_expired) return null;

  if (trial.trial_expired) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="font-medium">Your 3-day trial has ended.</span>
          <span className="text-rose-600/80 dark:text-rose-400/80">Contact us to continue using Aethen.</span>
        </div>
        <a
          href="mailto:hello@aethen.ai"
          className="shrink-0 px-3 py-1 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 transition-colors"
        >
          Contact Us
        </a>
      </div>
    );
  }

  // In trial
  const urgent = trial.days_remaining <= 1;
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 border-b text-sm ${
      urgent
        ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
        : "bg-primary/5 border-primary/10 text-primary"
    }`}>
      <div className="flex items-center gap-2">
        <Clock className="size-3.5 shrink-0" />
        <span>
          <span className="font-semibold">Free trial</span>
          {" — "}
          {trial.days_remaining === 0
            ? "expires today"
            : `${trial.days_remaining} day${trial.days_remaining === 1 ? "" : "s"} remaining`
          }
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-0.5 rounded hover:bg-black/10 transition-colors"
        aria-label="Dismiss trial banner"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
