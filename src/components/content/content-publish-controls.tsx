"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/use-action-toast";
import { RunAgentButton } from "@/components/run-agent-button";
import {
  markPublishedAction,
  requestPublishAction,
  type ActionState,
} from "@/app/(app)/content/actions";

export function ContentPublishControls({
  id,
  status,
  publishPending,
}: {
  id: string;
  status: string;
  publishPending: boolean;
}) {
  const [pubState, pubAction, pubbing] = useActionState<ActionState, FormData>(
    requestPublishAction,
    null,
  );
  const [doneState, doneAction, doning] = useActionState<ActionState, FormData>(
    markPublishedAction,
    null,
  );
  useActionToast(pubState);
  useActionToast(doneState);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "idea" || status === "draft") && (
        <RunAgentButton
          agent="content"
          label={status === "idea" ? "Generate LinkedIn draft" : "Regenerate draft"}
          input={{ contentItemId: id }}
        />
      )}

      {publishPending ? (
        <span className="text-sm text-muted-foreground">
          Publish pending in Approval Inbox
        </span>
      ) : status === "draft" || status === "ready_for_review" ? (
        <form action={pubAction}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" size="sm" variant="outline" disabled={pubbing}>
            Request publish
          </Button>
        </form>
      ) : null}

      {status === "approved" && (
        <form action={doneAction}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" size="sm" disabled={doning}>
            Mark as published
          </Button>
        </form>
      )}

      {status === "published" && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          Published ✓
        </span>
      )}
    </div>
  );
}
