"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import { SkillLinker } from "@/components/projects/skill-linker";
import {
  addFeatureAction,
  setFeatureStatusAction,
  type ActionState,
} from "@/app/(app)/projects/actions";
import type { FeatureWithSkills } from "@/modules/projects/service";

function FeatureRow({
  feature,
  projectId,
  slug,
  skills,
}: {
  feature: FeatureWithSkills;
  projectId: string;
  slug: string;
  skills: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setFeatureStatusAction,
    null,
  );
  useActionToast(state);

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{feature.title}</p>
          {feature.description && (
            <p className="text-sm text-muted-foreground">
              {feature.description}
            </p>
          )}
        </div>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="featureId" value={feature.id} />
          <input type="hidden" name="slug" value={slug} />
          <NativeSelect
            name="status"
            defaultValue={feature.status}
            className="w-36"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="planned">planned</option>
            <option value="in_progress">in progress</option>
            <option value="done">done</option>
          </NativeSelect>
        </form>
      </div>

      <div className="mt-3">
        <SkillLinker
          projectId={projectId}
          slug={slug}
          featureId={feature.id}
          skills={skills}
          linked={feature.skills}
          compact
        />
      </div>
      {feature.status === "done" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Used / demonstrated skills here carry IMPLEMENTED-level evidence.
        </p>
      )}
    </li>
  );
}

export function FeatureManager({
  projectId,
  slug,
  features,
  skills,
}: {
  projectId: string;
  slug: string;
  features: FeatureWithSkills[];
  skills: { id: string; name: string }[];
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addFeatureAction,
    null,
  );
  useActionToast(state, () => ref.current?.reset());

  return (
    <div className="flex flex-col gap-4">
      {features.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {features.map((f) => (
            <FeatureRow
              key={f.id}
              feature={f}
              projectId={projectId}
              slug={slug}
              skills={skills}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No features yet.</p>
      )}

      <form
        ref={ref}
        action={formAction}
        className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="slug" value={slug} />
        <Input name="title" placeholder="New feature title" required />
        <Textarea name="description" rows={2} placeholder="Description (optional)" />
        <div className="flex items-center gap-2">
          <NativeSelect name="status" defaultValue="planned" className="w-36">
            <option value="planned">planned</option>
            <option value="in_progress">in progress</option>
            <option value="done">done</option>
          </NativeSelect>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add feature"}
          </Button>
        </div>
      </form>
    </div>
  );
}
