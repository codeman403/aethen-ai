"use client";
import { motion } from "framer-motion";
import { ReactNode } from "react";

export function FadeInStagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      className={className}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: 0.08, delayChildren: 0.1 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function FadeInItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
        visible: { 
          opacity: 1, 
          y: 0, 
          filter: "blur(0px)", 
          transition: { type: "spring", stiffness: 300, damping: 24 } 
        },
      }}
    >
      {children}
    </motion.div>
  );
}
