"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function RunAgentButton({
  agent,
  label = "Run now",
  size = "sm",
}: {
  agent: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${agent}/run`, { method: "POST" });
      const data = (await res.json()) as {
        status?: string;
        error?: string | null;
      };
      if (!res.ok || data.error || data.status === "failed") {
        toast.error(data.error ?? "Agent run failed.");
      } else if (data.status === "waiting_for_approval") {
        toast.success("Run finished — needs your approval.");
      } else {
        toast.success("Run complete.");
      }
    } catch {
      toast.error("Could not reach the agent.");
    } finally {
      setBusy(false);
      start(() => router.refresh());
    }
  }

  return (
    <Button size={size} onClick={run} disabled={busy || pending}>
      {busy ? "Running…" : pending ? "Refreshing…" : label}
    </Button>
  );
}
