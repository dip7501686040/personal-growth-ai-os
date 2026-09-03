"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/components/use-action-toast";
import { LEVEL_LABEL, type SkillLevel } from "@/modules/skills/levels";
import { fmtDate } from "@/lib/format";
import {
  decideEvidenceAction,
  type ActionState,
} from "@/app/(app)/skills/actions";

export type EvidenceRow = {
  id: string;
  sourceType: string;
  summary: string;
  detail: string | null;
  strength: string;
  supportsLevel: SkillLevel;
  status: "suggested" | "accepted" | "rejected";
  createdBy: string;
  createdAt: string;
};

const SOURCE_LABEL: Record<string, string> = {
  learning_session: "Learning",
  dsa_attempt: "DSA",
  project_feature: "Project",
  activity_analysis: "Dev activity",
  manual: "Manual",
  agent_suggestion: "Agent",
};

const STATUS_CLASS: Record<EvidenceRow["status"], string> = {
  suggested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  accepted:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-muted text-muted-foreground line-through",
};

function DecideButtons({
  evidenceId,
  slug,
}: {
  evidenceId: string;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    decideEvidenceAction,
    null,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="flex gap-2">
      <input type="hidden" name="evidenceId" value={evidenceId} />
      <input type="hidden" name="slug" value={slug} />
      <Button
        type="submit"
        name="decision"
        value="accepted"
        size="sm"
        variant="outline"
        disabled={pending}
      >
        Accept
      </Button>
      <Button
        type="submit"
        name="decision"
        value="rejected"
        size="sm"
        variant="ghost"
        disabled={pending}
      >
        Reject
      </Button>
    </form>
  );
}

export function EvidenceList({
  evidence,
  slug,
}: {
  evidence: EvidenceRow[];
  slug: string;
}) {
  if (evidence.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No evidence yet. Add what you&apos;ve done below.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {evidence.map((e) => (
        <li key={e.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium",
                STATUS_CLASS[e.status],
              )}
            >
              {e.status}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {SOURCE_LABEL[e.sourceType] ?? e.sourceType}
            </span>
            <span className="text-muted-foreground">
              supports {LEVEL_LABEL[e.supportsLevel]} · {e.strength}
            </span>
            <span className="ml-auto text-muted-foreground">
              {fmtDate(e.createdAt)}
            </span>
          </div>

          <p className="mt-2 text-sm">{e.summary}</p>
          {e.detail && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {e.detail}
            </p>
          )}

          {e.status === "suggested" && (
            <div className="mt-3">
              <DecideButtons evidenceId={e.id} slug={slug} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
