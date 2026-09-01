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
import { createIdeaAction, type ActionState } from "@/app/(app)/content/actions";

export function NewIdeaDialog() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createIdeaAction,
    null,
  );
  useActionToast(state);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            New idea
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>New content idea</DialogTitle>
            <DialogDescription>
              Or run &quot;Scan for content&quot; to detect ideas from your real
              work.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hook">Hook (one line)</Label>
              <Input id="hook" name="hook" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="angle">Angle</Label>
              <Textarea id="angle" name="angle" rows={2} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="note">Grounding note (what it&apos;s based on)</Label>
              <Textarea id="note" name="note" rows={2} />
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
