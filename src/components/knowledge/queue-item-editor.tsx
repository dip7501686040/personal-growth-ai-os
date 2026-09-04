"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteQueueItemAction,
  updateQueueItemAction,
  type ActionState,
} from "@/app/(app)/knowledge/actions";

export function QueueItemEditor({
  id,
  title: initialTitle,
  text: initialText,
  canEdit,
}: {
  id: string;
  title: string;
  text: string;
  /** false for a job that's currently running / already extracted */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState(initialText);

  const [saveState, save, saving] = useActionState<
    ActionState,
    { id: string; title: string; text: string }
  >(updateQueueItemAction, null);
  const [delState, del, deleting] = useActionState<ActionState, string>(
    deleteQueueItemAction,
    null,
  );

  const seenSave = useRef<ActionState>(null);
  useEffect(() => {
    if (!saveState || saveState === seenSave.current) return;
    seenSave.current = saveState;
    if (saveState.ok) toast.success(saveState.message);
    else toast.error(saveState.message);
  }, [saveState]);

  const seenDel = useRef<ActionState>(null);
  useEffect(() => {
    if (!delState || delState === seenDel.current) return;
    seenDel.current = delState;
    if (delState.ok) {
      toast.success(delState.message);
      router.push("/knowledge");
    } else {
      toast.error(delState.message);
    }
  }, [delState, router]);

  const dirty = title !== initialTitle || text !== initialText;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1">
        <Label htmlFor="q-title">Title</Label>
        <Input
          id="q-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canEdit || saving}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="q-text">Source text</Label>
        <Textarea
          id="q-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          className="font-mono text-xs"
          disabled={!canEdit || saving}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button
            type="button"
            size="sm"
            disabled={saving || !dirty}
            onClick={() => save({ id, title, text })}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={deleting}
          onClick={() => {
            if (confirm("Delete this queue item?")) del(id);
          }}
        >
          {deleting ? "Deleting…" : "Delete queue item"}
        </Button>
      </div>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          This item is running or already extracted — read-only. You can still
          delete it.
        </p>
      )}
    </div>
  );
}
