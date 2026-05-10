"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AethenLogo } from "@/components/ui/logo";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "invalid">("idle");
  const [message, setMessage] = useState("");

  const supabase = createClient();

  useEffect(() => {
    // Exchange the one-time code from Supabase email link for a session
    const code = searchParams.get("code");
    if (!code) {
      setStatus("invalid");
      setMessage("Invalid or expired reset link. Please request a new one.");
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setStatus("invalid");
        setMessage("This reset link has expired or already been used. Please request a new one.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setStatus("error");
      setMessage("Password must be at least 8 characters.");
      return;
    }

    setStatus("loading");
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("success");
      setMessage("Password updated successfully. Redirecting to sign in…");
      setTimeout(() => router.push("/login"), 2000);
    }
  };

  const inputCls =
    "w-full px-4 py-3 pr-10 rounded-xl bg-white/5 border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <div className="flex-grow flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <Link href="/" className="flex items-center gap-3 mb-8 w-fit mx-auto">
            <AethenLogo size={32} />
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#6D28D9] to-[#059669] bg-clip-text text-transparent">
              Aethen AI
            </span>
          </Link>

          <div className="bg-card/80 backdrop-blur-md border border-border/60 rounded-2xl p-8 shadow-xl shadow-black/10">
            <h1 className="text-xl font-semibold mb-1">Set a new password</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Choose a strong password for your account.
            </p>

            {status === "invalid" ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm rounded-xl px-4 py-3 text-destructive bg-destructive/10 border border-destructive/20">
                  {message}
                </p>
                <Link
                  href="/forgot-password"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ArrowLeft className="size-4" />
                  Request a new reset link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      disabled={status === "success"}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">At least 8 characters.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={8}
                      disabled={status === "success"}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirm ? "Hide" : "Show"}
                    >
                      {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {message && (
                  <p
                    className={`text-sm rounded-xl px-4 py-3 ${
                      status === "error"
                        ? "text-destructive bg-destructive/10 border border-destructive/20"
                        : "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20"
                    }`}
                  >
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "loading" || status === "success"}
                  className="w-full py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-1"
                >
                  {status === "loading" ? (
                    <><Loader2 className="size-4 animate-spin" /> Updating…</>
                  ) : status === "success" ? (
                    "Password Updated ✓"
                  ) : (
                    "Update Password →"
                  )}
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
