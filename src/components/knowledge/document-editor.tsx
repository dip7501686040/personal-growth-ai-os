"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDocumentAction,
  updateDocumentAction,
  type ActionState,
} from "@/app/(app)/knowledge/actions";

export function DocumentEditor({
  id,
  title: initialTitle,
  body: initialBody,
}: {
  id: string;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  const [saveState, save, saving] = useActionState<
    ActionState,
    { id: string; title: string; body: string }
  >(updateDocumentAction, null);
  const [delState, del, deleting] = useActionState<ActionState, string>(
    deleteDocumentAction,
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

  const dirty = title !== initialTitle || body !== initialBody;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1">
        <Label htmlFor="d-title">Title</Label>
        <Input
          id="d-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="d-body">Body</Label>
        <Textarea
          id="d-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          disabled={saving}
        />
        <p className="text-[11px] text-muted-foreground">
          Editing the body re-chunks and re-embeds this document.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving || !dirty}
          onClick={() => save({ id, title, body })}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={deleting}
          onClick={() => {
            if (confirm("Delete this knowledge document?")) del(id);
          }}
        >
          {deleting ? "Deleting…" : "Delete document"}
        </Button>
      </div>
    </div>
  );
}
