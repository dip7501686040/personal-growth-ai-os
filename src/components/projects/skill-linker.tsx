"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import {
  linkSkillAction,
  unlinkSkillAction,
  type ActionState,
} from "@/app/(app)/projects/actions";

type Linked = { linkId: string; skillId: string; name: string; role: string };

const ROLE_CLASS: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  used: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  demonstrated:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

export function SkillLinker({
  projectId,
  slug,
  featureId,
  skills,
  linked,
  compact,
}: {
  projectId: string;
  slug: string;
  featureId?: string;
  skills: { id: string; name: string }[];
  linked: Linked[];
  compact?: boolean;
}) {
  const [linkState, linkAction, linking] = useActionState<ActionState, FormData>(
    linkSkillAction,
    null,
  );
  const [unlinkState, unlinkAction] = useActionState<ActionState, FormData>(
    unlinkSkillAction,
    null,
  );
  useActionToast(linkState);
  useActionToast(unlinkState);

  const linkedIds = new Set(linked.map((l) => l.skillId));
  const available = skills.filter((s) => !linkedIds.has(s.id));

  return (
    <div className="flex flex-col gap-2">
      {linked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {linked.map((l) => (
            <span
              key={l.linkId}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            >
              <span>{l.name}</span>
              <span
                className={`rounded-full px-1.5 ${ROLE_CLASS[l.role] ?? ""}`}
              >
                {l.role}
              </span>
              <form action={unlinkAction} className="inline">
                <input type="hidden" name="linkId" value={l.linkId} />
                <input type="hidden" name="slug" value={slug} />
                <button
                  type="submit"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Unlink ${l.name}`}
                >
                  ×
                </button>
              </form>
            </span>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <form
          action={linkAction}
          className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-end gap-2"}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="slug" value={slug} />
          {featureId && (
            <input type="hidden" name="featureId" value={featureId} />
          )}
          <NativeSelect name="skillId" defaultValue="" className="w-44">
            <option value="" disabled>
              Link a skill…
            </option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="role" defaultValue="used" className="w-36">
            <option value="planned">planned</option>
            <option value="used">used</option>
            <option value="demonstrated">demonstrated</option>
          </NativeSelect>
          <Button type="submit" size="sm" variant="outline" disabled={linking}>
            Link
          </Button>
        </form>
      )}
    </div>
  );
}
