"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MergeDialog, type MergeIntent } from "@/components/skills/merge-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  setSkillParentAction,
  updateSkillLabelAction,
  type ActionState,
} from "@/app/(app)/skills/actions";

export function SkillOrganize({
  skillId,
  name,
  label,
  parentId,
  hasChildren,
  choices,
}: {
  skillId: string;
  name: string;
  label: string | null;
  parentId: string | null;
  hasChildren: boolean;
  /** other top-level skills — parent / merge candidates */
  choices: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [labelVal, setLabelVal] = useState(label ?? "");
  const [merge, setMerge] = useState<MergeIntent | null>(null);
  const [pending, start] = useTransition();

  const run = (p: Promise<ActionState>) =>
    start(async () => {
      const res = await p;
      if (res && !res.ok) toast.error(res.message);
      else toast.success(res?.message ?? "Saved.");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-label">Display label</Label>
        <div className="flex gap-2">
          <Input
            id="skill-label"
            value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)}
            placeholder={name}
          />
          <Button
            variant="outline"
            disabled={pending || labelVal.trim() === (label ?? "")}
            onClick={() =>
              run(updateSkillLabelAction({ skillId, label: labelVal.trim() || null }))
            }
          >
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Internal name <code>{name}</code> is fixed — links and matching use it.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-parent">Group under</Label>
        {hasChildren ? (
          <p className="text-sm text-muted-foreground">
            This skill has children, so it can&apos;t be nested (grouping is one
            level deep).
          </p>
        ) : (
          <NativeSelect
            id="skill-parent"
            value={parentId ?? ""}
            disabled={pending}
            onChange={(e) =>
              run(
                setSkillParentAction({
                  skillId,
                  parentId: e.target.value || null,
                }),
              )
            }
          >
            <option value="">(top level)</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-merge">Merge this skill into…</Label>
        <NativeSelect
          id="skill-merge"
          value=""
          disabled={pending}
          onChange={(e) => {
            const t = choices.find((c) => c.id === e.target.value);
            if (t) setMerge({ targetId: t.id, targetLabel: t.label, sourceIds: [skillId] });
          }}
        >
          <option value="">Pick a target…</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          This skill&apos;s evidence and links move to the target, then it&apos;s
          deleted.
        </p>
      </div>

      <MergeDialog
        key={merge ? merge.targetId : "none"}
        intent={merge}
        onClose={() => setMerge(null)}
        onDone={() => {
          setMerge(null);
          router.push("/skills");
        }}
      />
    </div>
  );
}
