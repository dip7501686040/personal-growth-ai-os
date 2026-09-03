"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import { logSessionAction, type ActionState } from "@/app/(app)/learning/actions";

const CATEGORIES = [
  ["technology", "Technology / topic"],
  ["system_design", "System design"],
  ["dsa", "DSA"],
  ["revision", "Revision"],
] as const;

export function LogSessionForm({
  skillOptions,
}: {
  skillOptions: { id: string; name: string }[];
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    logSessionAction,
    null,
  );
  useActionToast(state, () => ref.current?.reset());

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="topic">Topic</Label>
        <Input id="topic" name="topic" placeholder="e.g. Idempotent consumers" required />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Category</Label>
          <NativeSelect id="category" name="category" defaultValue="technology">
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="durationMinutes">Minutes</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={0}
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="confidenceBefore">Confidence before (0–100)</Label>
          <Input id="confidenceBefore" name="confidenceBefore" type="number" min={0} max={100} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confidenceAfter">Confidence after</Label>
          <Input id="confidenceAfter" name="confidenceAfter" type="number" min={0} max={100} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="resourceUrl">Resource URL (optional)</Label>
        <Input id="resourceUrl" name="resourceUrl" type="url" placeholder="https://…" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Notes (optional)</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>

      {skillOptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="skillIds">
            Link skills (optional — Ctrl/Cmd-click for multiple)
          </Label>
          <select
            id="skillIds"
            name="skillIds"
            multiple
            size={4}
            className="rounded-lg border border-input bg-transparent p-2 text-sm dark:bg-input/30"
          >
            {skillOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Linked skills get a learning-level evidence entry.
          </p>
        </div>
      )}

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Log session"}
      </Button>
    </form>
  );
}
