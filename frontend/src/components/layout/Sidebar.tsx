import Link from "next/link";

const navItems = [
  { label: "Dashboard", href: "/", icon: "📊" },
  { label: "Memory Debug", href: "/memory-debug", icon: "🧠" },
  { label: "Tool Misfire", href: "/tool-misfire", icon: "🔧" },
  { label: "Hallucination RCA", href: "/hallucination-rca", icon: "🔍" },
  { label: "Blind Spots", href: "/blind-spots", icon: "👁️" },
];

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-muted/40 p-4 flex flex-col gap-2">
      <div className="mb-6 px-2">
        <h1 className="text-lg font-bold">Aethen-AI</h1>
        <p className="text-xs text-muted-foreground">Agent Reliability Studio</p>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
