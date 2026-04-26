"use client";

import { useEffect, useState } from "react";
import { Clock, Layers, Loader2, Zap } from "lucide-react";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessionsByType(failureType)
      .then((data) => setSessions(data as RawSession[]))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [failureType]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="size-4 animate-spin" />
        Loading sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No Langfuse sessions ingested yet for this failure type.
        <br />
        Pull traces from the dashboard first.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {sessions.length} session{sessions.length !== 1 ? "s" : ""} from Langfuse
      </p>
      {sessions.map((s) => {
        const isSelected = s.session_id === selectedId;
        const eventCount =
          (s.llm_calls?.length ?? 0) +
          (s.tool_calls?.length ?? 0) +
          (s.retrieval_events?.length ?? 0);
        return (
          <button
            key={s.session_id}
            onClick={() => onSelect(s)}
            className={`w-full text-left rounded-lg border p-3 transition-all hover:border-primary/40 hover:bg-muted/40 ${
              isSelected
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-foreground truncate">{s.session_id}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {s.agent_id}
                </p>
                {s.failure_summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 opacity-80">
                    {s.failure_summary}
                  </p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {s.timestamp && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />
                    {new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Layers className="size-3" />
                  {eventCount} event{eventCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <Zap className="size-3 text-primary" />
              <span className="text-[10px] font-medium text-primary">Click to analyze</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
