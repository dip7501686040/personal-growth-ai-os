"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import {
  EVIDENCE_STRENGTHS,
  LEVEL_LABEL,
  SKILL_LEVELS,
  type EvidenceStrength,
} from "@/modules/skills/levels";
import { addEvidenceAction, type ActionState } from "@/app/(app)/skills/actions";

const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  weak: "Weak",
  moderate: "Moderate",
  strong: "Strong",
};

export function AddEvidenceForm({
  skillId,
  slug,
}: {
  skillId: string;
  slug: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addEvidenceAction,
    null,
  );
  useActionToast(state, () => formRef.current?.reset());

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="skillId" value={skillId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">What you did</Label>
        <Input
          id="summary"
          name="summary"
          placeholder="e.g. Built a retry + DLQ consumer in the notification service"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="detail">Detail (optional)</Label>
        <Textarea id="detail" name="detail" rows={2} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="supportsLevel">Supports level</Label>
          <NativeSelect
            id="supportsLevel"
            name="supportsLevel"
            defaultValue="practiced"
          >
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="strength">Strength</Label>
          <NativeSelect id="strength" name="strength" defaultValue="moderate">
            {EVIDENCE_STRENGTHS.map((s) => (
              <option key={s} value={s}>
                {STRENGTH_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Manual evidence caps at Practiced on its own. Implemented / Proven need
        project features or captured development activity.
      </p>

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add evidence"}
      </Button>
    </form>
  );
}
