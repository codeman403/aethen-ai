"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    // Use rAF to scroll after the new page has painted
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById("main-scroll");
      if (el) el.scrollTop = 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);
  return null;
}
