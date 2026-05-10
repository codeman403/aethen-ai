"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Activity, BrainCircuit, GitBranch, Database, CheckCircle2 } from "lucide-react";

const PIPELINE_STAGES = [
  { num: "01", label: "Ingest",          sublabel: "Langfuse hooks capture every LLM call and retrieval", color: "#3B82F6", stat: "10K+ traces/min", Icon: Activity    },
  { num: "02", label: "Classify",        sublabel: "Heuristic classifiers route to specialist modules",    color: "#EF4444", stat: "4 failure types",  Icon: BrainCircuit },
  { num: "03", label: "Graph Query",     sublabel: "Neo4j traversal maps causal chains across sessions",   color: "#7C3AED", stat: "Cross-trace",       Icon: GitBranch    },
  { num: "04", label: "Vector Evidence", sublabel: "pgvector + Cohere Rerank synthesizes evidence",        color: "#F59E0B", stat: "Rerank v3",         Icon: Database     },
  { num: "05", label: "Recommend Fix",   sublabel: "Confidence-scored remediation with reliability delta", color: "#10B981", stat: "−80% MTTR",        Icon: CheckCircle2 },
];

const STAGE_DURATION = 2200;
const N = PIPELINE_STAGES.length;
const CX = 250, CY = 250, R = 186;
const VBSIZE = 500;
const CIRC = 2 * Math.PI * R;

function stagePos(i: number) {
  const angle = -Math.PI / 2 + i * (2 * Math.PI / N);
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
}

export function AnimatedPipeline() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: "-80px" });

  useEffect(() => {
    if (!isInView) return;
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
  }, [isInView]);

  const filledAngle = (active + progress) / N;
  const dashOffset = CIRC * (1 - filledAngle);
  const dotAngle = -Math.PI / 2 + (active + progress) * (2 * Math.PI / N);
  const dotX = CX + R * Math.cos(dotAngle);
  const dotY = CY + R * Math.sin(dotAngle);
  const activeStage = PIPELINE_STAGES[active % N] ?? PIPELINE_STAGES[0];

  return (
    <div ref={containerRef} className="flex flex-col lg:flex-row items-center gap-16 w-full max-w-5xl mx-auto px-4">
      <div className="relative shrink-0" style={{ width: VBSIZE * 0.96, height: VBSIZE * 0.96 }}>
        <svg viewBox={`0 0 ${VBSIZE} ${VBSIZE}`} className="w-full h-full" style={{ overflow: "visible" }}>
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
          <circle cx={CX} cy={CY} r={R + 40} fill="url(#centerGlow)" />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={2} />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={activeStage.color} strokeWidth={3}
            strokeDasharray={CIRC} strokeDashoffset={dashOffset} strokeLinecap="round"
            transform={`rotate(-90 ${CX} ${CY})`} style={{ transition: "stroke 0.4s ease", opacity: 0.7 }} />
          <circle cx={dotX} cy={dotY} r={6} fill={activeStage.color} filter="url(#dotGlow)" style={{ transition: "fill 0.4s ease" }} />
          <circle cx={dotX} cy={dotY} r={3.5} fill="white" />
          {PIPELINE_STAGES.map((_, i) => {
            const p = stagePos(i);
            return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.04)" strokeWidth={1} />;
          })}
        </svg>

        {PIPELINE_STAGES.map((stage, i) => {
          const p = stagePos(i);
          const pct = { left: `${(p.x / VBSIZE) * 100}%`, top: `${(p.y / VBSIZE) * 100}%` };
          const isActive = active === i;
          return (
            <div key={stage.num} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={pct}>
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
                  <motion.div className="absolute inset-0 rounded-full"
                    animate={{ opacity: [0.45, 0], scale: [1, 1.9] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                    style={{ border: `2px solid ${stage.color}` }} />
                )}
              </motion.div>
              <motion.div
                className="mt-2.5 px-3.5 py-1 rounded-full text-[13px] font-bold tracking-wide whitespace-nowrap"
                animate={{ backgroundColor: isActive ? stage.color + "18" : "rgba(0,0,0,0.05)", color: isActive ? stage.color : "rgba(0,0,0,0.50)" }}
                transition={{ duration: 0.3 }}
              >
                {stage.label}
              </motion.div>
            </div>
          );
        })}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div key={active} className="flex flex-col items-center text-center px-6"
              initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.28, ease: "easeOut" }}>
              <div className="text-[12px] font-mono font-bold tracking-[0.22em] uppercase mb-1.5" style={{ color: activeStage.color + "99" }}>{activeStage.num}</div>
              <div className="text-xl font-bold text-black/80 mb-1">{activeStage.label}</div>
              <div className="text-[13px] font-mono font-bold" style={{ color: activeStage.color }}>{activeStage.stat}</div>
              <div className="flex gap-1.5 mt-4">
                {PIPELINE_STAGES.map((s, i) => (
                  <motion.div key={i} className="w-2 h-2 rounded-full"
                    animate={{ backgroundColor: i === active ? s.color : "rgba(0,0,0,0.12)", scale: i === active ? 1.4 : 1 }}
                    transition={{ duration: 0.25 }} />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1 min-w-0 self-center">
        {PIPELINE_STAGES.map((stage, i) => {
          const isActive = active === i;
          return (
            <motion.div key={stage.num} className="relative rounded-2xl border px-6 py-5 bg-white overflow-hidden"
              animate={{ borderColor: isActive ? stage.color + "60" : stage.color + "18", boxShadow: isActive ? `0 0 24px ${stage.color}20, 0 0 0 1px ${stage.color}35` : "none" }}
              transition={{ duration: 0.35 }}>
              <motion.div className="absolute inset-0 pointer-events-none"
                animate={{ opacity: isActive ? 1 : 0 }} transition={{ duration: 0.3 }}
                style={{ background: `linear-gradient(90deg, ${stage.color}10, transparent)` }} />
              <div className="relative flex items-center gap-4">
                <motion.div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  animate={{ backgroundColor: isActive ? stage.color + "22" : stage.color + "0c" }} transition={{ duration: 0.3 }}>
                  <stage.Icon size={22} style={{ color: stage.color }} />
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="text-base font-bold" style={{ color: isActive ? stage.color : "rgba(0,0,0,0.78)" }}>{stage.label}</span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: stage.color + "15", color: stage.color }}>{stage.stat}</span>
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
