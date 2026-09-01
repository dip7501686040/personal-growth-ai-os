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
import { useActionToast } from "@/components/use-action-toast";
import {
  createOpportunityAction,
  type ActionState,
} from "@/app/(app)/career/actions";

export function NewOpportunityDialog() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createOpportunityAction,
    null,
  );
  useActionToast(state);

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm">Add job</Button>} />
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Add a job</DialogTitle>
            <DialogDescription>
              Paste the description — the Career Agent matches it against your
              real proof of skills.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" name="role" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="jobUrl">Job URL (optional)</Label>
                <Input id="jobUrl" name="jobUrl" type="url" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="location">Location (optional)</Label>
                <Input id="location" name="location" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Job description</Label>
              <Textarea id="description" name="description" rows={8} required />
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
