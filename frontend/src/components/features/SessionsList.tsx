"use client";

import { useEffect, useState } from "react";
import { Clock, Layers, Loader2, Zap, ChevronRight, AlertCircle, Search } from "lucide-react";
import { fetchSessionsByType } from "@/lib/api";

interface SessionsListProps {
  failureType: string;
  onSelect: (sessionData: object) => void;
  selectedId?: string | null;
}

interface RawSession {
  session_id: string;
  agent_id: string;
  failure_summary?: string;
  timestamp?: string;
  llm_calls?: unknown[];
  tool_calls?: unknown[];
  retrieval_events?: unknown[];
}

export function SessionsList({ failureType, onSelect, selectedId }: SessionsListProps) {
  const [sessions, setSessions] = useState<RawSession[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessionsByType(failureType)
      .then((data) => setSessions(data as RawSession[]))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [failureType]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-sm py-12 text-foreground/60">
        <Loader2 className="size-5 animate-spin text-primary" />
        Fetching sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-sm py-12 text-foreground/60">
        <AlertCircle className="size-6 mb-3 opacity-50" />
        <p>No sessions ingested yet.</p>
        <p className="mt-1 text-xs opacity-70">Pull traces from the dashboard first.</p>
      </div>
    );
  }

  const filteredSessions = sessions.filter(s => 
    s.session_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.agent_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.failure_summary && s.failure_summary.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 mb-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
          <input 
            type="text" 
            placeholder="Search..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium text-foreground/60 uppercase tracking-wider">
            {filteredSessions.length} session{filteredSessions.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      
      <div className="flex flex-col gap-1 overflow-y-auto px-1 pb-2">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-4 text-xs text-foreground/50">No matches</div>
        ) : (
          filteredSessions.map((s) => {
            const isSelected = s.session_id === selectedId;
            const eventCount =
              (s.llm_calls?.length ?? 0) +
              (s.tool_calls?.length ?? 0) +
              (s.retrieval_events?.length ?? 0);
              
            return (
              <button
                key={s.session_id}
                onClick={() => onSelect(s)}
                className={`group flex flex-col text-left rounded-md border p-2.5 transition-all duration-200 ${
                  isSelected
                    ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                    : "border-transparent bg-transparent hover:border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider ${isSelected ? 'bg-primary/20 text-primary' : 'bg-muted text-foreground/70 group-hover:text-primary'}`}>
                    {s.agent_id}
                  </span>
                  {s.timestamp && (
                    <span className="text-[10px] text-foreground/50 flex items-center gap-1">
                      <Clock className="size-3" />
                      {new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center justify-between w-full mb-1">
                  <span className={`text-[11px] font-mono truncate pr-2 ${isSelected ? 'text-primary font-medium' : 'text-foreground/70 font-normal'}`}>
                    {s.session_id}
                  </span>
                  <ChevronRight className={`size-3 shrink-0 transition-transform duration-300 ${isSelected ? 'text-primary translate-x-0.5' : 'text-foreground/30 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5'}`} />
                </div>
                
                <div className="flex items-center justify-between w-full mt-1.5">
                  <p className={`text-[11px] line-clamp-1 pr-2 ${isSelected ? 'text-foreground/90' : 'text-foreground/50'}`}>
                    {s.failure_summary ? s.failure_summary.split('\\n')[0] : "No summary"}
                  </p>
                  <span className="flex items-center gap-1 text-[10px] text-foreground/50 shrink-0">
                    <Layers className="size-3" /> {eventCount}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
