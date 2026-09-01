"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import { LEVEL_LABEL, SKILL_LEVELS, type SkillLevel } from "@/modules/skills/levels";
import { changeLevelAction, type ActionState } from "@/app/(app)/skills/actions";

export function ChangeLevelForm({
  skillId,
  slug,
  currentLevel,
}: {
  skillId: string;
  slug: string;
  currentLevel: SkillLevel;
}) {
  const [target, setTarget] = useState<SkillLevel>(currentLevel);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    changeLevelAction,
    null,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="skillId" value={skillId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="targetLevel">Target level</Label>
        <NativeSelect
          id="targetLevel"
          name="targetLevel"
          value={target}
          onChange={(e) => setTarget(e.target.value as SkillLevel)}
        >
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="justification">Why (optional)</Label>
        <Textarea
          id="justification"
          name="justification"
          rows={2}
          placeholder="What you did that supports this level"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Small, evidenced changes apply immediately. Big jumps — or reaching
        Implemented / Proven without project or activity evidence — go to the
        Approval Inbox.
      </p>

      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending || target === currentLevel}
        className="self-start"
      >
        {pending ? "Working…" : "Request level change"}
      </Button>
    </form>
  );
}
