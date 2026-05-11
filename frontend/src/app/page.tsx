"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion";
import { ArrowRight, Database, Activity, Menu, X, GitBranch, Workflow, CheckCircle2, Play, BrainCircuit, Search, Zap, Globe, BarChart3, Cpu, Server, Plug, ChevronDown, Wrench, ScanSearch } from "lucide-react";
import dynamic from "next/dynamic";
import { AethenLogo } from "../components/ui/logo";
import { createClient } from "@/lib/supabase/client";
import { MobileWarning } from "../components/MobileWarning";

const AnimatedPipeline = dynamic(
  () => import("../components/features/AnimatedPipeline").then(m => m.AnimatedPipeline),
  { ssr: false, loading: () => <div className="w-full h-48 rounded-2xl bg-black/[0.03] animate-pulse" /> }
);
const StackGrid = dynamic(
  () => import("../components/features/StackGrid").then(m => m.StackGrid),
  { ssr: false, loading: () => <div className="w-full h-48 rounded-2xl bg-black/[0.03] animate-pulse" /> }
);

const HeroAnimation = dynamic(
  () => import("../components/ui/hero-animation").then(m => m.HeroAnimation),
  { ssr: false, loading: () => <div className="flex-1 min-h-0 rounded-2xl bg-black/[0.03] animate-pulse" /> }
);

// Evaluated once after mount. Returns true only on mobile (<768px).
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(window.innerWidth < 768); }, []);
  return isMobile;
}

function ScrollProgress() {
  const isMobile = useIsMobile();
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  if (isMobile) return null;
  return <motion.div className="fixed top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 origin-left z-[100]" style={{ scaleX }} />;
}

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  if (isMobile) return <div ref={ref} className={className}>{children}</div>;
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 mb-10">
      <div className="w-5 h-px bg-black/12" />
      <span className="text-xs font-mono font-bold text-black/55 tracking-[0.18em] uppercase">{text}</span>
      <div className="w-5 h-px bg-black/12" />
    </div>
  );
}

function EvidenceTape({ color }: { color: string }) {
  return (
    <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-2xl pointer-events-none">
      <div className="absolute top-5 right-[-20px] w-24 h-[14px] rotate-45"
        style={{ background: `repeating-linear-gradient(90deg, ${color}55 0px, ${color}55 5px, transparent 5px, transparent 10px)` }} />
    </div>
  );
}

// ── Section-level scroll entrance ────────────────────────────────────────────
function SectionReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  if (isMobile) return <div ref={ref} className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 48, scale: 0.96 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.80, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ── Typewriter component ──────────────────────────────────────────────────────
function Typewriter({ text, className = "" }: { text: string; className?: string }) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (isMobile) { setDisplayed(text); return; }
    if (!isInView) return;
    let i = 0;
    const id = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [isInView, text, isMobile]);
  if (isMobile) return <span className={className}>{text}</span>;
  return <span ref={ref} className={className}>{displayed}<motion.span animate={{ opacity: [1,0] }} transition={{ duration: 0.5, repeat: Infinity }}>|</motion.span></span>;
}

function CaseFolder({ caseId, type, title, evidence, resolution, color, index }: {
  caseId: string; type: string; title: string;
  evidence: { label: string; text: string }[];
  resolution: string; color: string; index: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div className="relative cursor-default group h-full flex flex-col"
      initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      whileHover={{ y: -6 }}
      transition={{ delay: index * 0.09, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onHoverStart={() => setOpen(true)} onHoverEnd={() => setOpen(false)}>
      <motion.div className="relative rounded-2xl border bg-white overflow-hidden flex flex-col flex-1"
        style={{ borderColor: color + "15" }}
        animate={{ boxShadow: open ? `0 20px 40px rgba(0,0,0,0.12), 0 0 0 1px ${color}25` : "0 4px 20px rgba(0,0,0,0.06)" }}
        transition={{ duration: 0.22 }}>
        <EvidenceTape color={color} />
        {/* Header */}
        <div className="px-4 py-2.5 border-b flex items-center justify-between"
          style={{ borderColor: color + "15", backgroundColor: color + "06" }}>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase" style={{ color }}>{caseId}</span>
            <span className="w-1 h-1 rounded-full bg-black/[0.1]" />
            <span className="text-[11px] font-mono text-black/45 uppercase tracking-widest">{type}</span>
          </div>
          <div className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: color + "15", color }}>OPEN</div>
        </div>
        {/* Body */}
        <div className="p-4 md:p-5 flex flex-col flex-1">
          <h3 className="text-[15px] font-bold text-foreground mb-4 leading-snug pr-4">{title}</h3>
          <div className="space-y-2.5 mb-4 flex-1">
            {evidence.map((e, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 border"
                  style={{ color, borderColor: color + "30", backgroundColor: color + "08" }}>
                  {e.label}
                </span>
                <span className="text-[13px] text-black/55 leading-relaxed transition-all duration-500"
                  style={{ filter: open ? "none" : "blur(2px)", opacity: open ? 1 : 0.5 }}>{e.text}</span>
              </div>
            ))}
          </div>
          <motion.div className="pt-3.5 border-t" style={{ borderColor: color + "12" }}
            animate={{ opacity: open ? 1 : 0.5 }} transition={{ duration: 0.2 }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 className="size-3 shrink-0" style={{ color }} />
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest" style={{ color }}>Remediation</span>
            </div>
            <p className="text-[13px] text-black/55 leading-relaxed">{resolution}</p>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatCounter({ value, label, suffix = "", color }: { value: number; label: string; suffix?: string; color: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  useEffect(() => {
    if (!isInView) return;
    let s = 0;
    const step = () => { s += Math.ceil(value / 30); if (s >= value) { setCount(value); return; } setCount(s); requestAnimationFrame(step); };
    step();
  }, [isInView, value]);
  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl md:text-4xl font-black tabular-nums font-mono" style={{ color }}>{count}{suffix}</div>
      <p className="text-xs font-mono text-black/55 mt-2 uppercase tracking-[0.14em]">{label}</p>
    </div>
  );
}

const NAV_ITEMS = [
  { label: "How it works", href: "#howitworks" },
  { label: "Pipeline",     href: "#pipeline" },
  { label: "Reports",      href: "#cases" },
  { label: "Stack",        href: "#stack" },
  { label: "FAQ",          href: "#faq" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: Plug,
    color: "#6D28D9",
    title: "Connect your traces",
    body: "Plug in your Langfuse or LangSmith source using API keys. Aethen pulls agent execution sessions in real time — no code changes to your agent required.",
  },
  {
    step: "02",
    icon: BrainCircuit,
    color: "#0891B2",
    title: "Diagnose the failure",
    body: "The LangGraph pipeline classifies the failure type, runs Graph RAG across Neo4j causal chains, and retrieves semantic evidence from pgvector to pinpoint the root cause.",
  },
  {
    step: "03",
    icon: Wrench,
    color: "#059669",
    title: "Get the fix",
    body: "Receive a ranked list of findings with specific, actionable remediation steps — memory mismatches, tool misfires, hallucination sources, or knowledge gaps — all explained.",
  },
];

const FAQ_ITEMS = [
  {
    q: "What types of AI agent failures does Aethen detect?",
    a: "Aethen covers four failure categories: Memory failures (wrong or stale retrieval), Tool misfires (bad parameters, permission errors, timeouts), Hallucinations (LLM output unsupported by source documents), and Blind spots (topics absent from the knowledge base). Each has a dedicated analysis module.",
  },
  {
    q: "Which observability platforms does Aethen support?",
    a: "Aethen integrates natively with Langfuse and LangSmith. You register your API credentials once in the Integrations page and Aethen handles incremental trace pulls automatically — including via Vercel Cron in production.",
  },
  {
    q: "How accurate is the failure diagnosis?",
    a: "In internal evaluation on 100 golden sessions, Aethen achieved 100% failure classification accuracy and an 83% LLM judge score on diagnosis quality. Accuracy improves as you ingest more sessions and the graph model builds richer causal patterns.",
  },
  {
    q: "Is my agent trace data stored permanently?",
    a: "Session data is stored in Aethen's managed Postgres instance. PII redaction is enabled by default before any data reaches storage. You can delete individual sessions or wipe your data at any time.",
  },
  {
    q: "How long does a diagnosis take?",
    a: "End-to-end — from trace ingestion to a ranked remediation list — takes roughly 25 seconds on average. The LangGraph pipeline runs classify → retrieve → rerank → analyze → synthesize in sequence, optimised for latency.",
  },
  {
    q: "Can Aethen work with any LLM provider?",
    a: "Yes. You bring your own API keys for Anthropic and OpenAI, configured once in LLM Settings. The model running inside your AI agent doesn't matter — Aethen diagnoses at the trace level regardless of which LLM your agent uses.",
  },
  {
    q: "How is Aethen different from reading logs in Langfuse or LangSmith?",
    a: "Raw observability tools show you what happened. Aethen tells you why it failed and what to fix. It layers Graph RAG (causal chain traversal), semantic search (pgvector), and a multi-module LangGraph state machine on top of raw traces to produce structured root-cause analysis.",
  },
];

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  useEffect(() => {
    // Defer auth check so it never blocks the initial paint
    const id = setTimeout(() => {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        setIsAuthenticated(!!session);
        setUserEmail(session?.user?.email ?? null);
        setUserName(session?.user?.user_metadata?.full_name ?? session?.user?.user_metadata?.name ?? null);
      });
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUserEmail(null);
    setUserName(null);
    setUserMenuOpen(false);
  }

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-menu]")) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [userMenuOpen]);

  useEffect(() => {
    const sectionIds = ["howitworks", "pipeline", "cases", "stack", "faq"];

    // Read offsetTop fresh each frame — avoids stale values caused by lazy
    // components (StackGrid, AnimatedPipeline) reflowing the page after mount.
    let rafPending = false;
    const onScroll = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const y = window.scrollY;
        setIsScrolled(y > 20);
        let current = "";
        for (const id of sectionIds) {
          const top = document.getElementById(id)?.offsetTop ?? 0;
          if (top > 0 && y >= top - 120) current = id;
        }
        setActiveSection(prev => prev === current ? prev : current);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-purple-500/10 selection:text-purple-700">
      <MobileWarning />
      <ScrollProgress />
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-background" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_25%,#000_20%,transparent_100%)]" />
        <div className="absolute w-[700px] h-[700px] rounded-full blur-[200px] opacity-[0.06]"
          style={{ left: "-10%", top: "-5%", background: "radial-gradient(circle, rgba(59,130,246,0.6), transparent)" }} />
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[180px] opacity-[0.05]"
          style={{ right: "-5%", top: "45%", background: "radial-gradient(circle, rgba(124,58,237,0.6), transparent)" }} />
        <div className="absolute w-[400px] h-[400px] rounded-full blur-[160px] opacity-[0.04]"
          style={{ left: "35%", bottom: "5%", background: "radial-gradient(circle, rgba(16,185,129,0.6), transparent)" }} />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl">
        <div className={`absolute inset-0 bg-background/90 border-b border-black/[0.07] transition-opacity duration-300 ${isScrolled ? "opacity-100" : "opacity-0"}`} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center group/logo"
              onClick={e => { if (window.location.pathname === '/') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}>
              <div className="group-hover/logo:scale-110 transition-transform duration-200 shrink-0">
                <AethenLogo size={32} />
              </div>
              {/* "Aethen AI" — smooth CSS collapse on scroll */}
              <div
                className="overflow-hidden whitespace-nowrap"
                style={{
                  maxWidth: isScrolled ? '0px' : '160px',
                  opacity: isScrolled ? 0 : 1,
                  marginLeft: isScrolled ? '0px' : '12px',
                  transition: 'max-width 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease, margin-left 0.45s cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                <span className="font-bold tracking-tight bg-gradient-to-r from-[#6D28D9] to-[#059669] bg-clip-text text-transparent">Aethen AI</span>
              </div>
            </Link>
            {/* Badge — smooth CSS collapse on scroll */}
            <div
              className="overflow-hidden whitespace-nowrap hidden sm:block"
              style={{
                maxWidth: isScrolled ? '0px' : '280px',
                opacity: isScrolled ? 0 : 1,
                marginLeft: isScrolled ? '0px' : '12px',
                transition: 'max-width 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease, margin-left 0.45s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.07]">
                <motion.div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }} />
                <span className="text-xs font-mono font-bold text-red-600 tracking-[0.14em]">Agent Reliability Studio</span>
              </div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(item => {
              const sectionId = item.href.replace("#", "");
              const isActive = activeSection === sectionId;
              return (
                <a key={item.label} href={item.href}
                  className={`relative px-4 py-2 text-sm font-sans rounded-lg transition-all duration-200 ${isActive ? "text-black/80 bg-black/[0.05]" : "text-black/45 hover:text-black/75 hover:bg-black/[0.04]"}`}>
                  {item.label}
                  {isActive && (
                    <motion.div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-black/40"
                      layoutId="nav-dot" transition={{ type: "spring", bounce: 0.3, duration: 0.4 }} />
                  )}
                </a>
              );
            })}
            <div className="w-px h-4 bg-black/10 mx-3" />
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {/* User avatar + dropdown */}
                <div className="relative" data-user-menu>
                  <button
                    onClick={() => setUserMenuOpen(o => !o)}
                    className="size-8 rounded-full text-white text-xs font-black flex items-center justify-center hover:opacity-80 transition-opacity ring-2 ring-black/10 ring-offset-1 overflow-hidden"
                    style={{ backgroundColor: "#0f0f0f" }}
                    title={userName ?? userEmail ?? "Account"}
                  >
                    {(userName?.[0] ?? userEmail?.[0] ?? "U").toUpperCase()}
                  </button>
                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-black/[0.08] bg-white shadow-lg shadow-black/[0.08] overflow-hidden z-50"
                      >
                        {userEmail && (
                          <div className="px-3 py-2.5 border-b border-black/[0.06]">
                            <p className="text-[11px] font-mono text-black/35 truncate">{userEmail}</p>
                          </div>
                        )}
                        <div className="p-1">
                          <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
                          >
                            Sign out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <Link href="/overview" className="group/cta flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-all shadow-sm">
                  Dashboard <ArrowRight className="size-3.5 group-hover/cta:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="px-4 py-2 text-sm font-semibold text-black/60 hover:text-black/85 transition-colors">
                  Sign In
                </Link>
                <Link href="/overview" className="group/cta flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-all shadow-sm">
                  Open Studio <ArrowRight className="size-3.5 group-hover/cta:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            )}
          </nav>
          <button className="md:hidden p-2 text-black/45 hover:text-black/80" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <motion.div animate={{ rotate: mobileMenuOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </motion.div>
          </button>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              className="relative md:hidden absolute top-full left-0 w-full bg-background/97 backdrop-blur-xl border-b border-black/[0.06] overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="p-5 flex flex-col gap-1">
                {NAV_ITEMS.map((item, i) => (
                  <motion.a key={item.label} href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm p-3 rounded-lg text-black/50 hover:text-black/80 hover:bg-black/[0.04] transition-colors"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}>
                    {item.label}
                  </motion.a>
                ))}
                <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }} className="flex flex-col gap-2 mt-2">
                  {!isAuthenticated && (
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}
                      className="text-sm font-semibold text-black/60 p-3 rounded-xl hover:bg-black/[0.04] transition-colors">
                      Sign In
                    </Link>
                  )}
                  <Link href="/overview" onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-bold text-background p-3 rounded-xl flex items-center gap-2 bg-foreground">
                    {isAuthenticated ? "Dashboard" : "Open Studio"} <ArrowRight className="size-4" />
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="relative z-10">
        {/* ── Hero — full viewport, animation always visible on load ── */}
        <section className="flex flex-col px-4 sm:px-6 min-h-screen">
          <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 pt-[72px] md:pt-[88px] pb-4">

            {/* Headline + CTAs — compact row */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-6">
              <motion.h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[0.92]"
                initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.65 }}>
                <span className="block text-foreground">Your AI agents fail.</span>
                <span className="block bg-gradient-to-br from-foreground via-purple-600 to-blue-600 bg-clip-text text-transparent">Aethen finds the fix.</span>
              </motion.h1>
              <motion.div className="flex flex-row gap-2.5 shrink-0"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <Link href={isAuthenticated ? "/traces" : "/login"} className="group inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 hover:scale-[1.02] transition-all duration-200 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
                  Run Diagnosis <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link href="/demo-agent" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-black/[0.1] text-sm font-semibold text-black/55 hover:text-black/80 hover:border-black/[0.18] hover:bg-black/[0.03] transition-all duration-200">
                  <Play className="size-3.5 text-purple-500" /> Demo
                </Link>
              </motion.div>
            </div>

            {/* ── Animation fills the remaining viewport height ── */}
            <motion.div className="flex-1 min-h-0"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.65 }}>
              <HeroAnimation />
            </motion.div>

          </div>
        </section>

        {/* Full-width stack ticker */}
        <motion.div className="border-t border-black/[0.06] pt-20 pb-10"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          <div className="relative w-full overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex gap-4 w-max" style={{ animation: "stack-scroll 24s linear infinite" }}>
              {/* Two identical copies — when the first scrolls off, the second
                  seamlessly takes over. -50% translate = exactly one copy width. */}
              {[...Array(2)].flatMap((_, copy) =>
                [
                  { label: "LangGraph",     color: "#7C3AED", icon: <Workflow      className="size-5" /> },
                  { label: "LangChain",     color: "#6D28D9", icon: <GitBranch     className="size-5" /> },
                  { label: "Graph RAG",     color: "#059669", icon: <Search        className="size-5" /> },
                  { label: "Neo4j",         color: "#2563EB", icon: <GitBranch     className="size-5" /> },
                  { label: "pgvector",      color: "#10B981", icon: <Database      className="size-5" /> },
                  { label: "Cohere Rerank", color: "#047857", icon: <BarChart3     className="size-5" /> },
                  { label: "Langfuse",      color: "#D97706", icon: <Activity      className="size-5" /> },
                  { label: "LangSmith",     color: "#B45309", icon: <Cpu           className="size-5" /> },
                  { label: "LLM",           color: "#DC2626", icon: <BrainCircuit  className="size-5" /> },
                  { label: "Postgres",      color: "#1D4ED8", icon: <Server        className="size-5" /> },
                  { label: "FastAPI",       color: "#0284C7", icon: <Zap           className="size-5" /> },
                  { label: "Next.js 14",    color: "#111827", icon: <Globe         className="size-5" /> },
                ].map((item, i) => (
                  <div key={`${copy}-${i}`}
                    aria-hidden={copy === 1}
                    className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl whitespace-nowrap shrink-0 cursor-default group/chip transition-all duration-300 hover:scale-[1.06]"
                    style={{ background: `linear-gradient(135deg, ${item.color}15, ${item.color}08)` }}>
                    <span className="transition-transform duration-300 group-hover/chip:scale-110" style={{ color: item.color }}>{item.icon}</span>
                    <span className="text-sm font-mono font-semibold" style={{ color: item.color }}>{item.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <style>{`
            @keyframes stack-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </motion.div>

        {/* ── How it Works ─────────────────────────────────────────────── */}
        <section id="howitworks" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <SectionReveal className="max-w-7xl mx-auto">
            <div className="mb-12 md:mb-14">
              <Reveal><SectionLabel text="How it Works · from trace to fix in three steps" /></Reveal>
              <div className="grid md:grid-cols-2 gap-8 md:gap-10">
                <Reveal delay={0.1}>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    Diagnose AI failures<br /><span className="text-black/35">in ~25 seconds.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex items-center">
                    <p className="text-base md:text-[17px] text-black/55 leading-relaxed">
                      <Typewriter text="Connect your observability source, and Aethen's LangGraph pipeline automatically classifies failures, traces causal chains through the graph, and surfaces ranked remediations — no manual log parsing required." />
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-5 md:gap-6">
              {HOW_IT_WORKS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Reveal key={i} delay={i * 0.12}>
                    <motion.div
                      className="group relative rounded-2xl border bg-white overflow-hidden flex flex-col h-full"
                      style={{ borderColor: item.color + "18" }}
                      whileHover={{ y: -6, boxShadow: `0 20px 40px rgba(0,0,0,0.10), 0 0 0 1px ${item.color}28` }}
                      initial={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
                      transition={{ duration: 0.22 }}
                    >
                      {/* Coloured header band */}
                      <div className="px-5 py-3 border-b flex items-center justify-between"
                        style={{ borderColor: item.color + "18", backgroundColor: item.color + "07" }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold tracking-[0.18em] uppercase" style={{ color: item.color }}>
                            STEP {item.step}
                          </span>
                        </div>
                        <div className="flex items-center justify-center size-7 rounded-lg border"
                          style={{ borderColor: item.color + "28", backgroundColor: item.color + "0D" }}>
                          <Icon className="size-3.5" style={{ color: item.color }} />
                        </div>
                      </div>

                      {/* Body */}
                      <div className="p-5 md:p-6 flex flex-col flex-1 relative overflow-hidden">
                        {/* Watermark step number */}
                        <span
                          className="absolute -right-3 -bottom-4 text-[88px] font-black font-mono leading-none select-none pointer-events-none"
                          style={{ color: item.color + "09" }}
                        >
                          {item.step}
                        </span>

                        {/* Icon */}
                        <div className="mb-4 flex items-center justify-center size-12 rounded-xl border"
                          style={{ borderColor: item.color + "25", backgroundColor: item.color + "0C" }}>
                          <Icon className="size-6" style={{ color: item.color }} />
                        </div>

                        <h3 className="text-[17px] font-bold text-foreground mb-2 leading-snug">{item.title}</h3>
                        <p className="text-sm text-black/55 leading-relaxed flex-1 relative z-10">{item.body}</p>

                        {/* Bottom accent bar */}
                        <div className="mt-5 pt-4 border-t flex items-center gap-2"
                          style={{ borderColor: item.color + "14" }}>
                          <div className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-[11px] font-mono text-black/35 uppercase tracking-[0.14em]">
                            {i === 0 ? "Source connection" : i === 1 ? "LangGraph pipeline" : "Remediation output"}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </Reveal>
                );
              })}
            </div>
          </SectionReveal>
        </section>

        <section id="pipeline" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <SectionReveal className="max-w-7xl mx-auto">
            <div className="mb-12 md:mb-14">
              <Reveal><SectionLabel text="Diagnostic Pipeline · from trace to remediation in 25 seconds" /></Reveal>
              <div className="grid md:grid-cols-2 gap-8 md:gap-10">
                <Reveal delay={0.1}>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    From trace<br /><span className="text-black/40">to remediation.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex items-center">
                    <p className="text-base md:text-[17px] text-black/55 leading-relaxed">
                      <Typewriter text="A LangGraph state machine routes each failure through the correct specialist module automatically. No manual triage, no guesswork." />
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
            <div className="w-full overflow-x-auto flex justify-center -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="min-w-[640px] sm:min-w-0 w-full">
                <AnimatedPipeline />
              </div>
            </div>
          </SectionReveal>
        </section>

        <section id="cases" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <SectionReveal className="max-w-7xl mx-auto">
            <div className="mb-12 md:mb-14">
              <Reveal><SectionLabel text="Failure Reports · four incident types Aethen diagnoses" /></Reveal>
              <div className="grid md:grid-cols-2 gap-8 md:gap-10">
                <Reveal delay={0.1}>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    Every failure<br /><span className="text-black/40">leaves a signal.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex items-end">
                    <p className="text-base md:text-[17px] text-black/55 leading-relaxed">
                      <Typewriter text="Unlike observability tools that surface logs, Aethen reconstructs the failure trace - linking each incident back to its structural root cause across sessions." />
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 items-stretch">
              <CaseFolder caseId="HAL-01" type="Hallucination" color="#EF4444" index={0}
                title="LLM fabricated a fact not present in any retrieved chunk"
                evidence={[
                  { label: "llm_call",   text: "Response claimed Project Olympus launched Q2" },
                  { label: "retrieval",  text: "Chunk #42 retrieved — topic: Q1 roadmap only" },
                  { label: "gap",        text: "No Q2 source exists in vector store" },
                ]}
                resolution="Knowledge gap in Product Timeline cluster. Re-index 3 documents to cover Q2 scope." />
              <CaseFolder caseId="TOOL-02" type="Tool Misfire" color="#F59E0B" index={1}
                title="API tool entered infinite retry loop on malformed parameters"
                evidence={[
                  { label: "tool_call",  text: "get_order_status — attempt 1 of 47" },
                  { label: "param_err",  text: "order_id passed as integer, API expects string" },
                  { label: "schema",     text: "No type validation in tool definition" },
                ]}
                resolution="Add schema validation layer. Tool definition updated with explicit type coercion." />
              <CaseFolder caseId="MEM-03" type="Memory Fault" color="#7C3AED" index={2}
                title="Agent forgot user constraints set 8 turns earlier in session"
                evidence={[
                  { label: "session",    text: "Turn 3: user said never recommend competitor products" },
                  { label: "llm_call",   text: "Turn 11: agent recommended CompetitorX" },
                  { label: "ctx_drop",   text: "Context window compression dropped turns 3–6" },
                ]}
                resolution="Inject critical constraints as system-level memory. Implement constraint pinning." />
              <CaseFolder caseId="BSP-04" type="Blind Spot" color="#10B981" index={3}
                title="47 users failed on refund policy — topic absent from knowledge base"
                evidence={[
                  { label: "query",      text: "47 queries across 19 sessions returned 'I do not know'" },
                  { label: "score",      text: "Retrieval similarity: 0.31 — below 0.55 threshold" },
                  { label: "namespace",  text: "Zero relevant chunks in pgvector" },
                ]}
                resolution="Root cause: refund policy docs never ingested. Gap closed, reliability +53%." />
            </div>
            <Reveal className="mt-14 md:mt-16">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 p-6 md:p-8 rounded-2xl border border-black/[0.06] bg-white">
                <StatCounter value={7} label="Node Types" suffix="+" color="#3B82F6" />
                <StatCounter value={12} label="Rel. Types" suffix="+" color="#7C3AED" />
                <StatCounter value={25} label="Avg MTTR sec" color="#F59E0B" />
                <StatCounter value={98} label="Reliability Target" suffix="%" color="#10B981" />
              </div>
            </Reveal>
          </SectionReveal>
        </section>

        <section id="stack" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <SectionReveal className="max-w-7xl mx-auto">
            <div className="mb-14 md:mb-16">
              <Reveal><SectionLabel text="Diagnostic Stack · infrastructure behind every diagnosis" /></Reveal>
              <div className="grid md:grid-cols-2 gap-8 md:gap-10">
                <Reveal delay={0.1}>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    Built for<br /><span className="text-black/40">trace precision.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex items-center">
                    <p className="text-base md:text-[17px] text-black/55 leading-relaxed">
                      <Typewriter text="Every component chosen for a reason. Graph databases for causal chains. Vector search for semantic evidence. LangGraph for deterministic diagnostic routing." />
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
            <StackGrid />
          </SectionReveal>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section className="py-12 md:py-16 px-4 sm:px-6">
          <SectionReveal className="max-w-7xl mx-auto">
            <div className="mb-12 md:mb-14">
              <Reveal><SectionLabel text="Take Action · stop guessing, start knowing" /></Reveal>
              <div className="grid md:grid-cols-2 gap-8 md:gap-10">
                <Reveal delay={0.1}>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    Your agents deserve<br /><span className="text-black/40">better than guesswork.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex items-center">
                    <p className="text-base md:text-[17px] text-black/55 leading-relaxed">
                      <Typewriter text="Open Aethen, connect your Langfuse or LangSmith source using API keys and watch the causal graph build in real time." />
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
            <Reveal delay={0.35}>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href={isAuthenticated ? "/overview" : "/login"} className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl font-bold text-base bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all shadow-[0_4px_28px_rgba(0,0,0,0.14)]">
                  Open Studio <ArrowRight className="size-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl border border-black/[0.1] text-base font-semibold text-black/55 hover:text-black/75 hover:bg-black/[0.03] transition-all duration-200">
                  Replay the Diagnosis
                </a>
              </div>
            </Reveal>
          </SectionReveal>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section id="faq" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <SectionReveal className="max-w-7xl mx-auto">
            <div className="mb-10 md:mb-12">
              <Reveal><SectionLabel text="FAQ · common questions answered" /></Reveal>
              <div className="grid md:grid-cols-2 gap-8 md:gap-10">
                <Reveal delay={0.1}>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
                    Frequently asked<br /><span className="text-black/35">questions.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.2}>
                  <div className="flex items-center">
                    <p className="text-base md:text-[17px] text-black/55 leading-relaxed">
                      <Typewriter text="Everything you need to know about Aethen — from how the diagnosis pipeline works to data privacy and integrations." />
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
            <div className="space-y-2">
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = faqOpen === i;
                return (
                  <Reveal key={i} delay={i * 0.04}>
                    <div className={`rounded-xl border transition-colors duration-200 overflow-hidden ${isOpen ? "border-black/[0.10] bg-black/[0.015]" : "border-black/[0.07] bg-white hover:border-black/[0.10]"}`}>
                      <button
                        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                        onClick={() => setFaqOpen(isOpen ? null : i)}
                      >
                        <span className="text-sm font-semibold text-foreground leading-snug">{item.q}</span>
                        <ChevronDown className={`size-4 text-black/40 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key="answer"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <p className="px-5 pb-4 text-sm text-black/55 leading-relaxed">{item.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </Reveal>
                );
              })}
            </div>
            <Reveal delay={0.2}>
              <div className="mt-8">
                <p className="text-sm text-black/45 mb-2">Still have questions?</p>
                <Link href="/support" className="inline-flex items-center gap-2 text-sm font-semibold text-[#6D28D9] hover:text-[#5B21B6] transition-colors">
                  Contact us →
                </Link>
              </div>
            </Reveal>
          </SectionReveal>
        </section>
      </main>

      <footer className="border-t border-black/[0.06] bg-white/50 pt-14 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-10 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <AethenLogo size={32} />
                <span className="font-bold tracking-tight bg-gradient-to-r from-[#6D28D9] to-[#059669] bg-clip-text text-transparent">Aethen AI</span>
              </div>
              <p className="text-xs font-mono text-black/40 leading-relaxed">Agent Reliability Studio.<br />Ingest. Diagnose. Recommend Fix.</p>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-6">
              {[
                { heading: "Product", links: [
                  { label: "How it Works", href: "#howitworks" },
                  { label: "Pipeline",     href: "#pipeline" },
                  { label: "Reports",      href: "#cases" },
                  { label: "Stack",        href: "#stack" },
                  { label: "Demo Agent",   href: "/demo-agent" },
                ]},
                { heading: "Resources", links: [
                  { label: "FAQ",          href: "#faq" },
                  { label: "API Reference",href: "/docs" },
                ]},
                { heading: "Legal", links: [
                  { label: "Privacy Policy", href: "/privacy" },
                  { label: "Terms of Service", href: "/terms" },
                  { label: "Support",        href: "/support" },
                ]},
              ].map(col => (
                <div key={col.heading}>
                  <div className="text-xs font-mono font-bold text-black/50 tracking-[0.15em] uppercase mb-3">{col.heading}</div>
                  <ul className="space-y-2">
                    {col.links.map(l => (
                      <li key={l.label}>
                        <Link href={l.href} className="text-xs font-mono text-black/38 hover:text-black/65 transition-colors">{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-black/[0.05] flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs font-mono text-black/50">&copy; {new Date().getFullYear()} Aethen AI. All rights reserved.</p>
            <div className="flex gap-5">
              <Link href="/privacy" className="text-xs font-mono text-black/50 hover:text-black/55 transition-colors">Privacy</Link>
              <Link href="/terms" className="text-xs font-mono text-black/50 hover:text-black/55 transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
