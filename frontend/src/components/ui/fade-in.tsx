"use client";
import { motion } from "framer-motion";
import { ReactNode } from "react";

export function FadeInStagger({
  children,
  className,
  stagger = 0.08,
  delay = 0.1,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      className={className}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: stagger, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function FadeInItem({
  children,
  className,
  slow = false,
}: {
  children: ReactNode;
  className?: string;
  slow?: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: slow ? 12 : 20, filter: "blur(8px)" },
        visible: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: slow
            ? { type: "tween", ease: "easeOut", duration: 0.45 }
            : { type: "spring", stiffness: 300, damping: 24 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
