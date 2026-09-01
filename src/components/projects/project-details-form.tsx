"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useActionToast } from "@/components/use-action-toast";
import {
  updateProjectAction,
  type ActionState,
} from "@/app/(app)/projects/actions";
import type { Project } from "@/lib/db/schema";

export function ProjectDetailsForm({ project }: { project: Project }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProjectAction,
    null,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="slug" value={project.slug} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="status">Status</Label>
        <NativeSelect
          id="status"
          name="status"
          defaultValue={project.status}
          className="w-44"
        >
          <option value="idea">Idea</option>
          <option value="planning">Planning</option>
          <option value="building">Building</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </NativeSelect>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={project.description ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="problemSolved">Problem it solves</Label>
        <Textarea
          id="problemSolved"
          name="problemSolved"
          rows={2}
          defaultValue={project.problemSolved ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="architecture">Architecture</Label>
        <Textarea
          id="architecture"
          name="architecture"
          rows={3}
          defaultValue={project.architecture ?? ""}
        />
      </div>

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
