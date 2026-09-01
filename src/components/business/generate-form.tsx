"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function GenerateForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/agents/business/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          market: fd.get("market") || "",
          businessType: fd.get("businessType") || "",
          knownProblems: fd.get("knownProblems") || "",
        }),
      });
      const data = (await res.json()) as { status?: string; error?: string | null };
      if (!res.ok || data.error || data.status === "failed") {
        toast.error(data.error ?? "Generation failed.");
      } else {
        toast.success("Opportunities generated.");
      }
    } catch {
      toast.error("Could not reach the agent.");
    } finally {
      setBusy(false);
      start(() => router.refresh());
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="market">Market / location (optional)</Label>
          <Input id="market" name="market" placeholder="e.g. Kolkata, small businesses" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="businessType">Business type focus (optional)</Label>
          <Input id="businessType" name="businessType" placeholder="e.g. clinics, salons" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="knownProblems">Known problems (optional)</Label>
        <Textarea
          id="knownProblems"
          name="knownProblems"
          rows={2}
          placeholder="Anything specific you've noticed businesses struggle with"
        />
      </div>
      <Button type="submit" size="sm" disabled={busy || pending} className="self-start">
        {busy ? "Generating…" : pending ? "Refreshing…" : "Generate opportunities"}
      </Button>
    </form>
  );
}
