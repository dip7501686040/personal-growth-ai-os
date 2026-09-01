"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface AgentStatusRow {
  agent: string;
  status: string;
  step: string | null;
  at: string | null;
  runId: string | null;
}

const WORKING = new Set([
  "triggered",
  "running",
  "gathering_context",
  "analyzing",
  "recommending",
]);

const LABEL: Record<string, string> = {
  never_run: "Idle",
  waiting_for_approval: "Waiting Approval",
  completed: "Completed",
  failed: "Failed",
};

function displayStatus(status: string): string {
  if (WORKING.has(status)) return "Working";
  return LABEL[status] ?? status;
}

const DOT_CLASS: Record<string, string> = {
  Idle: "bg-muted-foreground/40",
  Working: "bg-sky-500 animate-pulse",
  "Waiting Approval": "bg-amber-500",
  Completed: "bg-emerald-500",
  Failed: "bg-red-500",
};

interface RawRun {
  agent_name: string;
  status: string;
  current_step: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  id: string;
}

export function AgentStatusBoard({
  userId,
  initial,
}: {
  userId: string;
  initial: AgentStatusRow[];
}) {
  const [rows, setRows] = useState<Map<string, AgentStatusRow>>(
    () => new Map(initial.map((r) => [r.agent, r])),
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`agent-runs-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_runs",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as RawRun | undefined;
          if (!n?.agent_name) return;
          setRows((prev) => {
            const next = new Map(prev);
            const cur = next.get(n.agent_name);
            const isNewer = !cur || !cur.runId || cur.runId === n.id;
            const isMoreRecent =
              !cur?.at || n.created_at >= cur.at || cur.runId === n.id;
            if (isNewer || isMoreRecent) {
              next.set(n.agent_name, {
                agent: n.agent_name,
                status: n.status,
                step: n.current_step,
                at: n.finished_at ?? n.started_at ?? n.created_at,
                runId: n.id,
              });
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const list = [...rows.values()].sort((a, b) => a.agent.localeCompare(b.agent));

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((r) => {
        const label = displayStatus(r.status);
        return (
          <span
            key={r.agent}
            className="inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs"
            title={r.at ? new Date(r.at).toLocaleString() : undefined}
          >
            <span
              className={cn("size-2 rounded-full", DOT_CLASS[label] ?? "bg-muted-foreground/40")}
            />
            <span className="font-medium">{r.agent.replace(/_/g, " ")}</span>
            <span className="text-muted-foreground">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
