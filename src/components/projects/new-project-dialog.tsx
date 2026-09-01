"use client";

import { useActionState, useCallback, useState } from "react";
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
import { createProjectAction, type ActionState } from "@/app/(app)/projects/actions";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createProjectAction,
    null,
  );
  useActionToast(
    state,
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">New project</Button>} />
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Add features and link the skills they demonstrate as you build.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">Status</Label>
              <NativeSelect id="status" name="status" defaultValue="idea">
                <option value="idea">Idea</option>
                <option value="planning">Planning</option>
                <option value="building">Building</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="problemSolved">Problem it solves</Label>
              <Textarea id="problemSolved" name="problemSolved" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
