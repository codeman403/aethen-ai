"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const TIMEOUT_MS   = 15 * 60 * 1000; // 15 min — must match middleware
const WARNING_MS   = 12 * 60 * 1000; // show warning at 12 min
const WARNING_DURATION_MS = TIMEOUT_MS - WARNING_MS; // 3 min countdown

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function SessionTimeoutModal() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_DURATION_MS);
  const lastActivityRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = () => {
    if (warningTimerRef.current)  clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current)   clearTimeout(logoutTimerRef.current);
    if (countdownRef.current)     clearInterval(countdownRef.current);
  };

  const doLogout = useCallback(async () => {
    clearAllTimers();
    setShowWarning(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?expired=1");
    router.refresh();
  }, [router]);

  const scheduleWarning = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(WARNING_DURATION_MS);

      // Tick countdown every second
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1000) {
            clearInterval(countdownRef.current!);
            return 0;
          }
          return prev - 1000;
        });
      }, 1000);

      // Auto-logout when countdown reaches zero
      logoutTimerRef.current = setTimeout(doLogout, WARNING_DURATION_MS);
    }, WARNING_MS);
  }, [doLogout]);

  const handleStayActive = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    lastActivityRef.current = Date.now();
    // Refresh session cookie by triggering a Next.js navigation event
    router.refresh();
    scheduleWarning();
  }, [router, scheduleWarning]);

  useEffect(() => {
    scheduleWarning();

    const onActivity = () => {
      // Only reset if we're not already showing the warning
      if (!showWarning) {
        lastActivityRef.current = Date.now();
        scheduleWarning();
      }
    };

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, onActivity, { passive: true })
    );

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, onActivity)
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {showWarning && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-sm bg-card border border-border/60 rounded-2xl shadow-2xl p-6"
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Icon + title */}
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Clock className="size-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Still there?</h2>
                  <p className="text-xs text-muted-foreground">You'll be signed out due to inactivity</p>
                </div>
              </div>

              {/* Countdown */}
              <div className="rounded-xl bg-muted/40 border border-border/50 px-4 py-3 mb-5 text-center">
                <p className="text-3xl font-black font-mono tracking-tight text-foreground">
                  {formatCountdown(countdown)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">until automatic sign-out</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleStayActive}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw className="size-3.5" />
                  I&apos;m still here
                </button>
                <button
                  onClick={doLogout}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
