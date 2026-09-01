"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import { RunAgentButton } from "@/components/run-agent-button";
import {
  requestApplyAction,
  setOpportunityStatusAction,
  type ActionState,
} from "@/app/(app)/career/actions";

export function OpportunityActions({
  opportunityId,
  status,
  hasMatch,
  applyPending,
}: {
  opportunityId: string;
  status: string;
  hasMatch: boolean;
  applyPending: boolean;
}) {
  const [applyState, applyAction, applying] = useActionState<ActionState, FormData>(
    requestApplyAction,
    null,
  );
  const [statusState, statusAction] = useActionState<ActionState, FormData>(
    setOpportunityStatusAction,
    null,
  );
  useActionToast(applyState);
  useActionToast(statusState);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <RunAgentButton
        agent="career"
        label={hasMatch ? "Re-analyze" : "Analyze"}
        input={{ opportunityId }}
      />

      <form action={statusAction}>
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <NativeSelect
          name="status"
          defaultValue={status}
          className="w-36"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="new">new</option>
          <option value="analyzed">analyzed</option>
          <option value="applied">applied</option>
          <option value="rejected">rejected</option>
          <option value="archived">archived</option>
        </NativeSelect>
      </form>

      {status === "applied" ? (
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          Applied ✓
        </span>
      ) : applyPending ? (
        <span className="text-sm text-muted-foreground">
          Apply pending in Approval Inbox
        </span>
      ) : (
        <form action={applyAction}>
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <Button type="submit" size="sm" variant="outline" disabled={applying}>
            Apply…
          </Button>
        </form>
      )}
    </div>
  );
}
