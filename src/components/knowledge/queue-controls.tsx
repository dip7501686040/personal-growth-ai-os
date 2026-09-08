"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { AgentRunConsole } from "@/components/agent-run-console";
import { Button } from "@/components/ui/button";
import { drainNowAction, type ActionState } from "@/app/(app)/knowledge/actions";
import type { AgentConsoleData } from "@/modules/agents/runs";

/**
 * Queue processing for the Knowledge page.
 * - Primary: the shared agent run console for `extractor` — one queued job per
 *   click, streaming its LangGraph steps live (same UX as every other agent).
 * - Secondary: "Re-sync knowledge" runs the bounded server drain
 *   (`drainNowAction`) — extract a few queued items, then a full
 *   `resyncKnowledge` (drain the outbox, re-embed entities, re-map every doc).
 *   This is the manual catch-up now that no cron does it.
 *
 * Combining duplicate queue items is handled by <QueueList> (per-row selection).
 */
export function QueueControls({
  userId,
  initial,
}: {
  userId: string;
  initial: AgentConsoleData;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    drainNowAction,
    null,
  );
  const seen = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <AgentRunConsole
        agent="extractor"
        userId={userId}
        label="Process queue now"
        initial={initial}
      />
      <form action={formAction}>
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          disabled={pending}
          className="text-muted-foreground"
        >
          {pending ? "Re-syncing…" : "Re-sync knowledge"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        &ldquo;Process queue now&rdquo; extracts one queued item and streams its
        steps. &ldquo;Re-sync knowledge&rdquo; drains a few queued items then
        re-embeds entities and re-maps every document — the manual catch-up
        (nothing runs on a schedule any more).
      </p>
    </div>
  );
}
