"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { GitBranch, Database, Workflow, Activity } from "lucide-react";

const STACK_CARDS = [
  { tagId: "001", color: "#3B82F6", icon: <GitBranch className="size-5" />, label: "Neo4j · Graph RAG",        detail: "7 node types, 12+ relationships. Maps cross-session causal chains that flat logs cannot see." },
  { tagId: "002", color: "#10B981", icon: <Database className="size-5" />, label: "pgvector + Cohere",           detail: "Semantic evidence retrieval over traces and chunks. Rerank v3 for precision synthesis." },
  { tagId: "003", color: "#7C3AED", icon: <Workflow className="size-5" />, label: "LangGraph + LangChain",      detail: "State machine with conditional routing. Cyclical reasoning across 4 specialist modules." },
  { tagId: "004", color: "#F59E0B", icon: <Activity className="size-5" />, label: "Langfuse / LangSmith",       detail: "Zero-config trace capture and replay. Hooks every LLM call, tool invocation, and retrieval step." },
  { tagId: "005", color: "#EF4444", icon: <Database className="size-5" />, label: "Postgres · Supabase",        detail: "Primary session store. Full agent session JSON, chat history, analysis reports, and settings." },
  { tagId: "006", color: "#0EA5E9", icon: <Activity className="size-5" />, label: "LLM · FastAPI · RAG",        detail: "Claude Sonnet + GPT-4o-mini for synthesis and routing. FastAPI backend. RAG across all evidence." },
];

function EvidenceTag({ icon, label, detail, tagId, color, isZoomed = false, index = 0 }: {
  icon: ReactNode; label: string; detail: string; tagId: string; color: string;
  isZoomed?: boolean; index?: number;
}) {
  return (
    <motion.div className="relative group"
      initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-black/[0.08] bg-background z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 bg-black/[0.08]" />
      <motion.div
        className="mt-3 p-5 rounded-xl border bg-white transition-shadow duration-300 origin-center"
        animate={{
          scale: isZoomed ? 1.09 : 1,
          borderColor: isZoomed ? color + "50" : "rgba(0,0,0,0.07)",
          boxShadow: isZoomed ? `0 18px 44px ${color}28, 0 0 0 1px ${color}38` : "0 2px 12px rgba(0,0,0,0.06)",
          zIndex: isZoomed ? 10 : 0,
        }}
        transition={{ duration: 0.35, ease: "easeOut" }}>
        <motion.div className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{ opacity: isZoomed ? 1 : 0 }} transition={{ duration: 0.35 }}
          style={{ background: `radial-gradient(ellipse at 30% 0%, ${color}10, transparent 70%)` }} />
        <div className="relative">
          <motion.div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 border"
            animate={{ borderColor: isZoomed ? color + "40" : color + "22", backgroundColor: isZoomed ? color + "18" : color + "10" }}
            transition={{ duration: 0.3 }}>
            <div style={{ color }} className="[&>svg]:w-7 [&>svg]:h-7">{icon}</div>
          </motion.div>
          <div className="text-sm font-bold mb-1" style={{ color: isZoomed ? color : "rgba(0,0,0,0.80)" }}>{label}</div>
          <div className="text-[13px] text-black/42 leading-relaxed">{detail}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function StackGrid() {
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
