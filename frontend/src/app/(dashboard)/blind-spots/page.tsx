import { Network, Search, AlertCircle, TrendingUp, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BlindSpotsPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
            <Network className="size-6" />
          </div>
          Systemic Blind Spots
        </h2>
        <p className="text-muted-foreground text-sm">
          Discover cross-session knowledge gaps via graph pattern analysis.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 h-[600px]">
        {/* Interactive Graph Area */}
        <div className="lg:col-span-2 border rounded-xl bg-card shadow-sm flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/10 flex justify-between items-center z-10">
            <h2 className="font-semibold flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" />
              Cluster Map (Neo4j Graph Data)
            </h2>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md border">
                <span className="size-2 rounded-full bg-rose-500" /> High Impact
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md border">
                <span className="size-2 rounded-full bg-amber-500" /> Medium Impact
              </span>
            </div>
          </div>
          
          <div className="flex-1 relative bg-[#FAFAFA] dark:bg-[#050505] overflow-hidden" 
               style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.05) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
            
            {/* Visual representation of nodes/clusters */}
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="relative w-full max-w-lg aspect-square">
                
                {/* Connecting Lines (SVG overlay placeholder) */}
                <svg className="absolute inset-0 w-full h-full stroke-muted-foreground/20" strokeWidth="2" fill="none">
                  <path d="M 250 250 L 150 150 M 250 250 L 350 120 M 250 250 L 250 380" strokeDasharray="4 4" />
                </svg>

                {/* Center Node (Agent Core) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
                   <div className="size-16 rounded-full bg-card border shadow-lg flex items-center justify-center">
                     <span className="font-bold text-xl text-primary">Ae</span>
                   </div>
                </div>

                {/* Node 1: Billing (Selected) */}
                <div className="absolute top-[20%] left-[20%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 cursor-pointer group z-20">
                   <div className="p-4 rounded-full bg-rose-500/10 border-2 border-rose-500 text-rose-600 shadow-[0_0_20px_rgba(244,63,94,0.3)] scale-110 transition-transform">
                     <AlertCircle className="size-6" />
                   </div>
                   <div className="bg-card border px-3 py-1.5 rounded-lg shadow-sm text-center">
                     <p className="text-sm font-bold leading-tight">Billing Policies</p>
                     <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">14 Failures</p>
                   </div>
                </div>

                {/* Node 2: SSO */}
                <div className="absolute top-[15%] right-[20%] translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 cursor-pointer group hover:scale-105 transition-transform z-10">
                   <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/50 text-amber-600 shadow-sm">
                     <Network className="size-5" />
                   </div>
                   <div className="bg-card border px-2 py-1 rounded-md shadow-sm text-center opacity-80 group-hover:opacity-100">
                     <p className="text-xs font-semibold leading-tight">Enterprise SSO</p>
                     <p className="text-[9px] text-muted-foreground">8 Failures</p>
                   </div>
                </div>

                {/* Node 3: Passwords */}
                <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 translate-y-1/2 flex flex-col items-center gap-2 cursor-pointer group hover:scale-105 transition-transform z-10">
                   <div className="p-2.5 rounded-full bg-muted border text-muted-foreground shadow-sm">
                     <TrendingUp className="size-4" />
                   </div>
                   <div className="bg-card border px-2 py-1 rounded-md shadow-sm text-center opacity-60 group-hover:opacity-100">
                     <p className="text-xs font-semibold leading-tight">Password Reset</p>
                     <p className="text-[9px] text-muted-foreground">2 Failures</p>
                   </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Selected Details Panel */}
        <div className="border rounded-xl bg-card shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 bg-rose-500/5 border-b border-rose-500/10">
            <h2 className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1">
              Selected Cluster
            </h2>
            <h3 className="text-2xl font-bold tracking-tight text-foreground">
              Billing Policies
            </h3>
          </div>
          
          <div className="p-6 space-y-8 flex-1 overflow-auto">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Impact</span>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-foreground">14</span>
                <span className="text-sm font-medium text-muted-foreground leading-tight">
                  related sessions<br/>failed in last 7 days
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Common Query Pattern</span>
              <div className="bg-muted/50 p-3 rounded-lg border font-mono text-sm shadow-inner text-foreground">
                "pro-rated refunds after cancellation"
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Recommended Action</span>
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <p className="text-sm text-primary-foreground font-medium leading-relaxed">
                  The agent lacks knowledge of the updated Q3 refund policy. Add <code className="bg-primary/20 px-1 rounded mx-0.5">billing-refunds</code> tool or inject the latest policy doc into the Pinecone index.
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t bg-muted/10">
            <Button className="w-full font-medium" variant="default">
              View All 14 Traces
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
