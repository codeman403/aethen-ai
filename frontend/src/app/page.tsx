"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion";
import { ArrowRight, Database, Activity, Menu, X, GitBranch, Workflow, CheckCircle2, Play, BrainCircuit, Search, Zap, Globe, BarChart3, Cpu, Layers, Server } from "lucide-react";
import { HeroAnimation } from "../components/ui/hero-animation";

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return <motion.div className="fixed top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 origin-left z-[100]" style={{ scaleX }} />;
}

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, y: 28 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}>
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

// ── Typewriter component ──────────────────────────────────────────────────────
function Typewriter({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!isInView) return;
    let i = 0;
    const id = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [isInView, text]);
  return <span ref={ref} className={className}>{displayed}<motion.span animate={{ opacity: [1,0] }} transition={{ duration: 0.5, repeat: Infinity }}>|</motion.span></span>;
}

function CaseFolder({ caseId, type, title, evidence, resolution, color, index }: {
  caseId: string; type: string; title: string;
  evidence: { label: string; text: string }[];
  resolution: string; color: string; index: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div className="relative cursor-default group"
      initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ delay: index * 0.09, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onHoverStart={() => setOpen(true)} onHoverEnd={() => setOpen(false)}>
      <div className="absolute inset-0 rounded-2xl border -translate-y-1.5 translate-x-1.5"
        style={{ borderColor: color + "20", backgroundColor: color + "06" }} />
      <motion.div className="relative rounded-2xl border bg-white overflow-hidden"
        style={{ borderColor: color + "15" }}
        animate={{ y: open ? -6 : 0, boxShadow: open ? `0 20px 40px rgba(0,0,0,0.12), 0 0 0 1px ${color}25` : "0 4px_20px rgba(0,0,0,0.06)" }}
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
        <div className="p-4 md:p-5">
          <h3 className="text-[15px] font-bold text-foreground mb-4 leading-snug pr-4">{title}</h3>
          <div className="space-y-2.5 mb-4">
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

// ── Animated circular pipeline ───────────────────────────────────────────────

const PIPELINE_STAGES = [
  { num: "01", label: "Ingest",          sublabel: "Langfuse hooks capture every LLM call and retrieval", color: "#3B82F6", stat: "10K+ traces/min", Icon: Activity    },
  { num: "02", label: "Classify",        sublabel: "Heuristic classifiers route to specialist modules",    color: "#EF4444", stat: "4 failure types",  Icon: BrainCircuit },
  { num: "03", label: "Graph Query",     sublabel: "Neo4j traversal maps causal chains across sessions",   color: "#7C3AED", stat: "Cross-trace",       Icon: GitBranch    },
  { num: "04", label: "Vector Evidence", sublabel: "Pinecone + Cohere Rerank synthesizes evidence",        color: "#F59E0B", stat: "Rerank v3",         Icon: Database     },
  { num: "05", label: "Recommend Fix",   sublabel: "Confidence-scored remediation with reliability delta", color: "#10B981", stat: "−80% MTTR",        Icon: CheckCircle2 },
];

const STAGE_DURATION = 2200; // ms per stage

const N = PIPELINE_STAGES.length;
const CX = 250, CY = 250, R = 186;
const VBSIZE = 500;
const CIRC = 2 * Math.PI * R;

function stagePos(i: number) {
  const angle = -Math.PI / 2 + i * (2 * Math.PI / N);
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
}

function AnimatedPipeline() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0); // 0→1 within current stage

  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = (now - start) % (STAGE_DURATION * N);
      const stageIdx = Math.min(Math.floor(elapsed / STAGE_DURATION) % N, N - 1);
      const stageProgress = (elapsed % STAGE_DURATION) / STAGE_DURATION;
      setActive(stageIdx);
      setProgress(stageProgress);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Arc fill: how many full stages + partial current stage
  const filledAngle = (active + progress) / N; // 0→1 of full circle
  const dashOffset = CIRC * (1 - filledAngle);

  // Moving dot position on the circle
  const dotAngle = -Math.PI / 2 + (active + progress) * (2 * Math.PI / N);
  const dotX = CX + R * Math.cos(dotAngle);
  const dotY = CY + R * Math.sin(dotAngle);

  const activeStage = PIPELINE_STAGES[active % N] ?? PIPELINE_STAGES[0];

  return (
    <div className="flex flex-col lg:flex-row items-center gap-16 w-full max-w-5xl mx-auto px-4">
      {/* Circle diagram */}
      <div className="relative shrink-0" style={{ width: VBSIZE * 0.96, height: VBSIZE * 0.96 }}>
        <svg
          viewBox={`0 0 ${VBSIZE} ${VBSIZE}`}
          className="w-full h-full"
          style={{ overflow: "visible" }}
        >
          {/* Subtle radial bg glow */}
          <defs>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={activeStage.color} stopOpacity="0.08" />
              <stop offset="100%" stopColor={activeStage.color} stopOpacity="0" />
            </radialGradient>
            <filter id="dotGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Background glow circle */}
          <circle cx={CX} cy={CY} r={R + 40} fill="url(#centerGlow)" />

          {/* Track ring */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke="rgba(0,0,0,0.07)"
            strokeWidth={2}
          />

          {/* Filled arc — clockwise from top */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={activeStage.color}
            strokeWidth={3}
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: "stroke 0.4s ease", opacity: 0.7 }}
          />

          {/* Moving dot */}
          <circle
            cx={dotX} cy={dotY} r={6}
            fill={activeStage.color}
            filter="url(#dotGlow)"
            style={{ transition: "fill 0.4s ease" }}
          />
          <circle
            cx={dotX} cy={dotY} r={3.5}
            fill="white"
          />

          {/* Connector spokes (faint lines from center to nodes) */}
          {PIPELINE_STAGES.map((_, i) => {
            const p = stagePos(i);
            return (
              <line key={i}
                x1={CX} y1={CY} x2={p.x} y2={p.y}
                stroke="rgba(0,0,0,0.04)" strokeWidth={1}
              />
            );
          })}
        </svg>

        {/* Stage nodes — absolutely positioned over SVG */}
        {PIPELINE_STAGES.map((stage, i) => {
          const p = stagePos(i);
          const pct = { left: `${(p.x / VBSIZE) * 100}%`, top: `${(p.y / VBSIZE) * 100}%` };
          const isActive = active === i;
          return (
            <div
              key={stage.num}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={pct}
            >
              <motion.div
                className="w-[88px] h-[88px] rounded-full flex items-center justify-center border-[2.5px] bg-white relative"
                animate={{
                  borderColor: isActive ? stage.color : stage.color + "40",
                  boxShadow: isActive ? `0 0 36px ${stage.color}55, 0 0 0 8px ${stage.color}12` : `0 4px 16px rgba(0,0,0,0.10)`,
                  scale: isActive ? 1.13 : 1,
                }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <stage.Icon size={36} style={{ color: isActive ? stage.color : stage.color + "80" }} />
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    animate={{ opacity: [0.45, 0], scale: [1, 1.9] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                    style={{ border: `2px solid ${stage.color}` }}
                  />
                )}
              </motion.div>
              {/* Label chip */}
              <motion.div
                className="mt-2.5 px-3.5 py-1 rounded-full text-[13px] font-bold tracking-wide whitespace-nowrap"
                animate={{
                  backgroundColor: isActive ? stage.color + "18" : "rgba(0,0,0,0.05)",
                  color: isActive ? stage.color : "rgba(0,0,0,0.50)",
                }}
                transition={{ duration: 0.3 }}
              >
                {stage.label}
              </motion.div>
            </div>
          );
        })}

        {/* Center info panel */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="flex flex-col items-center text-center px-6"
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div className="text-[12px] font-mono font-bold tracking-[0.22em] uppercase mb-1.5"
                style={{ color: activeStage.color + "99" }}>
                {activeStage.num}
              </div>
              <div className="text-xl font-bold text-black/80 mb-1">{activeStage.label}</div>
              <div className="text-[13px] font-mono font-bold" style={{ color: activeStage.color }}>
                {activeStage.stat}
              </div>
              {/* Progress dots */}
              <div className="flex gap-1.5 mt-4">
                {PIPELINE_STAGES.map((s, i) => (
                  <motion.div key={i} className="w-2 h-2 rounded-full"
                    animate={{ backgroundColor: i === active ? s.color : "rgba(0,0,0,0.12)", scale: i === active ? 1.4 : 1 }}
                    transition={{ duration: 0.25 }}
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Stage detail cards stacked on the right */}
      <div className="flex flex-col gap-4 flex-1 min-w-0 self-center">
        {PIPELINE_STAGES.map((stage, i) => {
          const isActive = active === i;
          return (
            <motion.div
              key={stage.num}
              className="relative rounded-2xl border px-6 py-5 bg-white overflow-hidden"
              animate={{
                borderColor: isActive ? stage.color + "60" : stage.color + "18",
                boxShadow: isActive ? `0 0 24px ${stage.color}20, 0 0 0 1px ${stage.color}35` : "none",
              }}
              transition={{ duration: 0.35 }}
            >
              <motion.div
                className="absolute inset-0 pointer-events-none"
                animate={{ opacity: isActive ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ background: `linear-gradient(90deg, ${stage.color}10, transparent)` }}
              />
              <div className="relative flex items-center gap-4">
                <motion.div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  animate={{ backgroundColor: isActive ? stage.color + "22" : stage.color + "0c" }}
                  transition={{ duration: 0.3 }}
                >
                  <stage.Icon size={22} style={{ color: stage.color }} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-base font-bold" style={{ color: isActive ? stage.color : "rgba(0,0,0,0.78)" }}>
                      {stage.label}
                    </span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: stage.color + "15", color: stage.color }}>
                      {stage.stat}
                    </span>
                  </div>
                  <div className="text-[13px] text-black/45 leading-snug">{stage.sublabel}</div>
                </div>
                {isActive && (
                  <motion.div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }}
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceTag({ icon, label, detail, tagId, color, isZoomed = false, index = 0 }: {
  icon: ReactNode; label: string; detail: string; tagId: string; color: string;
  isZoomed?: boolean; index?: number;
}) {
  return (
    <motion.div
      className="relative group"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-black/[0.08] bg-background z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 bg-black/[0.08]" />
      {/* Scale inner card only — outer wrapper keeps layout footprint so neighbours don't shift */}
      <motion.div
        className="mt-3 p-5 rounded-xl border bg-white transition-shadow duration-300 origin-center"
        animate={{
          scale: isZoomed ? 1.09 : 1,
          borderColor: isZoomed ? color + "50" : "rgba(0,0,0,0.07)",
          boxShadow: isZoomed
            ? `0 18px 44px ${color}28, 0 0 0 1px ${color}38`
            : "0 2px 12px rgba(0,0,0,0.06)",
          zIndex: isZoomed ? 10 : 0,
        }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{ opacity: isZoomed ? 1 : 0 }}
          transition={{ duration: 0.35 }}
          style={{ background: `radial-gradient(ellipse at 30% 0%, ${color}10, transparent 70%)` }}
        />
        <div className="relative">
          <motion.div
            className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 border"
            animate={{
              borderColor: isZoomed ? color + "40" : color + "22",
              backgroundColor: isZoomed ? color + "18" : color + "10",
            }}
            transition={{ duration: 0.3 }}
          >
            <div style={{ color }} className="[&>svg]:w-7 [&>svg]:h-7">{icon}</div>
          </motion.div>
          <div className="text-sm font-bold mb-1" style={{ color: isZoomed ? color : "rgba(0,0,0,0.80)" }}>{label}</div>
          <div className="text-[13px] text-black/42 leading-relaxed">{detail}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const STACK_CARDS = [
  { tagId: "001", color: "#3B82F6", icon: <GitBranch className="size-5" />, label: "Neo4j · Graph RAG",        detail: "7 node types, 12+ relationships. Maps cross-session causal chains that flat logs cannot see." },
  { tagId: "002", color: "#10B981", icon: <Database className="size-5" />, label: "Pinecone + Cohere",          detail: "Semantic evidence retrieval over traces and chunks. Rerank v3 for precision synthesis." },
  { tagId: "003", color: "#7C3AED", icon: <Workflow className="size-5" />, label: "LangGraph + LangChain",      detail: "State machine with conditional routing. Cyclical reasoning across 4 specialist modules." },
  { tagId: "004", color: "#F59E0B", icon: <Activity className="size-5" />, label: "Langfuse / LangSmith",       detail: "Zero-config trace capture and replay. Hooks every LLM call, tool invocation, and retrieval step." },
  { tagId: "005", color: "#EF4444", icon: <Database className="size-5" />, label: "Postgres · Supabase",        detail: "Primary session store. Full agent session JSON, chat history, analysis reports, and settings." },
  { tagId: "006", color: "#0EA5E9", icon: <Activity className="size-5" />, label: "LLM · FastAPI · RAG",        detail: "Claude Sonnet + GPT-4o-mini for synthesis and routing. FastAPI backend. RAG across all evidence." },
];

function StackGrid() {
  const [zoomed, setZoomed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });

  useEffect(() => {
    if (!isInView) return;
    const id = setInterval(() => setZoomed(prev => (prev + 1) % STACK_CARDS.length), 1600);
    return () => clearInterval(id);
  }, [isInView]);

  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
      {STACK_CARDS.map((card, i) => (
        <EvidenceTag key={card.tagId} {...card} isZoomed={zoomed === i} index={i} />
      ))}
    </div>
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
  { label: "Reports",  href: "#cases" },
  { label: "Pipeline", href: "#pipeline" },
  { label: "Stack",    href: "#stack" },
];

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 20);
      // Active section detection
      const sections = ["cases", "pipeline", "stack"];
      let current = "";
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 120) current = id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-purple-500/10 selection:text-purple-700">
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

      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-background/90 backdrop-blur-xl border-b border-black/[0.07]" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group/logo">
            <div className="size-8 rounded-lg bg-foreground flex items-center justify-center shadow-sm group-hover/logo:scale-110 transition-transform duration-200">
              <span className="font-black text-background text-[11px]">Ae</span>
            </div>
            <span className="font-bold tracking-tight text-foreground">Aethen-AI</span>
          </Link>
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
            <Link href="/overview" className="group/cta flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-all shadow-sm">
              Open Studio <ArrowRight className="size-3.5 group-hover/cta:translate-x-0.5 transition-transform" />
            </Link>
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
              className="md:hidden absolute top-full left-0 w-full bg-background/97 backdrop-blur-xl border-b border-black/[0.06] overflow-hidden"
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
                <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }}>
                  <Link href="/overview" onClick={() => setMobileMenuOpen(false)}
                    className="mt-2 text-sm font-bold text-background p-3 rounded-xl flex items-center gap-2 bg-foreground">
                    Open Studio <ArrowRight className="size-4" />
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="relative z-10">
        {/* ── Hero — full viewport, animation always visible on load ── */}
        <section className="flex flex-col px-4 sm:px-6" style={{ minHeight: "calc(100vh - 56px)" }}>
          <div className="max-w-6xl mx-auto w-full flex flex-col flex-1 pt-10 md:pt-14 pb-4">

            {/* Badge row */}
            <motion.div className="flex flex-wrap items-center gap-2 md:gap-3 mb-5"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.45 }}>
              <motion.div
                className="relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/[0.07] overflow-hidden cursor-default"
                animate={{ boxShadow: ["0 0 0px rgba(239,68,68,0)", "0 0 14px rgba(239,68,68,0.25)", "0 0 0px rgba(239,68,68,0)"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                {/* sweeping glow */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  animate={{ x: ["-100%", "160%"] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
                  style={{ background: "linear-gradient(90deg, transparent, rgba(239,68,68,0.18), transparent)", width: "60%" }}
                />
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-red-500"
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                <span className="relative text-xs font-mono font-bold text-red-600 tracking-[0.14em]">Agent Reliability Studio</span>
              </motion.div>
            </motion.div>

            {/* Headline + CTAs — compact row */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-6">
              <motion.h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[0.92]"
                initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.65 }}>
                <span className="block text-foreground">Your AI agents fail.</span>
                <span className="block bg-gradient-to-br from-foreground via-purple-600 to-blue-600 bg-clip-text text-transparent">Aethen finds the fix.</span>
              </motion.h1>
              <motion.div className="flex flex-row gap-2.5 shrink-0"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <Link href="/overview" className="group inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-bold text-sm hover:bg-foreground/90 hover:scale-[1.02] transition-all duration-200 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
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
            <div className="flex gap-4 w-max" style={{ animation: "stack-scroll 36s linear infinite" }}>
              {[
                { label: "LangGraph",     color: "#7C3AED", icon: <Workflow      className="size-5" /> },
                { label: "LangChain",     color: "#6D28D9", icon: <GitBranch     className="size-5" /> },
                { label: "Graph RAG",     color: "#059669", icon: <Search        className="size-5" /> },
                { label: "Neo4j",         color: "#2563EB", icon: <GitBranch     className="size-5" /> },
                { label: "Pinecone",      color: "#10B981", icon: <Database      className="size-5" /> },
                { label: "Cohere Rerank", color: "#047857", icon: <BarChart3     className="size-5" /> },
                { label: "Langfuse",      color: "#D97706", icon: <Activity      className="size-5" /> },
                { label: "LangSmith",     color: "#B45309", icon: <Cpu           className="size-5" /> },
                { label: "LLM",           color: "#DC2626", icon: <BrainCircuit  className="size-5" /> },
                { label: "Postgres",      color: "#1D4ED8", icon: <Server        className="size-5" /> },
                { label: "FastAPI",       color: "#0284C7", icon: <Zap           className="size-5" /> },
                { label: "Next.js 14",    color: "#111827", icon: <Globe         className="size-5" /> },
                { label: "LangGraph",     color: "#7C3AED", icon: <Workflow      className="size-5" /> },
                { label: "LangChain",     color: "#6D28D9", icon: <GitBranch     className="size-5" /> },
                { label: "Graph RAG",     color: "#059669", icon: <Search        className="size-5" /> },
                { label: "Neo4j",         color: "#2563EB", icon: <GitBranch     className="size-5" /> },
                { label: "Pinecone",      color: "#10B981", icon: <Database      className="size-5" /> },
                { label: "Cohere Rerank", color: "#047857", icon: <BarChart3     className="size-5" /> },
                { label: "Langfuse",      color: "#D97706", icon: <Activity      className="size-5" /> },
                { label: "LangSmith",     color: "#B45309", icon: <Cpu           className="size-5" /> },
                { label: "LLM",           color: "#DC2626", icon: <BrainCircuit  className="size-5" /> },
                { label: "Postgres",      color: "#1D4ED8", icon: <Server        className="size-5" /> },
                { label: "FastAPI",       color: "#0284C7", icon: <Zap           className="size-5" /> },
                { label: "Next.js 14",    color: "#111827", icon: <Globe         className="size-5" /> },
              ].map((item, i) => (
                <div key={i}
                  className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl whitespace-nowrap shrink-0 cursor-default group/chip transition-all duration-300 hover:scale-[1.06]"
                  style={{ background: `linear-gradient(135deg, ${item.color}15, ${item.color}08)` }}>
                  <span className="transition-transform duration-300 group-hover/chip:scale-110" style={{ color: item.color }}>{item.icon}</span>
                  <span className="text-sm font-mono font-semibold" style={{ color: item.color }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <style>{`
            @keyframes stack-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </motion.div>

        <section id="cases" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <div className="max-w-7xl mx-auto">
            {/* Staggered section header */}
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
                      <Typewriter text="Unlike observability tools that surface logs, Aethen reconstructs the failure trace — linking each incident back to its structural root cause across sessions." />
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
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
                  { label: "namespace",  text: "Zero relevant chunks in Pinecone namespace" },
                ]}
                resolution="Root cause: refund policy docs never ingested. Gap closed, reliability +53%." />
            </div>
          </div>
        </section>

        <section id="pipeline" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <div className="max-w-7xl mx-auto">
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
            <div className="flex justify-center">
              <AnimatedPipeline />
            </div>
            <Reveal className="mt-14 md:mt-16">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 p-6 md:p-8 rounded-2xl border border-black/[0.06] bg-white">
                <StatCounter value={7} label="Node Types" suffix="+" color="#3B82F6" />
                <StatCounter value={12} label="Rel. Types" suffix="+" color="#7C3AED" />
                <StatCounter value={25} label="Avg MTTR sec" color="#F59E0B" />
                <StatCounter value={98} label="Reliability Target" suffix="%" color="#10B981" />
              </div>
            </Reveal>
          </div>
        </section>

        <section id="stack" className="py-20 md:py-24 px-4 sm:px-6 scroll-mt-20">
          <div className="max-w-7xl mx-auto">
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
          </div>
        </section>

        <section className="py-28 md:py-36 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="relative rounded-3xl border border-black/[0.06] bg-white shadow-[0_8px_48px_rgba(0,0,0,0.10)] overflow-hidden">
              {/* Ambient gradient bg */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.06), transparent 65%), radial-gradient(ellipse at 80% 100%, rgba(16,185,129,0.05), transparent 55%)" }} />
              {/* Top status bar */}
              <div className="relative border-b border-black/[0.05] px-8 md:px-12 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div className="w-2 h-2 rounded-full bg-emerald-400"
                    animate={{ opacity: [1, 0.35, 1], scale: [1, 1.35, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity }} />
                  <span className="text-xs font-mono font-bold text-black/45 tracking-[0.14em] uppercase">Aethen · Agent Reliability Studio</span>
                </div>
                <span className="text-xs font-mono text-black/40 hidden sm:block">Ingest · Diagnose · Recommend Fix</span>
              </div>
              <div className="relative z-10 px-8 md:px-16 lg:px-24 py-16 md:py-20 lg:py-24 text-center">
                <Reveal>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] mb-10">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    <span className="text-xs font-mono font-bold text-emerald-600 tracking-widest uppercase">Root Cause Confirmed</span>
                  </div>
                </Reveal>
                <Reveal delay={0.1}>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-foreground leading-tight">
                    Your agents deserve<br /><span className="bg-gradient-to-br from-foreground via-purple-600 to-blue-600 bg-clip-text text-transparent">better than guesswork.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.2}>
                  <p className="text-lg md:text-xl text-black/50 max-w-lg mx-auto mb-12 leading-relaxed">
                    <Typewriter text="Open Aethen, connect your Langfuse or LangSmith source using API keys and watch the causal graph build in real time." />
                  </p>
                </Reveal>
                <Reveal delay={0.35}>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link href="/overview" className="group inline-flex items-center justify-center gap-2.5 px-10 md:px-12 py-4 md:py-5 rounded-xl font-bold text-base bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all shadow-[0_4px_28px_rgba(0,0,0,0.14)]">
                      Open Studio <ArrowRight className="size-5 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                    <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="inline-flex items-center justify-center gap-2.5 px-10 md:px-12 py-4 md:py-5 rounded-xl border border-black/[0.1] text-base font-semibold text-black/55 hover:text-black/75 hover:bg-black/[0.03] transition-all duration-200">
                      Replay the Diagnosis
                    </a>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[0.06] bg-white/50 pt-14 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-10 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="size-8 rounded-lg bg-white flex items-center justify-center">
                  <span className="font-black text-[#06060e] text-[11px]">Ae</span>
                </div>
                <span className="font-bold tracking-tight text-foreground">Aethen</span>
              </div>
              <p className="text-xs font-mono text-black/40 leading-relaxed">Agent Reliability Studio.<br />Ingest. Diagnose. Recommend Fix.</p>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-6">
              {[
                { heading: "Product", links: ["Cases", "Pipeline", "Stack", "Changelog"] },
                { heading: "Resources", links: ["Documentation", "API Reference", "GitHub"] },
                { heading: "Company", links: ["About", "Contact"] },
              ].map(col => (
                <div key={col.heading}>
                  <div className="text-xs font-mono font-bold text-black/50 tracking-[0.15em] uppercase mb-3">{col.heading}</div>
                  <ul className="space-y-2">
                    {col.links.map(l => (
                      <li key={l}><a href="#" className="text-xs font-mono text-black/38 hover:text-black/65 transition-colors">{l}</a></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-black/[0.05] flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs font-mono text-black/50">&copy; {new Date().getFullYear()} Aethen AI. All rights reserved.</p>
            <div className="flex gap-5">
              <a href="#" className="text-xs font-mono text-black/50 hover:text-black/55 transition-colors">Privacy</a>
              <a href="#" className="text-xs font-mono text-black/50 hover:text-black/55 transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
