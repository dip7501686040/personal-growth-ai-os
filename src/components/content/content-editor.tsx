"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import {
  updateContentAction,
  type ActionState,
} from "@/app/(app)/content/actions";

export function ContentEditor({
  id,
  title,
  body,
  status,
}: {
  id: string;
  title: string;
  body: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateContentAction,
    null,
  );
  const [draft, setDraft] = useState(body);
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={title} required />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="body">Post body</Label>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              navigator.clipboard?.writeText(draft).then(
                () => toast.success("Copied"),
                () => toast.error("Copy failed"),
              );
            }}
          >
            Copy
          </button>
        </div>
        <Textarea
          id="body"
          name="body"
          rows={12}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Generate a draft, or write it here."
        />
        <p className="text-xs text-muted-foreground">
          {draft.trim().split(/\s+/).filter(Boolean).length} words
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">Status</Label>
          <NativeSelect
            id="status"
            name="status"
            defaultValue={status}
            className="w-44"
          >
            <option value="idea">idea</option>
            <option value="draft">draft</option>
            <option value="ready_for_review">ready for review</option>
            <option value="approved">approved</option>
            <option value="published">published</option>
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
