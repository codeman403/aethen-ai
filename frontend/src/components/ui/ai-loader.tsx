"use client";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

export function AILoadingOverlay({ 
  isLoading, 
  text, 
  subtext 
}: { 
  isLoading: boolean;
  text: string; 
  subtext?: string 
}) {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div 
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 bg-background/50 z-50 flex flex-col items-center justify-center rounded-2xl overflow-hidden border border-primary/10 shadow-2xl"
        >
          {/* Scanning Laser Line */}
          <motion.div
            className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-80 shadow-[0_0_20px_rgba(0,0,0,0.5)] dark:shadow-[0_0_20px_rgba(255,255,255,0.5)]"
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 3, ease: "linear", repeat: Infinity }}
          />
          
          {/* Pulsing Orb */}
          <div className="relative flex items-center justify-center mb-6">
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/20 blur-2xl"
              animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <Loader2 className="size-12 animate-spin text-primary relative z-10" />
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg font-extrabold tracking-tight text-foreground relative z-10"
          >
            {text}
          </motion.div>
          
          {subtext && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-sm text-muted-foreground mt-2 relative z-10 font-medium"
            >
              {subtext}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
