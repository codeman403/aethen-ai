import { 
  Activity, 
  BrainCircuit, 
  Wrench, 
  ScanSearch, 
  ArrowUpRight, 
  ArrowDownRight,
  MoreHorizontal
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Platform Overview</h2>
        <p className="text-muted-foreground text-sm">
          Agent performance metrics and real-time failure intelligence.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Traces", value: "24,592", description: "Ingested last 30 days", icon: Activity, trend: "+12.5%", positive: true },
          { label: "Memory Failures", value: "482", description: "Retrieval issues detected", icon: BrainCircuit, trend: "-4.2%", positive: true },
          { label: "Tool Misfires", value: "1,204", description: "API/tool execution errors", icon: Wrench, trend: "+8.1%", positive: false },
          { label: "Blind Spots", value: "18", description: "Systemic knowledge gaps", icon: ScanSearch, trend: "-2.0%", positive: true },
        ].map((card) => {
          const Icon = card.icon;
          const TrendIcon = card.positive ? ArrowDownRight : ArrowUpRight;
          return (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-all hover:shadow-md hover:border-primary/20 group"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{card.label}</p>
                <div className={`p-2.5 rounded-lg ${card.positive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                   <Icon className="size-[18px]" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <p className="text-3xl font-bold tracking-tight">{card.value}</p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className={`flex items-center font-medium px-1.5 py-0.5 rounded-md ${card.positive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                  <TrendIcon className="mr-1 size-3" />
                  {card.trend}
                </span>
                <span className="text-muted-foreground">{card.description}</span>
              </div>
            </div>
          )
        })}
      </div>
      
      <div className="grid gap-6 md:grid-cols-7">
        <div className="col-span-4 rounded-xl border bg-card p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-semibold text-lg tracking-tight">Failure Distribution</h3>
              <p className="text-xs text-muted-foreground mt-1">Daily failure count across all modules</p>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-md border">Last 7 days</span>
          </div>
          <div className="h-[200px] w-full flex items-end justify-between gap-3 pt-8 mt-auto">
            {/* Elegant minimal bar chart placeholder */}
            {[40, 25, 60, 30, 80, 45, 90].map((h, i) => (
              <div key={i} className="w-full bg-muted/50 rounded-t-md relative group h-full flex items-end">
                <div 
                  className="w-full bg-primary/90 rounded-t-md transition-all duration-500 group-hover:bg-primary shadow-[0_0_10px_rgba(0,0,0,0.1)]" 
                  style={{ height: `${h}%` }}
                ></div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-[11px] font-medium text-muted-foreground px-2 uppercase tracking-wider">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
        </div>

        <div className="col-span-3 rounded-xl border bg-card p-0 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b flex items-center justify-between bg-muted/10">
            <div>
              <h3 className="font-semibold text-lg tracking-tight">Recent Alerts</h3>
              <p className="text-xs text-muted-foreground mt-1">System notifications and anomalies</p>
            </div>
            <button className="text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {[
              { title: "Spike in Tool Misfires", time: "10 mins ago", type: "error", desc: "Payment API timeout rate > 15%" },
              { title: "New Blind Spot Cluster Detected", time: "2 hours ago", type: "warning", desc: "14 sessions failed on 'billing policies'" },
              { title: "Vector DB Latency High", time: "5 hours ago", type: "warning", desc: "Average retrieval > 800ms" },
              { title: "Memory Debug Analysis Complete", time: "1 day ago", type: "info", desc: "Analyzed 482 sessions successfully" }
            ].map((alert, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                <div className={`mt-0.5 size-2.5 rounded-full shadow-sm ${
                  alert.type === 'error' ? 'bg-rose-500 shadow-rose-500/40' : 
                  alert.type === 'warning' ? 'bg-amber-500 shadow-amber-500/40' : 'bg-blue-500 shadow-blue-500/40'
                }`} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium leading-none text-foreground">{alert.title}</p>
                    <span className="text-[10px] font-medium text-muted-foreground">{alert.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
