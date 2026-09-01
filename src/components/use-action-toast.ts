"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

type ActionState = { ok: boolean; message: string } | null;

/** Fires a toast whenever a server-action result changes. */
export function useActionToast(
  state: ActionState,
  onSuccess?: () => void,
): void {
  const seen = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) {
      toast.success(state.message);
      onSuccess?.();
    } else {
      toast.error(state.message);
    }
  }, [state, onSuccess]);
}
