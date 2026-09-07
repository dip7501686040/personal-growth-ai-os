"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  setPreferredModelAction,
  type ActionState,
} from "@/app/(app)/settings/actions";

export interface ModelOption {
  key: string;
  label: string;
  provider: string;
  hasKey: boolean;
}

export function ModelPicker({
  options,
  current,
}: {
  options: ModelOption[];
  /** `choiceKey` of the current preferred model, or "default". */
  current: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setPreferredModelAction,
    null,
  );
  const seen = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const selected = options.find((o) => o.key === current);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
      <NativeSelect name="model" defaultValue={current} disabled={pending}>
        <option value="default">Default — automatic ladder (Gemini → OpenAI)</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
            {o.hasKey ? "" : " — API key not set"}
          </option>
        ))}
      </NativeSelect>

      {selected && !selected.hasKey && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {selected.provider === "anthropic"
            ? "ANTHROPIC_API_KEY"
            : `${selected.provider.toUpperCase()}_API_KEY`}{" "}
          isn&apos;t set — agents will fall back to the default chain until you add it.
        </p>
      )}

      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Applies to every in-app agent and the nightly crons. The job-application
        flow in Claude Code is separate — it always runs on your Claude
        subscription.
      </p>
    </form>
  );
}
