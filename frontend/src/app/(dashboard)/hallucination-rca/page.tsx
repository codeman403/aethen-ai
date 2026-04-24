import { Search, ScanSearch, CheckCircle2, XCircle, FileText, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HallucinationRCAPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
            <ScanSearch className="size-6" />
          </div>
          Hallucination RCA
        </h2>
        <p className="text-muted-foreground text-sm">
          Trace fabricated claims back to source documents and measure grounding scores.
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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Metric Header */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-b divide-x">
          <div className="p-6 bg-rose-500/5">
            <p className="text-sm font-medium text-muted-foreground mb-1">Grounding Score</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-rose-600">45%</span>
              <span className="text-sm text-rose-600/80 font-medium mb-1 border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 rounded">Poor</span>
            </div>
          </div>
          <div className="p-6 bg-muted/10">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Claims</p>
            <span className="text-3xl font-bold text-foreground">4</span>
          </div>
          <div className="p-6 bg-muted/10">
            <p className="text-sm font-medium text-muted-foreground mb-1">Verified</p>
            <span className="text-3xl font-bold text-emerald-600">1</span>
          </div>
          <div className="p-6 bg-muted/10">
            <p className="text-sm font-medium text-muted-foreground mb-1">Hallucinated</p>
            <span className="text-3xl font-bold text-rose-600">3</span>
          </div>
        </div>
        
        {/* Comparison Panel */}
        <div className="p-8">
          <div className="grid gap-8 md:grid-cols-2">
            {/* Left: LLM Output */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Target className="size-4 text-primary" />
                <h3 className="font-semibold tracking-tight">LLM Response Generation</h3>
              </div>
              <div className="p-5 bg-muted/30 border rounded-xl leading-relaxed text-sm shadow-inner relative">
                <div className="absolute top-2 right-2 flex gap-1">
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                </div>
                "Based on the retrieved context, your pro-rated refund will be processed automatically. 
                <span className="mx-1 px-1.5 py-0.5 bg-rose-500/10 border-b-2 border-rose-500 text-rose-700 dark:text-rose-400 font-medium rounded-sm">
                  The billing cycle is 30 days
                </span> 
                and you can expect the funds in your account shortly."
                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground font-mono flex items-center gap-1">
                   <span>Citations:</span>
                   <span className="bg-background border px-1.5 py-0.5 rounded">doc-3</span>
                </div>
              </div>
            </div>
            
            {/* Right: Source Truth */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <FileText className="size-4 text-primary" />
                <h3 className="font-semibold tracking-tight">Source Verification</h3>
              </div>
              
              <div className="space-y-3">
                <div className="p-4 bg-background border rounded-xl shadow-sm text-sm border-l-4 border-l-rose-500">
                  <div className="flex gap-3">
                    <XCircle className="size-5 text-rose-500 shrink-0 mt-0.5" />
                    <div className="space-y-1.5">
                      <p className="font-semibold text-foreground">Fabricated Detail Detected</p>
                      <p className="text-muted-foreground leading-relaxed">
                        The claim <strong className="text-foreground">"30 days"</strong> is not found in the cited source (doc-3). 
                        The actual source text explicitly states a 14-day cycle.
                      </p>
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono border">
                        doc-3 excerpt: "...all plans operate on a standard 14-day rolling cycle..."
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-background border rounded-xl shadow-sm text-sm border-l-4 border-l-emerald-500">
                  <div className="flex gap-3">
                    <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Verified Claim</p>
                      <p className="text-muted-foreground">"refund will be processed automatically" matches doc-3.</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Primary Root Cause</h3>
              <p className="text-lg font-medium text-foreground flex items-center gap-2">
                Source Misattribution / Context Hallucination
              </p>
            </div>
            <Button variant="outline">View Full Trace Logs</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
