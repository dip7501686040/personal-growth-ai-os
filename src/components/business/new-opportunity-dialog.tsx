"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import {
  createOpportunityAction,
  type ActionState,
} from "@/app/(app)/business/actions";

export function NewOpportunityDialog() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createOpportunityAction,
    null,
  );
  useActionToast(state);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            New opportunity
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>New business opportunity</DialogTitle>
            <DialogDescription>Or generate ideas from your skills above.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="problem">Problem</Label>
              <Textarea id="problem" name="problem" rows={2} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="targetCustomer">Target customer</Label>
              <Input id="targetCustomer" name="targetCustomer" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="proposedSolution">Proposed solution</Label>
              <Textarea id="proposedSolution" name="proposedSolution" rows={2} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="complexity">Complexity</Label>
                <NativeSelect id="complexity" name="complexity" defaultValue="medium">
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="techStack">Tech stack (comma-sep)</Label>
                <Input id="techStack" name="techStack" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="monetizationModel">Monetization</Label>
              <Input id="monetizationModel" name="monetizationModel" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
