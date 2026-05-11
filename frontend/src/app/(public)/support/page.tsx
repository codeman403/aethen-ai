"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { AethenLogo } from "@/components/ui/logo";
import { ArrowRight, CheckCircle2, Send, Loader2, ChevronDown, Check } from "lucide-react";

const REASONS = [
  { value: "General inquiry"    },
  { value: "Technical support"  },
  { value: "Bug report"         },
  { value: "Feature request"    },
  { value: "Enterprise / Sales" },
  { value: "Other"              },
];

function ReasonSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = REASONS.find(r => r.value === value) ?? REASONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-10 rounded-lg border border-black/[0.1] bg-white px-3 text-sm text-foreground flex items-center justify-between gap-2 hover:border-black/[0.18] focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9]/50 transition-all"
      >
        <span>{selected.value}</span>
        <ChevronDown
          className="size-4 text-black/35 shrink-0 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border border-black/[0.08] bg-white shadow-lg shadow-black/[0.06] overflow-hidden py-1">
          {REASONS.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => { onChange(r.value); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors hover:bg-black/[0.04]"
            >
              <span className={value === r.value ? "font-semibold text-foreground" : "text-black/60"}>
                {r.value}
              </span>
              {value === r.value && (
                <Check className="size-3.5 text-[#6D28D9] ml-auto shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type FormState = "idle" | "submitting" | "success" | "error";

export default function SupportPage() {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [reason,  setReason]  = useState<string>(REASONS[0].value);
  const [message, setMessage] = useState("");
  const [state,   setState]   = useState<FormState>("idle");
  const [errMsg,  setErrMsg]  = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setErrMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, reason, message }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setErrMsg(data.error ?? "Something went wrong. Please try again.");
        setState("error");
      } else {
        setState("success");
      }
    } catch {
      setErrMsg("Network error. Please check your connection and try again.");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Minimal nav */}
      <header className="flex items-center justify-between px-6 md:px-10 h-14 border-b border-black/[0.06] bg-background/80 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2.5 group">
          <AethenLogo size={26} />
          <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-[#6D28D9] to-[#059669] bg-clip-text text-transparent">
            Aethen AI
          </span>
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-black/50 hover:text-black/80 transition-colors"
        >
          Open Studio <ArrowRight className="size-3" />
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-xl">

          {state === "success" ? (
            /* ── Success state ─────────────────────────────────────── */
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 mb-6">
                <CheckCircle2 className="size-6 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground mb-3">
                Message sent.
              </h1>
              <p className="text-sm text-black/50 leading-relaxed mb-8 max-w-sm mx-auto">
                Thanks for reaching out, <span className="font-semibold text-black/70">{name}</span>.
                We&apos;ll get back to you at <span className="font-semibold text-black/70">{email}</span> within one business day.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setName(""); setEmail(""); setReason(REASONS[0].value);
                    setMessage(""); setState("idle");
                  }}
                  className="text-xs font-semibold text-black/45 hover:text-black/70 transition-colors underline underline-offset-2"
                >
                  Send another message
                </button>
                <span className="text-black/20">·</span>
                <Link
                  href="/"
                  className="text-xs font-semibold text-black/45 hover:text-black/70 transition-colors underline underline-offset-2"
                >
                  Back to home
                </Link>
              </div>
            </div>
          ) : (
            /* ── Contact form ──────────────────────────────────────── */
            <>
              {/* Header */}
              <div className="mb-8">
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-black/35 mb-3">
                  Support & Contact
                </p>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground mb-3">
                  How can we help?
                </h1>
                <p className="text-sm text-black/50 leading-relaxed">
                  Fill in the form and we&apos;ll get back to you within one business day.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      className="h-10 rounded-lg border border-black/[0.1] bg-white px-3 text-sm text-foreground placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9]/50 transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">
                      Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="h-10 rounded-lg border border-black/[0.1] bg-white px-3 text-sm text-foreground placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9]/50 transition-all"
                    />
                  </div>
                </div>

                {/* Reason */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">
                    Reason
                  </label>
                  <ReasonSelect value={reason} onChange={setReason} />
                </div>

                {/* Message */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">
                    Message <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Describe your question or issue in as much detail as helpful..."
                    className="rounded-lg border border-black/[0.1] bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9]/50 transition-all resize-none leading-relaxed"
                  />
                </div>

                {/* Error */}
                {state === "error" && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {errMsg}
                  </p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={state === "submitting"}
                  className="w-full h-11 rounded-xl bg-foreground text-background text-sm font-bold flex items-center justify-center gap-2 hover:bg-foreground/90 hover:scale-[1.01] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {state === "submitting" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      Send Message
                      <Send className="size-3.5" />
                    </>
                  )}
                </button>

              </form>

              {/* Footer links */}
              <div className="mt-8 pt-6 border-t border-black/[0.06] flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-black/35">
                <Link href="/" className="hover:text-black/55 transition-colors">← Home</Link>
                <Link href="/demo-agent" className="hover:text-black/55 transition-colors">Try Demo Agent</Link>
                <a href="https://github.com/codeman403/aethen-ai/issues" target="_blank" rel="noopener noreferrer" className="hover:text-black/55 transition-colors">GitHub Issues</a>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
