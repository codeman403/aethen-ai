import { Search, Wrench, Clock, AlertOctagon, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ToolMisfirePage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
            <Wrench className="size-6" />
          </div>
          Tool Misfire Analysis
        </h2>
        <p className="text-muted-foreground text-sm">
          Diagnose API failures, timeout cascades, and bad parameter logic.
        </p>
      </div>

      <div className="relative max-w-2xl group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
        </div>
        <input 
          type="text" 
          placeholder="Enter Session ID..." 
          className="flex h-14 w-full rounded-xl border border-input bg-card pl-12 pr-32 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        />
        <div className="absolute inset-y-0 right-2 flex items-center">
          <Button size="sm" className="h-10 px-6 rounded-lg font-medium tracking-wide">
            Analyze
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-0 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-muted/30 px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" />
              <h3 className="font-semibold tracking-tight">Call Sequence (Waterfall)</h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground bg-background px-2 py-1 rounded border">Total latency: 90.5s</span>
          </div>
          
          <div className="p-6 space-y-4 bg-[#FAFAFA] dark:bg-[#0A0A0A]">
            {[1, 2, 3].map((attempt) => (
              <div key={attempt} className="rounded-lg border border-rose-500/30 bg-rose-500/5 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-rose-500/10 border-b border-rose-500/20">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold bg-background/50 border border-rose-500/20 text-rose-600 rounded-md px-1.5 py-0.5">
                      #{attempt}
                    </span>
                    <span className="font-mono text-sm font-semibold text-foreground">payment_api</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="size-3.5 text-rose-500" />
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tracking-wider">TIMEOUT (30.0s)</span>
                  </div>
                </div>
                <div className="px-4 py-3 text-sm flex items-start gap-2">
                  <AlertOctagon className="size-4 text-rose-500 mt-0.5 shrink-0" />
                  <div className="font-mono text-rose-600/90 text-xs">
                    Error: Connection timed out after 30000ms waiting for response from upstream payment gateway.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
             <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-rose-500 to-rose-700" />
            <div className="p-6">
              <h3 className="font-semibold text-lg tracking-tight mb-4">Executive Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The agent entered a retry storm attempting to call <code className="text-xs bg-muted px-1 py-0.5 rounded">payment_api</code>. The upstream service timed out 3 times consecutively, consuming 90 seconds of total execution time before the graph forcefully halted the run.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="font-semibold text-lg tracking-tight mb-4">Recommendations</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>Implement a strict circuit breaker pattern for <code className="text-xs bg-muted px-1 py-0.5 rounded">payment_api</code> to fail fast.</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>Reduce maximum agent tool timeout from 30s to 5s.</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span>Add explicit fallback logic to prompt user if payment gateway is degraded.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
