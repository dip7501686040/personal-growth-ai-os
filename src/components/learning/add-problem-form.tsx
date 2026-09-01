"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import { addProblemAction, type ActionState } from "@/app/(app)/learning/actions";

export function AddProblemForm({
  patternOptions,
}: {
  patternOptions: { id: string; name: string }[];
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addProblemAction,
    null,
  );
  useActionToast(state, () => ref.current?.reset());

  return (
    <form ref={ref} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" placeholder="e.g. Number of Islands" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <NativeSelect id="difficulty" name="difficulty" defaultValue="medium">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="topic">Topic (optional)</Label>
          <Input id="topic" name="topic" placeholder="Graphs" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sourceUrl">Source URL (optional)</Label>
        <Input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://…" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="patternIds">Patterns (Ctrl/Cmd-click for multiple)</Label>
        <select
          id="patternIds"
          name="patternIds"
          multiple
          size={6}
          required
          className="rounded-lg border border-input bg-transparent p-2 text-sm dark:bg-input/30"
        >
          {patternOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add problem"}
      </Button>
    </form>
  );
}
