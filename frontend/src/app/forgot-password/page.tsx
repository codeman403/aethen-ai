"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AethenLogo } from "@/components/ui/logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("success");
    }
  };

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
            {status === "success" ? (
              <div className="text-center py-4">
                <div className="size-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MailCheck className="size-7 text-primary" />
                </div>
                <h1 className="text-xl font-semibold mb-2">Check your email</h1>
                <p className="text-sm text-muted-foreground mb-6">
                  We sent a password reset link to <strong>{email}</strong>. It expires in 1 hour.
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ArrowLeft className="size-4" />
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold mb-1">Reset your password</h1>
                <p className="text-sm text-muted-foreground mb-6">
                  Enter your email and we&apos;ll send you a reset link.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Email</label>
                    <input
                      type="email"
                      placeholder="jane@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={status === "loading"}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    />
                  </div>

                  {message && (
                    <p className="text-sm rounded-xl px-4 py-3 text-destructive bg-destructive/10 border border-destructive/20">
                      {message}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {status === "loading" ? (
                      <><Loader2 className="size-4 animate-spin" /> Sending…</>
                    ) : (
                      "Send Reset Link →"
                    )}
                  </button>
                </form>

                <Link
                  href="/login"
                  className="mt-6 flex items-center justify-center gap-2 text-sm text-primary hover:underline"
                >
                  <ArrowLeft className="size-4" />
                  Back to sign in
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
