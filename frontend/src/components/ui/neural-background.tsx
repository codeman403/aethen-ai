"use client";
import { motion } from "framer-motion";

export function NeuralBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 bg-background" />
      
      {/* Subtle Deep-Tech Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_30%,transparent_100%)]" />
      
      {/* Moving Orbs to simulate "data traces" */}
      <motion.div
        animate={{
          x: [0, 100, 0, -100, 0],
          y: [0, 50, 100, 50, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl opacity-50"
      />
      <motion.div
        animate={{
          x: [0, -150, 0, 150, 0],
          y: [0, -100, -50, -100, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute w-[500px] h-[500px] bg-rose-500/5 rounded-full blur-3xl opacity-50 mix-blend-multiply dark:mix-blend-screen"
      />
    </div>
  );
}
