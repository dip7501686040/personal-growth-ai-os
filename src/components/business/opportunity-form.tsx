"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import {
  updateOpportunityAction,
  type ActionState,
} from "@/app/(app)/business/actions";

export function OpportunityForm({
  id,
  status,
  notes,
  proposedSolution,
  monetizationModel,
}: {
  id: string;
  status: string;
  notes: string;
  proposedSolution: string;
  monetizationModel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateOpportunityAction,
    null,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <NativeSelect id="status" name="status" defaultValue={status} className="w-44">
          <option value="idea">idea</option>
          <option value="exploring">exploring</option>
          <option value="validated">validated</option>
          <option value="dropped">dropped</option>
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="proposedSolution">Proposed solution</Label>
        <Textarea
          id="proposedSolution"
          name="proposedSolution"
          rows={3}
          defaultValue={proposedSolution}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="monetizationModel">Monetization</Label>
        <Input
          id="monetizationModel"
          name="monetizationModel"
          defaultValue={monetizationModel}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={notes} />
      </div>

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
