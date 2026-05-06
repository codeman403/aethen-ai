"use client";

import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useInView } from "framer-motion";
import { useEffect, useState, useRef, useCallback, RefObject } from "react";
import { AlertTriangle, Search, FileText, MessageSquare, Wrench, Database, Eye, CheckCircle2, Zap } from "lucide-react";

type Phase = "flow" | "alert" | "investigate" | "resolve";

interface CaseNode {
  id: string; x: number; y: number; label: string;
  type: "session" | "query" | "chunk" | "tool" | "failure" | "blindspot" | "response";
  icon: React.ReactNode;
}
interface CaseEdge { from: string; to: string; }

const CASE_NODES: CaseNode[] = [
  { id: "s1", x: 12, y: 35, label: "Trace A",       type: "session",   icon: <MessageSquare className="w-4 h-4" /> },
  { id: "q1", x: 26, y: 20, label: "User Query",    type: "query",     icon: <Search className="w-4 h-4" /> },
  { id: "c1", x: 26, y: 52, label: "Chunk #42",     type: "chunk",     icon: <FileText className="w-4 h-4" /> },
  { id: "r1", x: 40, y: 35, label: "Response",      type: "response",  icon: <Eye className="w-4 h-4" /> },
  { id: "f1", x: 52, y: 28, label: "Anomaly",       type: "failure",   icon: <AlertTriangle className="w-4 h-4" /> },
  { id: "bs", x: 52, y: 62, label: "Knowledge Gap", type: "blindspot", icon: <Database className="w-4 h-4" /> },
  { id: "s2", x: 88, y: 35, label: "Trace B",       type: "session",   icon: <MessageSquare className="w-4 h-4" /> },
  { id: "q2", x: 74, y: 20, label: "Similar Query", type: "query",     icon: <Search className="w-4 h-4" /> },
  { id: "t1", x: 74, y: 52, label: "Tool Call",     type: "tool",      icon: <Wrench className="w-4 h-4" /> },
  { id: "r2", x: 62, y: 35, label: "Response",      type: "response",  icon: <Eye className="w-4 h-4" /> },
];

const CASE_EDGES: CaseEdge[] = [
  { from: "s1", to: "q1" }, { from: "s1", to: "c1" },
  { from: "q1", to: "r1" }, { from: "c1", to: "r1" },
  { from: "r1", to: "f1" }, { from: "f1", to: "bs" },
  { from: "s2", to: "q2" }, { from: "s2", to: "t1" },
  { from: "q2", to: "r2" }, { from: "t1", to: "r2" },
  { from: "r2", to: "f1" }, { from: "bs", to: "s1" }, { from: "bs", to: "s2" },
];

// Duration each phase is shown (ms)
const PHASE_DURATIONS: Record<Phase, number> = {
  flow: 2500,
  alert: 3000,
  investigate: 3500,
  resolve: 4000,
};

const PHASES: Phase[] = ["flow", "alert", "investigate", "resolve"];

const PHASE_CONFIG = {
  flow:        { accent: "#3B82F6", glow: "#3B82F618", label: "TRACING",              sublabel: "Ingesting trace sessions" },
  alert:       { accent: "#EF4444", glow: "#EF444422", label: "ANOMALY DETECTED",     sublabel: "Confidence 0.94 — cross-referencing" },
  investigate: { accent: "#7C3AED", glow: "#7C3AED20", label: "DIAGNOSING",           sublabel: "Traversing causal graph" },
  resolve:     { accent: "#10B981", glow: "#10B98118", label: "ROOT CAUSE CONFIRMED", sublabel: "Knowledge gap isolated" },
};

const NODE_COLORS: Record<CaseNode["type"], { border: string; bg: string; text: string }> = {
  session:   { border: "#3B82F6", bg: "#3B82F612", text: "#3B82F6" },
  query:     { border: "#8B5CF6", bg: "#8B5CF612", text: "#8B5CF6" },
  chunk:     { border: "#06B6D4", bg: "#06B6D412", text: "#06B6D4" },
  tool:      { border: "#F59E0B", bg: "#F59E0B12", text: "#F59E0B" },
  failure:   { border: "#EF4444", bg: "#EF444420", text: "#EF4444" },
  blindspot: { border: "#EF4444", bg: "#EF444415", text: "#DC2626" },
  response:  { border: "#10B981", bg: "#10B98112", text: "#10B981" },
};

function DataPacket({ from, to, color, delay }: { from: CaseNode; to: CaseNode; color: string; delay: number }) {
  return (
    <motion.circle r="3.5" fill={color} opacity={0.9}
      initial={{ offsetDistance: "0%" }}
      animate={{ offsetDistance: "100%" }}
      transition={{ duration: 1.6, delay, ease: "linear", repeat: Infinity, repeatDelay: 2 }}
      style={{
        offsetPath: `path("M ${from.x}% ${from.y}% L ${to.x}% ${to.y}%")` as never,
        filter: `drop-shadow(0 0 5px ${color})`,
      } as React.CSSProperties}
    />
  );
}

function ShockWave({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <>
      {[0, 0.35, 0.7].map((delay, i) => (
        <motion.div key={i} className="absolute rounded-full pointer-events-none"
          style={{ left: `${x}%`, top: `${y}%`, border: `1.5px solid ${color}`, transform: "translate(-50%,-50%)" }}
          initial={{ width: 44, height: 44, opacity: 0.9 }}
          animate={{ width: 160, height: 160, opacity: 0 }}
          transition={{ duration: 1.6, delay, ease: "easeOut", repeat: Infinity, repeatDelay: 0.8 }}
        />
      ))}
    </>
  );
}

function ScanLine({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-25 overflow-hidden rounded-2xl">
      <motion.div className="absolute left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(to right, transparent, ${color}70, ${color}, ${color}70, transparent)`, boxShadow: `0 0 14px ${color}` }}
        initial={{ top: "0%" }} animate={{ top: "105%" }}
        transition={{ duration: 2.2, ease: "linear", repeat: Infinity, repeatDelay: 0.3 }}
      />
    </div>
  );
}

function PhaseFlash({ phase }: { phase: Phase }) {
  return (
    <motion.div className="absolute inset-0 pointer-events-none z-50 rounded-2xl" key={phase}
      initial={{ opacity: 0.25 }} animate={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      style={{ backgroundColor: PHASE_CONFIG[phase].accent }}
    />
  );
}

interface HeroAnimationProps {
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

export function HeroAnimation({ scrollContainerRef }: HeroAnimationProps) {
  const [phase, setPhase] = useState<Phase>("flow");
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [score, setScore] = useState(45);
  const [resolvedNodes, setResolvedNodes] = useState<Set<string>>(new Set());
  const [litEdges, setLitEdges] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: "-100px" });
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 18 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 18 });
  const rotateX = useTransform(springY, [-0.5, 0.5], [2, -2]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-2, 2]);

  // Auto-cycle phases when in view
  useEffect(() => {
    if (!isInView) return;
    const advance = (idx: number) => {
      const current = PHASES[idx % 4];
      setPhaseIdx(idx % 4);
      setPhase(current);
      timerRef.current = setTimeout(() => advance(idx + 1), PHASE_DURATIONS[current]);
    };
    advance(0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isInView]);

  // Diagnose: stagger edge lighting
  useEffect(() => {
    if (phase !== "investigate") { setLitEdges(new Set()); return; }
    setLitEdges(new Set());
    CASE_EDGES.forEach((_, i) => {
      setTimeout(() => setLitEdges(prev => new Set([...prev, i])), i * 160);
    });
  }, [phase]);

  // Resolve: wave nodes green + count score
  useEffect(() => {
    if (phase !== "resolve") { setResolvedNodes(new Set()); setScore(45); return; }
    setResolvedNodes(new Set());
    CASE_NODES.forEach((n, i) => {
      setTimeout(() => setResolvedNodes(prev => new Set([...prev, n.id])), i * 110);
    });
    let s = 45;
    const step = () => { s += 2; if (s >= 98) { setScore(98); return; } setScore(s); requestAnimationFrame(step); };
    setTimeout(step, 200);
  }, [phase]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - r.left) / r.width - 0.5);
    mouseY.set((e.clientY - r.top) / r.height - 0.5);
  }, [mouseX, mouseY]);

  const config = PHASE_CONFIG[phase];

  const getNodeState = (node: CaseNode) => {
    if (phase === "resolve" && resolvedNodes.has(node.id)) return "resolved";
    if (phase === "alert" && (node.type === "failure" || node.type === "blindspot")) return "alarmed";
    if (phase === "investigate" || phase === "resolve") return "active";
    return "idle";
  };

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} className="relative w-full">
      <motion.div
        className="relative w-full rounded-2xl border bg-[#07071a] overflow-hidden"
        style={{ rotateX, rotateY, transformPerspective: 1400, height: "min(75vh, 680px)" }}
        animate={{ borderColor: config.accent + "30", boxShadow: `0 0 0 1px ${config.accent}15, 0 32px 80px rgba(0,0,0,0.8), 0 0 120px ${config.accent}10` }}
        transition={{ duration: 0.8 }}
      >
        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:36px_36px]" />

        <PhaseFlash phase={phase} />

        {/* Ambient glow */}
        <motion.div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[130px] pointer-events-none"
          animate={{ backgroundColor: config.glow }} transition={{ duration: 1.0 }} />

        {phase === "investigate" && <ScanLine color={config.accent} />}

        {phase === "alert" && (
          <div className="absolute inset-0 pointer-events-none z-15">
            <ShockWave x={52} y={28} color="#EF4444" />
            <ShockWave x={52} y={62} color="#EF444470" />
          </div>
        )}

        {/* SVG edges + packets */}
        <svg className="absolute inset-0 w-full h-full z-10" style={{ overflow: "visible" }}>
          <defs>
            {CASE_EDGES.map((edge, i) => {
              const from = CASE_NODES.find(n => n.id === edge.from)!;
              const to   = CASE_NODES.find(n => n.id === edge.to)!;
              return (
                <linearGradient key={i} id={`grad-${i}`} x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`} gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor={config.accent} stopOpacity="0.1" />
                  <stop offset="50%"  stopColor={config.accent} stopOpacity="0.7" />
                  <stop offset="100%" stopColor={config.accent} stopOpacity="0.1" />
                </linearGradient>
              );
            })}
          </defs>
          {CASE_EDGES.map((edge, i) => {
            const from = CASE_NODES.find(n => n.id === edge.from)!;
            const to   = CASE_NODES.find(n => n.id === edge.to)!;
            const lit  = litEdges.has(i) || phase === "resolve";
            return (
              <g key={i}>
                <line x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`}
                  stroke={lit ? `url(#grad-${i})` : "rgba(255,255,255,0.05)"}
                  strokeWidth={lit ? "2" : "1"}
                  style={{ transition: "all 0.35s ease" }} />
                {lit && <line x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`}
                  stroke={config.accent} strokeWidth="6" strokeOpacity="0.07"
                  style={{ filter: "blur(4px)" }} />}
              </g>
            );
          })}
          {phase === "flow" && CASE_EDGES.slice(0, 7).map((edge, i) => {
            const from = CASE_NODES.find(n => n.id === edge.from)!;
            const to   = CASE_NODES.find(n => n.id === edge.to)!;
            return <DataPacket key={i} from={from} to={to} color="#3B82F6" delay={i * 0.35} />;
          })}
          {phase === "investigate" && CASE_EDGES.map((edge, i) => {
            if (!litEdges.has(i)) return null;
            const from = CASE_NODES.find(n => n.id === edge.from)!;
            const to   = CASE_NODES.find(n => n.id === edge.to)!;
            return <DataPacket key={i} from={from} to={to} color="#7C3AED" delay={0} />;
          })}
        </svg>

        {/* Nodes */}
        {CASE_NODES.map((node, idx) => {
          const colors  = NODE_COLORS[node.type];
          const state   = getNodeState(node);
          const isRes   = state === "resolved";
          const isAlarm = state === "alarmed";
          const isAct   = state === "active" || isRes;
          const borderColor = isRes ? "#10B981" : isAlarm ? "#EF4444" : isAct ? colors.border : "rgba(255,255,255,0.1)";
          const bgColor     = isRes ? "#10B98118" : isAlarm ? "#EF444420" : isAct ? colors.bg : "rgba(255,255,255,0.03)";
          const textColor   = isRes ? "#10B981" : isAlarm ? "#EF4444" : isAct ? colors.text : "rgba(255,255,255,0.18)";
          return (
            <motion.div key={node.id}
              className="absolute z-20 flex flex-col items-center gap-1 cursor-pointer"
              style={{ left: `${node.x}%`, top: `${node.y}%`, x: "-50%", y: "-50%" }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: idx * 0.06, duration: 0.5, type: "spring", bounce: 0.3 }}
              whileHover={{ scale: 1.25 }}
            >
              {(isAlarm || isRes) && (
                <motion.div className="absolute rounded-full border pointer-events-none"
                  style={{ borderColor, width: 56, height: 56, top: "50%", left: "50%", x: "-50%", y: "-50%" }}
                  animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
              )}
              <motion.div className="w-10 h-10 rounded-full flex items-center justify-center border-[1.5px]"
                animate={{ borderColor, backgroundColor: bgColor, boxShadow: isAlarm ? `0 0 22px #EF444445` : isRes ? `0 0 22px #10B98145` : isAct ? `0 0 14px ${colors.border}30` : "none" }}
                transition={{ duration: 0.45 }}>
                <motion.div animate={{ color: textColor }} transition={{ duration: 0.4 }}>
                  {isRes ? <CheckCircle2 className="w-4 h-4" /> : node.icon}
                </motion.div>
              </motion.div>
              <motion.span className="text-[12px] font-mono whitespace-nowrap font-medium"
                animate={{ color: isAct || isAlarm ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.22)" }}
                transition={{ duration: 0.4 }}>
                {node.label}
              </motion.span>
            </motion.div>
          );
        })}

        {/* Top HUD bar */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 border-b border-white/[0.04]"
          style={{ background: "linear-gradient(to bottom, rgba(7,7,26,0.92), transparent)" }}>
          <AnimatePresence mode="wait">
            <motion.div key={phase} className="flex items-center gap-2.5"
              initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.3 }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: config.accent, boxShadow: `0 0 8px ${config.accent}` }} />
              <span className="text-sm font-black tracking-[0.14em] uppercase" style={{ color: config.accent }}>{config.label}</span>
              <span className="text-xs font-mono text-white/55 hidden sm:block">— {config.sublabel}</span>
            </motion.div>
          </AnimatePresence>
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-white/[0.07] bg-[#07071a]/80">
            <span className="text-xs font-mono text-white/55">reliability</span>
            <motion.span className="text-base font-black tabular-nums font-mono"
              animate={{ color: score > 80 ? "#10B981" : score > 50 ? "#F59E0B" : "#EF4444" }}>
              {score}%
            </motion.span>
          </div>
        </div>

        {/* Phase progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] z-40">
          <motion.div className="h-full origin-left"
            key={phase}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: PHASE_DURATIONS[phase] / 1000, ease: "linear" }}
            style={{ backgroundColor: config.accent, boxShadow: `0 0 8px ${config.accent}` }}
          />
        </div>

        {/* Center popup */}
        <AnimatePresence mode="wait">
          {phase === "flow" && (
            <motion.div key="flow-popup" className="absolute z-40 -translate-x-1/2 -translate-y-1/2" style={{ left: "52%", top: "48%" }}
              initial={{ opacity: 0, scale: 0.8, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -12 }} transition={{ type: "spring", bounce: 0.35, duration: 0.5 }}>
              <div className="px-5 py-3.5 rounded-xl border-2 border-blue-500/30 bg-[#00050f]/95 backdrop-blur-md flex items-center gap-3 shadow-[0_8px_40px_rgba(59,130,246,0.2)]">
                <div className="relative p-1.5 rounded-lg bg-blue-500/15 shrink-0">
                  <Database className="w-5 h-5 text-blue-400" />
                  <motion.div className="absolute inset-0 rounded-lg border border-blue-400/40"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.4, repeat: Infinity }} />
                </div>
                <div>
                  <p className="text-base font-bold text-blue-300">Ingesting Live Traces</p>
                  <p className="text-sm text-white/65 mt-0.5">Langfuse → Pinecone → Neo4j</p>
                </div>
              </div>
            </motion.div>
          )}
          {phase === "alert" && (
            <motion.div key="alert-popup" className="absolute z-40 -translate-x-1/2 -translate-y-1/2" style={{ left: "52%", top: "48%" }}
              initial={{ opacity: 0, scale: 0.8, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -12 }} transition={{ type: "spring", bounce: 0.4, duration: 0.5 }}>
              <div className="px-5 py-3.5 rounded-xl border-2 border-red-500/40 bg-[#0c0008]/95 backdrop-blur-md flex items-center gap-3 shadow-[0_8px_40px_rgba(239,68,68,0.3)]">
                <div className="p-1.5 rounded-lg bg-red-500/15 shrink-0"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
                <div>
                  <p className="text-base font-bold text-red-300">Anomaly Detected in Trace</p>
                  <p className="text-sm text-white/65 mt-0.5">Hallucination · Confidence 0.94</p>
                </div>
              </div>
            </motion.div>
          )}
          {phase === "investigate" && (
            <motion.div key="invest-popup" className="absolute z-40 -translate-x-1/2 -translate-y-1/2" style={{ left: "52%", top: "48%" }}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} transition={{ type: "spring", bounce: 0.3 }}>
              <div className="px-5 py-3.5 rounded-xl border-2 border-purple-500/40 bg-[#080012]/95 backdrop-blur-md flex items-center gap-3 shadow-[0_8px_40px_rgba(124,58,237,0.25)]">
                <div className="p-1.5 rounded-lg bg-purple-500/15 shrink-0"><Zap className="w-5 h-5 text-purple-400" /></div>
                <div>
                  <p className="text-base font-bold text-purple-300">Traversing Causal Graph</p>
                  <p className="text-sm text-white/65 mt-0.5">Neo4j · 13 edges · cross-session analysis</p>
                </div>
              </div>
            </motion.div>
          )}
          {phase === "resolve" && (
            <motion.div key="resolve-popup" className="absolute z-40 -translate-x-1/2 -translate-y-1/2" style={{ left: "52%", top: "48%" }}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} transition={{ type: "spring", bounce: 0.3 }}>
              <div className="px-5 py-3.5 rounded-xl border-2 border-emerald-500/40 bg-[#00100a]/95 backdrop-blur-md flex items-center gap-3 shadow-[0_8px_40px_rgba(16,185,129,0.25)]">
                <div className="p-1.5 rounded-lg bg-emerald-500/15 shrink-0"><CheckCircle2 className="w-5 h-5 text-emerald-400" /></div>
                <div>
                  <p className="text-base font-bold text-emerald-300">Root Cause Confirmed</p>
                  <p className="text-sm text-white/65 mt-0.5">Knowledge gap: "Refund Policies" · traces affected</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase stepper */}
        <div className="absolute bottom-4 right-4 z-30">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.07] bg-[#07071a]/90 backdrop-blur-sm">
            {PHASES.map((p, i) => (
              <div key={p} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <motion.div className="w-2 h-2 rounded-full"
                    animate={{ backgroundColor: phaseIdx === i ? PHASE_CONFIG[p].accent : phaseIdx > i ? PHASE_CONFIG[p].accent + "55" : "rgba(255,255,255,0.1)", scale: phaseIdx === i ? 1.5 : 1 }}
                    transition={{ duration: 0.4 }}
                    style={{ boxShadow: phaseIdx === i ? `0 0 6px ${PHASE_CONFIG[p].accent}` : "none" }} />
                  <span className="text-[11px] font-mono text-white/60">{["Ingest","Detect","Diagnose","Prescribe"][i]}</span>
                </div>
                {i < 3 && <div className="w-4 h-px bg-white/[0.07] mb-3" />}
              </div>
            ))}
          </div>
        </div>

        {/* Terminal */}
        <div className="absolute bottom-4 left-4 z-30" style={{ right: "calc(33% + 8px)" }}>
          <div className="rounded-lg border border-white/[0.07] bg-[#040410]/95 backdrop-blur-sm overflow-hidden shadow-xl">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.05]">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500/60" />
                <div className="w-2 h-2 rounded-full bg-amber-500/60" />
                <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
              </div>
              <span className="text-xs font-mono text-white/55 ml-1">aethen · diagnostic log</span>
              <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: config.accent }} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={phase} className="px-3 py-2 h-[80px] overflow-hidden"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                <pre className="font-mono text-[13px] leading-[1.65] text-white/55 whitespace-pre-wrap">
                  {phase === "flow"        && "● Tracing active sessions...\n  └─ Ingesting spans · Langfuse\n  └─ Vectorizing chunks → Pinecone\n  └─ Indexing graph → Neo4j"}
                  {phase === "alert"       && "⚠ ANOMALY DETECTED\n  Confidence: 0.94\n  Signal: hallucination in response\n  Retrieval: NOT FOUND in indexed chunks"}
                  {phase === "investigate" && "🔍 Cross-trace diagnosis started\n  Neo4j: (Trace A)─[:EXHIBITS]→(Anomaly)\n  Neo4j: (Anomaly)─[:CAUSED_BY]→(Gap)\n  Found: Trace B shares same knowledge gap"}
                  {phase === "resolve"     && "✓ ROOT CAUSE: Knowledge gap confirmed\n  Topic: 'Refund Policies'\n  Fix: Re-index documentation cluster #7\n  Reliability: 45% → 98% ✓"}
                </pre>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
