export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          AI Agent failure intelligence at a glance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Traces", value: "—", description: "Ingested traces" },
          { label: "Memory Failures", value: "—", description: "Retrieval issues detected" },
          { label: "Tool Misfires", value: "—", description: "Tool call errors" },
          { label: "Blind Spots", value: "—", description: "Systemic gaps found" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
          >
            <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
