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
import { CATEGORY_LABEL, SKILL_CATEGORIES } from "@/modules/skills/levels";
import { createSkillAction, type ActionState } from "@/app/(app)/skills/actions";

export function AddSkillDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSkillAction,
    null,
  );

  useActionToast(
    state,
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Add skill</Button>} />
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Add a skill</DialogTitle>
            <DialogDescription>
              New skills start at Interested. Level moves as you record evidence.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="e.g. RabbitMQ" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Category</Label>
              <NativeSelect
                id="category"
                name="category"
                defaultValue="framework"
              >
                {SKILL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add skill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
