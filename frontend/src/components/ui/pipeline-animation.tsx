"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Activity, BrainCircuit, Search, Wrench, Sparkles,
  AlertTriangle, CheckCircle2, Loader2, Database,
  GitBranch, Zap, Clock, Hash, MessageSquare,
  ArrowRight, ShieldAlert, Eye, Code2,
} from "lucide-react";

// ── Trace event types that scroll in ───────────────────────────────────────
const TRACE_POOL = [
  { kind: "llm",  icon: <BrainCircuit className="size-3" />, label: "gpt-4o-mini",      sub: "284ms",  color: "#7C3AED" },
  { kind: "tool", icon: <Wrench className="size-3" />,       label: "search_knowledge", sub: "timeout", color: "#EF4444", bad: true },
  { kind: "ret",  icon: <Search className="size-3" />,       label: "pgvector query",   sub: "0 chunks",color: "#F59E0B", bad: true },
  { kind: "llm",  icon: <BrainCircuit className="size-3" />, label: "claude-sonnet",    sub: "1.2s",   color: "#7C3AED" },
  { kind: "tool", icon: <Code2 className="size-3" />,        label: "query_database",   sub: "ok 38ms", color: "#10B981" },
  { kind: "ret",  icon: <Search className="size-3" />,       label: "vector search",    sub: "score 0.41",color:"#F59E0B",bad:true},
  { kind: "msg",  icon: <MessageSquare className="size-3" />,label: "user turn #4",     sub: "120 tok", color: "#0EA5E9" },
  { kind: "llm",  icon: <Eye className="size-3" />,          label: "hallucination",    sub: "flagged", color: "#EF4444", bad: true },
  { kind: "tool", icon: <ShieldAlert className="size-3" />,  label: "create_ticket",    sub: "ok 52ms", color: "#10B981" },
  { kind: "ret",  icon: <Database className="size-3" />,     label: "neo4j traverse",   sub: "7 nodes", color: "#3B82F6" },
];

// ── Pipeline stages (vertical) ──────────────────────────────────────────────
const STAGES = [
  { id: "ingest",   label: "Ingest",    icon: <Activity className="size-3.5" />,    color: "#3B82F6" },
  { id: "classify", label: "Classify",  icon: <BrainCircuit className="size-3.5" />,color: "#7C3AED" },
  { id: "retrieve", label: "Retrieve",  icon: <Search className="size-3.5" />,      color: "#0EA5E9" },
  { id: "analyze",  label: "Analyze",   icon: <Wrench className="size-3.5" />,      color: "#F59E0B" },
  { id: "resolve",  label: "Resolve",   icon: <Sparkles className="size-3.5" />,    color: "#10B981" },
];

// ── Diagnosis cases ──────────────────────────────────────────────────────────
const CASES = [
  {
    type: "Hallucination",  color: "#EF4444", icon: <AlertTriangle className="size-4" />,
    severity: "critical",
    rootCause: "LLM fabricated EU data retention policy — 36 months claim absent from all source docs",
    fix: "Enforce citation mode: block responses without doc references. Re-embed compliance-docs.",
    confidence: 94, latency: "2.3s", tokens: "1,847",
    evidence: [0, 3, 7],   // indices into TRACE_POOL
    tags: ["hallucination", "context-gap", "compliance"],
  },
  {
    type: "Tool Misfire",   color: "#F59E0B", icon: <Wrench className="size-4" />,
    severity: "high",
    rootCause: "search_knowledge timed out after 30s causing downstream cascade across 3 tool calls",
    fix: "Add 5s circuit breaker with exponential backoff. Independent failure paths per tool.",
    confidence: 88, latency: "1.7s", tokens: "2,103",
    evidence: [1, 4, 8],
    tags: ["timeout", "cascade", "tool-chain"],
  },
  {
    type: "Blind Spot",     color: "#7C3AED", icon: <Database className="size-4" />,
    severity: "high",
    rootCause: "Vector DB has zero coverage of Kubernetes multi-region failover — 0 chunks across 3 attempts",
    fix: "Ingest 14 missing SRE docs into engineering-wiki. Update embedding pipeline to cover infra topics.",
    confidence: 91, latency: "3.1s", tokens: "956",
    evidence: [2, 5, 9],
    tags: ["kb-gap", "retrieval", "infra"],
  },
  {
    type: "Memory Failure", color: "#0EA5E9", icon: <GitBranch className="size-4" />,
    severity: "medium",
    rootCause: "Similarity score peaked at 0.41 — stale embeddings returning billing docs for API queries",
    fix: "Re-embed product-docs namespace. Lower cosine threshold to 0.55. Add MMR diversification.",
    confidence: 86, latency: "2.8s", tokens: "1,342",
    evidence: [0, 3, 6],
    tags: ["stale-embed", "similarity", "namespace"],
  },
];

const STAGE_MS  = 850;
const HOLD_MS   = 3400;
const SCROLL_MS = 1100;

// ── Typewriter ──────────────────────────────────────────────────────────────
function Typewriter({ text, speed = 15 }: { text: string; speed?: number }) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text]);
  return <>{out}<motion.span animate={{ opacity: [1,0] }} transition={{ duration: 0.5, repeat: Infinity }}>|</motion.span></>;
}

// ── Hex glow ring on active stage ────────────────────────────────────────────
function PulseRing({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-xl pointer-events-none"
      style={{ boxShadow: `0 0 0 0 ${color}60` }}
      animate={{ boxShadow: [`0 0 0 0px ${color}60`, `0 0 0 8px ${color}00`] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

// ── Particle along vertical pipe ─────────────────────────────────────────────
function VParticle({ color, delay }: { color: string; delay: number }) {
  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2 size-1.5 rounded-full"
      style={{ backgroundColor: color, top: 0 }}
      animate={{ top: ["0%","100%"], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.55, delay, ease: "easeIn", repeat: Infinity, repeatDelay: 0.9 }}
    />
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function PipelineAnimation() {
  const [traceItems, setTraceItems] = useState<(typeof TRACE_POOL[0] & { id: number })[]>([]);
  const [activeStage, setActiveStage] = useState(-1);
  const [doneStages, setDoneStages] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [caseIdx, setCaseIdx] = useState(0);
  const [highlightedTraces, setHighlightedTraces] = useState<number[]>([]);
  const [statusText, setStatusText] = useState("MONITORING");
  const [statusPulse, setStatusPulse] = useState<"blue"|"yellow"|"red"|"green">("blue");
  const counterRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { loopRef.current.forEach(clearTimeout); loopRef.current = []; };
  const t = (fn: ()=>void, ms: number) => { const id = setTimeout(fn, ms); loopRef.current.push(id); };

  // Continuously add trace events
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      const item = TRACE_POOL[i % TRACE_POOL.length];
      setTraceItems(prev => [{ ...item, id: counterRef.current++ }, ...prev].slice(0, 9));
      i++;
    }, SCROLL_MS);
    return () => clearInterval(id);
  }, []);

  const runPipeline = useCallback((ci: number) => {
    clear();
    setDoneStages([]);
    setShowResult(false);
    setHighlightedTraces([]);
    setActiveStage(0);
    setStatusText("INGESTING");
    setStatusPulse("blue");

    const statusLabels = ["INGESTING","CLASSIFYING","RETRIEVING","ANALYZING","SYNTHESIZING"];
    STAGES.forEach((_, i) => {
      t(() => {
        setActiveStage(i);
        if (i > 0) setDoneStages(p => [...p, i-1]);
        setStatusText(statusLabels[i]);
        if (i >= 2) setStatusPulse("yellow");
        if (i >= 3) { setStatusPulse("red"); setHighlightedTraces(CASES[ci].evidence); }
      }, i * STAGE_MS);
    });

    const total = STAGES.length * STAGE_MS;
    t(() => {
      setDoneStages(STAGES.map((_, i) => i));
      setActiveStage(-1);
      setShowResult(true);
      setStatusText("RESOLVED");
      setStatusPulse("green");
    }, total);

    t(() => {
      setShowResult(false);
      setHighlightedTraces([]);
      const next = (ci + 1) % CASES.length;
      setCaseIdx(next);
      t(() => runPipeline(next), 500);
    }, total + HOLD_MS);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => runPipeline(0), 1200);
    return () => { clearTimeout(id); clear(); };
  }, [runPipeline]);

  const c = CASES[caseIdx];

  return (
    <div className="relative w-full" style={{ minHeight: 520 }}>

      {/* ── Dark immersive background ──────────────────────────────── */}
      <div
        className="absolute inset-0 rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #080c14 0%, #0d0f1a 50%, #0a1022 100%)",
        }}
      >
        {/* Grid */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px)", backgroundSize:"40px 40px" }} />
        {/* Glow blobs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-[0.06] blur-[80px]" style={{ background: c.color }} />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full opacity-[0.04] blur-[60px] bg-violet-500" />
      </div>

      {/* ── Status bar ─────────────────────────────────────────────── */}
      <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-2">
          <motion.div
            className="size-2 rounded-full"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            style={{ backgroundColor: { blue:"#3B82F6", yellow:"#F59E0B", red:"#EF4444", green:"#10B981" }[statusPulse] }}
          />
          <span className="text-[10px] font-mono tracking-[0.2em] text-white/40">{statusText}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-white/20">AETHEN RCA ENGINE</span>
          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* ── Three-column layout ─────────────────────────────────────── */}
      <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] gap-0 pt-12 pb-6 px-4 md:px-8 h-full" style={{ minHeight: 520 }}>

        {/* ── LEFT: Live trace stream ──────────────────────────────── */}
        <div className="flex flex-col justify-center gap-1.5 pr-4 overflow-hidden">
          <p className="text-[9px] font-mono tracking-[0.25em] text-white/25 mb-2 uppercase">Live Trace Feed</p>
          <AnimatePresence initial={false}>
            {traceItems.map((item, idx) => {
              const isHighlighted = showResult && highlightedTraces.some(hi => TRACE_POOL[hi % TRACE_POOL.length].kind === item.kind && TRACE_POOL[hi % TRACE_POOL.length].bad === item.bad);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: idx < 7 ? 1 : 0.3, x: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="relative"
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-500 ${
                      isHighlighted
                        ? "border-opacity-80 shadow-lg"
                        : "border-white/[0.06] bg-white/[0.03]"
                    }`}
                    style={isHighlighted ? {
                      borderColor: `${item.color}60`,
                      backgroundColor: `${item.color}12`,
                      boxShadow: `0 0 12px ${item.color}30`,
                    } : {}}
                  >
                    {isHighlighted && (
                      <motion.div
                        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg"
                        style={{ backgroundColor: item.color }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.2 }}
                      />
                    )}
                    <span style={{ color: item.color }}>{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono text-white/70 truncate leading-tight">{item.label}</p>
                      <p className="text-[9px] font-mono leading-tight" style={{ color: item.bad ? "#EF4444" : "rgba(255,255,255,0.25)" }}>{item.sub}</p>
                    </div>
                    {item.bad && (
                      <div className="size-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* ── CENTER: Vertical pipeline ─────────────────────────────── */}
        <div className="flex flex-col items-center justify-center px-3 md:px-6 gap-0 relative" style={{ minWidth: 90 }}>
          <p className="text-[9px] font-mono tracking-[0.25em] text-white/25 mb-4 uppercase whitespace-nowrap">Pipeline</p>

          {STAGES.map((stage, i) => {
            const isActive = activeStage === i;
            const isDone = doneStages.includes(i);

            return (
              <div key={stage.id} className="flex flex-col items-center">
                {/* Node */}
                <motion.div
                  animate={isActive ? { scale: 1.18 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="relative"
                >
                  {isActive && <PulseRing color={stage.color} />}
                  <div
                    className="relative size-10 rounded-xl flex items-center justify-center border transition-all duration-300"
                    style={{
                      backgroundColor: isActive ? `${stage.color}22` : isDone ? "#10B98118" : "#ffffff08",
                      borderColor: isActive ? stage.color : isDone ? "#10B98160" : "#ffffff15",
                      boxShadow: isActive ? `0 0 20px ${stage.color}50` : "none",
                      color: isActive ? stage.color : isDone ? "#10B981" : "#ffffff30",
                    }}
                  >
                    {isDone && !isActive ? <CheckCircle2 className="size-4" /> : stage.icon}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-xl"
                        style={{ background: `radial-gradient(circle at center, ${stage.color}15, transparent)` }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                    )}
                  </div>
                  <p className="text-[9px] font-mono text-center mt-1 whitespace-nowrap"
                    style={{ color: isActive ? stage.color : isDone ? "#10B981" : "#ffffff25" }}>
                    {stage.label}
                  </p>
                </motion.div>

                {/* Connector with particles */}
                {i < STAGES.length - 1 && (
                  <div className="relative w-px h-8 my-1" style={{ backgroundColor: "#ffffff10" }}>
                    {isDone && (
                      <motion.div
                        className="absolute top-0 left-0 right-0 origin-top"
                        style={{ backgroundColor: STAGES[i+1].color, height: "100%" }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                    {isDone && (
                      <>
                        <VParticle color={STAGES[i+1].color} delay={0} />
                        <VParticle color={STAGES[i+1].color} delay={0.45} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── RIGHT: Diagnosis output ───────────────────────────────── */}
        <div className="flex flex-col justify-center gap-3 pl-4 overflow-hidden">
          <p className="text-[9px] font-mono tracking-[0.25em] text-white/25 mb-2 uppercase">Diagnosis</p>

          <AnimatePresence mode="wait">
            {showResult ? (
              <motion.div
                key={`diag-${caseIdx}`}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="space-y-3"
              >
                {/* Type badge */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: "spring" }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border"
                  style={{ borderColor: `${c.color}40`, backgroundColor: `${c.color}15`, color: c.color }}
                >
                  {c.icon}
                  <span className="text-xs font-bold">{c.type}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                    style={{ backgroundColor: `${c.color}25` }}>{c.severity}</span>
                </motion.div>

                {/* Root cause */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-1.5">Root Cause</p>
                  <p className="text-xs font-medium leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                    <Typewriter text={c.rootCause} speed={14} />
                  </p>
                </div>

                {/* Fix */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3"
                >
                  <p className="text-[9px] font-mono text-emerald-400/60 uppercase tracking-widest mb-1.5">Fix</p>
                  <p className="text-xs font-medium leading-relaxed text-emerald-300/80">
                    <Typewriter text={c.fix} speed={12} />
                  </p>
                </motion.div>

                {/* Confidence bar */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Confidence</span>
                    <span className="text-[10px] font-mono" style={{ color: c.color }}>{c.confidence}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <motion.div
                      className="h-full rounded-full relative overflow-hidden"
                      style={{ backgroundColor: c.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${c.confidence}%` }}
                      transition={{ duration: 0.9, ease: "easeOut", delay: 0.9 }}
                    >
                      <motion.div
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }}
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{ duration: 1, delay: 1.8, ease: "easeInOut" }}
                      />
                    </motion.div>
                  </div>
                </motion.div>

                {/* Meta + tags */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className="flex flex-wrap gap-1.5"
                >
                  {[
                    { icon: <Clock className="size-2.5" />, val: c.latency },
                    { icon: <Hash className="size-2.5" />,  val: c.tokens  },
                    { icon: <Zap className="size-2.5" />,   val: `${c.confidence}%` },
                  ].map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 1.1 + i * 0.07, type: "spring", stiffness: 400 }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono border border-white/[0.08] text-white/30"
                    >
                      <span style={{ color: c.color }}>{m.icon}</span>
                      {m.val}
                    </motion.div>
                  ))}
                  {c.tags.map((tag, i) => (
                    <motion.span
                      key={tag}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 1.3 + i * 0.08, type: "spring", stiffness: 400 }}
                      className="text-[9px] font-mono px-2 py-0.5 rounded-full border"
                      style={{ color: c.color, borderColor: `${c.color}30`, backgroundColor: `${c.color}10` }}
                    >
                      #{tag}
                    </motion.span>
                  ))}
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {/* Skeleton placeholders while pipeline runs */}
                {[80, 100, 60].map((w, i) => (
                  <motion.div
                    key={i}
                    className="h-2 rounded-full"
                    style={{ width: `${w}%`, backgroundColor: "rgba(255,255,255,0.05)" }}
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1.5, delay: i * 0.2, repeat: Infinity }}
                  />
                ))}
                <div className="flex items-center gap-2 pt-2">
                  <Loader2 className="size-3 text-white/20 animate-spin" />
                  <span className="text-[10px] font-mono text-white/20">
                    {activeStage >= 0 ? `${STAGES[activeStage]?.label}…` : "Preparing…"}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Bottom divider ─────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${c.color}40, transparent)` }} />
    </div>
  );
}
