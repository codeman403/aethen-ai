import { Search, BrainCircuit, AlertTriangle, FileSearch, ArrowRight, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MemoryDebugPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
            <BrainCircuit className="size-6" />
          </div>
          Memory Debug Analysis
        </h2>
        <p className="text-muted-foreground text-sm">
          Diagnose retrieval failures, stale embeddings, and missing context.
        </p>
      </div>

      <div className="relative max-w-2xl group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
        </div>
        <input 
          type="text" 
          placeholder="Enter Session ID (e.g. sess_9a8b7c...)" 
          className="flex h-14 w-full rounded-xl border border-input bg-card pl-12 pr-32 text-sm shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        />
        <div className="absolute inset-y-0 right-2 flex items-center">
          <Button size="sm" className="h-10 px-6 rounded-lg font-medium tracking-wide">
            Analyze
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-card p-0 shadow-sm overflow-hidden">
            <div className="bg-muted/30 px-6 py-4 border-b flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              <h3 className="font-semibold tracking-tight">Retrieval Events Timeline</h3>
            </div>
            <div className="p-6">
              <div className="relative border-l border-muted ml-3 space-y-8 pb-4">
                
                {/* Event 1 */}
                <div className="relative pl-8">
                  <div className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-destructive ring-4 ring-card" />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">10:45:01 AM</span>
                      <span className="text-sm font-medium text-destructive flex items-center gap-1">
                        <AlertTriangle className="size-3" /> Low Similarity Score
                      </span>
                    </div>
                    <div className="text-base font-medium mt-1">Query: "how does billing work"</div>
                    
                    <div className="mt-3 bg-muted/30 rounded-lg p-4 border text-sm grid gap-3">
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-muted-foreground">Namespace</span>
                        <span className="col-span-2 font-mono">support-docs</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-muted-foreground">Top Score</span>
                        <span className="col-span-2 font-mono text-destructive font-semibold">0.45 <span className="text-muted-foreground text-xs font-normal ml-1">(Threshold: 0.70)</span></span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-muted-foreground">Chunks</span>
                        <span className="col-span-2 font-mono">3 returned</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Event 2 */}
                <div className="relative pl-8">
                  <div className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-amber-500 ring-4 ring-card" />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">10:45:04 AM</span>
                      <span className="text-sm font-medium text-amber-600 dark:text-amber-500 flex items-center gap-1">
                        <FileSearch className="size-3" /> Missing Expected Doc
                      </span>
                    </div>
                    <div className="text-base font-medium mt-1">Query: "billing cycle start date"</div>
                    
                    <div className="mt-3 bg-muted/30 rounded-lg p-4 border text-sm grid gap-3">
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-muted-foreground">Expected</span>
                        <span className="col-span-2 font-mono text-emerald-600">doc-1_billing_policy</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-muted-foreground">Actual Top</span>
                        <span className="col-span-2 font-mono text-amber-600">doc-3_legacy_billing</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500" />
            <div className="p-6">
              <h3 className="font-semibold text-lg tracking-tight mb-4">Executive Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Retrieval failed primarily due to stale embeddings in the <code className="text-xs bg-muted px-1 py-0.5 rounded">support-docs</code> namespace. The expected document (doc-1) was missed entirely, and the fallback chunks scored well below the 0.70 confidence threshold.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="font-semibold text-lg tracking-tight mb-4">Key Findings</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="size-5 text-rose-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-rose-600">Low similarity scores</h4>
                  <p className="text-xs text-rose-600/80 mt-1">Average score 0.45 indicates vector drift or poor query translation.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <FileSearch className="size-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-600">Expected document missing</h4>
                  <p className="text-xs text-amber-600/80 mt-1">doc-1 was completely absent from the top 10 returned vectors.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
