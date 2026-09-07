"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/use-action-toast";
import {
  acceptAllEvidenceAction,
  type ActionState,
} from "@/app/(app)/skills/actions";

export function AcceptAllEvidence({ count }: { count: number }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    acceptAllEvidenceAction,
    null,
  );
  useActionToast(state);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
      <span className="text-amber-800 dark:text-amber-300">
        <strong className="tabular-nums">{count}</strong> suggested evidence
        row{count === 1 ? "" : "s"} to review — open a skill below to check each,
        or accept them all.
      </span>
      <form action={formAction} className="ml-auto">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Accepting…" : "Accept all"}
        </Button>
      </form>
    </div>
  );
}
