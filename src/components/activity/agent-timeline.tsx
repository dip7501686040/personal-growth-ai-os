"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  id: string;
  ts: string;
  agent: string;
  level: string;
  step: string | null;
  message: string;
}

const LEVEL_CLASS: Record<string, string> = {
  info: "bg-sky-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

const MAX_ENTRIES = 60;

export function AgentTimeline({
  userId,
  initialEntries,
  initialRunAgentMap,
}: {
  userId: string;
  initialEntries: TimelineEntry[];
  initialRunAgentMap: Record<string, string>;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const runAgentMap = useRef(new Map(Object.entries(initialRunAgentMap)));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`agent-timeline-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_runs",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as { id: string; agent_name: string };
          runAgentMap.current.set(n.id, n.agent_name);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_events",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as {
            id: string;
            ts: string;
            agent_run_id: string;
            level: string;
            step: string | null;
            message: string;
          };
          const entry: TimelineEntry = {
            id: n.id,
            ts: n.ts,
            agent: runAgentMap.current.get(n.agent_run_id) ?? "agent",
            level: n.level,
            step: n.step,
            message: n.message,
          };
          setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No agent activity yet — run any agent to see its steps here live.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start gap-2 text-sm">
          <span
            className={cn(
              "mt-1.5 size-1.5 shrink-0 rounded-full",
              LEVEL_CLASS[e.level] ?? "bg-muted-foreground",
            )}
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {new Date(e.ts).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs">
            {e.agent.replace(/_/g, " ")}
          </span>
          <span className="min-w-0 truncate text-muted-foreground">
            {e.message}
          </span>
        </li>
      ))}
    </ol>
  );
}
