"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/components/use-action-toast";
import { LEVEL_LABEL, type SkillLevel } from "@/modules/skills/levels";
import { fmtDate } from "@/lib/format";
import {
  decideEvidenceAction,
  updateEvidenceAction,
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
  github_repo: "Synced repo",
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

function EvidenceItem({ e, slug }: { e: EvidenceRow; slug: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const res = await updateEvidenceAction(prev, fd);
      if (res?.ok) setEditing(false);
      return res;
    },
    null,
  );
  useActionToast(state);

  return (
    <li className="rounded-lg border p-3">
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
        <span className="ml-auto text-muted-foreground">{fmtDate(e.createdAt)}</span>
        {e.status !== "rejected" && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form action={formAction} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="evidenceId" value={e.id} />
          <input type="hidden" name="slug" value={slug} />
          <Input
            name="summary"
            defaultValue={e.summary}
            required
            maxLength={300}
            placeholder="Summary"
            aria-label="Evidence summary"
          />
          <Textarea
            name="detail"
            defaultValue={e.detail ?? ""}
            rows={3}
            maxLength={2000}
            placeholder="Detail (optional)"
            aria-label="Evidence detail"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-2 text-sm">{e.summary}</p>
          {e.detail && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {e.detail}
            </p>
          )}
        </>
      )}

      {e.status === "suggested" && !editing && (
        <div className="mt-3">
          <DecideButtons evidenceId={e.id} slug={slug} />
        </div>
      )}
    </li>
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
        <EvidenceItem key={e.id} e={e} slug={slug} />
      ))}
    </ul>
  );
}
