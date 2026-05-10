"use client";

import { useEffect, useState } from "react";
import { Monitor, X, ArrowRight } from "lucide-react";
import Link from "next/link";

export function MobileWarning() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      window.innerWidth < 768 &&
      !sessionStorage.getItem("mobile_warning_dismissed")
    ) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    sessionStorage.setItem("mobile_warning_dismissed", "1");
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-black/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-foreground flex items-center justify-center shrink-0">
                <Monitor className="size-5 text-background" />
              </div>
              <div>
                <p className="font-bold text-foreground text-base">Desktop Recommended</p>
                <p className="text-xs text-black/40 mt-0.5">Aethen · Agent Reliability Studio</p>
              </div>
            </div>
            <button onClick={dismiss} className="p-1.5 rounded-lg hover:bg-black/[0.05] transition-colors text-black/30 hover:text-black/60 shrink-0 mt-0.5">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-black/55 leading-relaxed">
            Aethen's trace explorer, analysis pipeline, and debugging tools are designed for desktop use. For the full experience, open this on a{" "}
            <span className="font-semibold text-black/70">laptop or desktop browser</span>.
          </p>
          <p className="text-xs text-black/35 mt-2.5">
            You can still explore the demo on mobile.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex flex-col gap-2">
          <Link
            href="/demo-agent"
            onClick={dismiss}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-colors"
          >
            Explore Demo <ArrowRight className="size-3.5" />
          </Link>
          <button
            onClick={dismiss}
            className="w-full py-3 rounded-xl border border-black/[0.1] text-sm text-black/50 hover:text-black/70 hover:bg-black/[0.03] transition-colors"
          >
            Continue on Mobile
          </button>
        </div>
      </div>
    </div>
  );
}
