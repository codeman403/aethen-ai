"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up in whole seconds while `running` is true.
 * Uses 250ms interval for a more responsive first-second display.
 * Resets to 0 each time running switches false → true.
 */
export function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      setSeconds(0);
      return;
    }
    startRef.current = Date.now();
    setSeconds(0);
    // 250ms tick so the first second appears quickly
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  return seconds;
}
