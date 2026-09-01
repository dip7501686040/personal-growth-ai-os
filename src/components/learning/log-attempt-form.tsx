"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import { logAttemptAction, type ActionState } from "@/app/(app)/learning/actions";

const FAILURE_REASONS = [
  ["none", "Solved / n/a"],
  ["could_not_identify_pattern", "Couldn't identify the pattern"],
  ["knew_pattern_impl_bug", "Knew the pattern, implementation bug"],
  ["tle", "TLE / too slow"],
  ["other", "Other"],
] as const;

export function LogAttemptForm({
  problemOptions,
}: {
  problemOptions: { id: string; title: string }[];
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    logAttemptAction,
    null,
  );
  useActionToast(state, () => ref.current?.reset());

  if (problemOptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a problem first, then log attempts against it.
      </p>
    );
  }

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="problemId">Problem</Label>
        <NativeSelect id="problemId" name="problemId" defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {problemOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </NativeSelect>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="solved" className="size-4" />
        Solved
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="timeTakenMinutes">Minutes</Label>
          <Input id="timeTakenMinutes" name="timeTakenMinutes" type="number" min={0} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="hintsUsed">Hints used</Label>
          <Input id="hintsUsed" name="hintsUsed" type="number" min={0} defaultValue={0} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="confidenceBefore">Confidence before</Label>
          <Input id="confidenceBefore" name="confidenceBefore" type="number" min={0} max={100} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confidenceAfter">Confidence after</Label>
          <Input id="confidenceAfter" name="confidenceAfter" type="number" min={0} max={100} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="failureReason">If not solved cleanly, why?</Label>
        <NativeSelect id="failureReason" name="failureReason" defaultValue="none">
          {FAILURE_REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          &quot;Couldn&apos;t identify the pattern&quot; is what drives the
          recognition-gap analysis.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Log attempt"}
      </Button>
    </form>
  );
}
