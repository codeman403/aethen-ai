import Link from "next/link";
import { AethenLogo } from "@/components/ui/logo";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <Link href="/" className="flex items-center gap-3 mb-12 opacity-80 hover:opacity-100 transition-opacity">
        <AethenLogo size={28} />
        <span className="font-bold tracking-tight text-lg bg-gradient-to-r from-[#6D28D9] to-[#059669] bg-clip-text text-transparent">
          Aethen AI
        </span>
      </Link>

      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/[0.08] bg-black/[0.03] text-xs font-mono font-semibold text-black/40 uppercase tracking-[0.18em] mb-6">
        Coming Soon
      </div>

      <h1 className="text-3xl md:text-4xl font-black tracking-tight text-black/80 mb-3">
        {title}
      </h1>
      <p className="text-sm text-black/45 max-w-sm leading-relaxed mb-10">
        This page is being prepared. Check back soon or reach out at{" "}
        <a href="mailto:hello@aethen.ai" className="text-black/65 underline underline-offset-2 hover:text-black/80 transition-colors">
          hello@aethen.ai
        </a>
      </p>

      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-black/[0.1] text-sm font-medium text-black/55 hover:text-black/75 hover:bg-black/[0.03] transition-colors"
      >
        ← Back to home
      </Link>
    </div>
  );
}
