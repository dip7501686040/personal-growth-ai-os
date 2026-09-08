"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mergePreviewAction, mergeSkillsAction } from "@/app/(app)/skills/actions";

export type MergeIntent = {
  targetId: string;
  targetLabel: string;
  sourceIds: string[];
};

type Preview = {
  evidence: number;
  projectLinks: number;
  learningLinks: number;
  knowledgeLinks: number;
  entitySkillLinks: number;
  children: number;
  pendingApprovals: number;
  sources: { id: string; name: string }[];
};

/** Confirm dialog for `mergeSkills`. Fetches the impact preview on open. */
export function MergeDialog({
  intent,
  onClose,
  onDone,
}: {
  intent: MergeIntent | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The parent remounts this via `key` per intent, so state starts clean and
  // the effect only needs to fetch.
  useEffect(() => {
    if (!intent) return;
    let live = true;
    mergePreviewAction({ targetId: intent.targetId, sourceIds: intent.sourceIds }).then((r) => {
      if (!live) return;
      if (r.ok) setPreview(r.preview);
      else setErr(r.message);
    });
    return () => {
      live = false;
    };
  }, [intent]);

  const confirm = () => {
    if (!intent) return;
    start(async () => {
      const res = await mergeSkillsAction({
        targetId: intent.targetId,
        sourceIds: intent.sourceIds,
      });
      if (res && !res.ok) toast.error(res.message);
      else {
        toast.success(res?.message ?? "Merged.");
        onDone();
      }
    });
  };

  return (
    <Dialog open={!!intent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge into “{intent?.targetLabel}”</DialogTitle>
          <DialogDescription>
            {preview
              ? `${preview.sources.map((s) => s.name).join(", ")} will be absorbed and deleted — every link below moves to “${intent?.targetLabel}”. This can't be undone.`
              : err ?? "Checking what will move…"}
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 py-2 text-sm">
            <Count n={preview.evidence} label="evidence rows" />
            <Count n={preview.projectLinks} label="project-skill links" />
            <Count n={preview.learningLinks} label="learning links" />
            <Count n={preview.knowledgeLinks} label="knowledge links" />
            <Count n={preview.entitySkillLinks} label="entity-skill links" />
            <Count n={preview.children} label="child skills re-parented" />
            {preview.pendingApprovals > 0 && (
              <Count n={preview.pendingApprovals} label="pending approvals cancelled" />
            )}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={pending || !preview}>
            {pending ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{n}</span>
    </li>
  );
}
