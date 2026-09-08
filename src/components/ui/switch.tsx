"use client";

import type { ComponentProps } from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

/**
 * Design-system Switch (Base UI, not Radix — see AGENTS notes). Controlled via
 * `checked` + `onCheckedChange`, or uncontrolled with `defaultChecked`.
 */
export function Switch({
  className,
  ...props
}: ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors",
        "bg-input data-[checked]:bg-primary",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
          "translate-x-0.5 data-[checked]:translate-x-[18px]",
        )}
      />
    </BaseSwitch.Root>
  );
}
