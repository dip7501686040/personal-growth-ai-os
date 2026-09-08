"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; message: string } | null;

/**
 * "In use" / "Skipped" switch for a skill, project, or project feature.
 * `action` takes `{ ...idKey, excluded }` and returns an ActionState. Optimistic
 * with rollback on failure.
 */
export function ExcludeToggle<T extends Record<string, unknown>>({
  excluded,
  action,
  actionArgs,
  labels = { on: "In use", off: "Skipped" },
  className,
}: {
  excluded: boolean;
  action: (input: T & { excluded: boolean }) => Promise<Result>;
  actionArgs: T;
  labels?: { on: string; off: string };
  className?: string;
}) {
  const [isExcluded, setIsExcluded] = useState(excluded);
  const [pending, startTransition] = useTransition();

  const onChange = (checkedInUse: boolean) => {
    const nextExcluded = !checkedInUse;
    setIsExcluded(nextExcluded); // optimistic
    startTransition(async () => {
      const res = await action({ ...actionArgs, excluded: nextExcluded });
      if (res && !res.ok) {
        setIsExcluded(!nextExcluded); // rollback
        toast.error(res.message);
      } else if (res?.ok) {
        toast.success(res.message);
      }
    });
  };

  return (
    <label
      className={cn(
        "flex shrink-0 items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
      title={isExcluded ? "Skipped — hidden from AI, job search, proof, portfolio" : "In use everywhere"}
    >
      <Switch
        checked={!isExcluded}
        onCheckedChange={onChange}
        disabled={pending}
        aria-label={isExcluded ? labels.off : labels.on}
      />
      <span className={cn("tabular-nums", isExcluded && "text-amber-600 dark:text-amber-500")}>
        {isExcluded ? labels.off : labels.on}
      </span>
    </label>
  );
}
