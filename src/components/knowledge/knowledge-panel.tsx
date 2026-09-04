"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import {
  addRepoAction,
  removeSourceAction,
  syncSourceAction,
  uploadAction,
  type ActionState,
} from "@/app/(app)/knowledge/actions";

export interface SourceRow {
  id: string;
  kind: string;
  externalRef: string | null;
  status: string;
  error: string | null;
  lastSyncedAt: string | null;
}

function useToast(state: ActionState) {
  const seen = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function InlineForm({
  action,
  children,
  hidden,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );
  useToast(state);
  return (
    <form action={formAction} className="contents">
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

export function KnowledgePanel({
  sources,
  githubTokenSet,
}: {
  sources: SourceRow[];
  githubTokenSet: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* GitHub repos */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">GitHub repositories</h3>
        <InlineForm action={addRepoAction}>
          <div className="flex gap-2">
            <Input
              name="repo"
              placeholder="owner/repo"
              className="max-w-xs font-mono text-sm"
              required
            />
            <Button type="submit" size="sm">
              Add repo
            </Button>
          </div>
        </InlineForm>
        {!githubTokenSet && (
          <p className="text-xs text-muted-foreground">
            No <code>GITHUB_TOKEN</code> set — public repos only, 60 requests/hour.
          </p>
        )}

        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {sources.filter((s) => s.kind === "github_repo").length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">
              No repositories connected yet.
            </li>
          )}
          {sources
            .filter((s) => s.kind === "github_repo")
            .map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <span className="font-mono">{s.externalRef}</span>
                <span
                  className={
                    s.status === "error"
                      ? "text-xs text-red-600 dark:text-red-400"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {s.status === "error"
                    ? `error: ${s.error?.slice(0, 80)}`
                    : s.lastSyncedAt
                      ? `synced ${fmtDateTime(s.lastSyncedAt)}`
                      : "never synced"}
                </span>
                <span className="ml-auto flex gap-2">
                  <InlineForm action={syncSourceAction} hidden={{ id: s.id }}>
                    <Button type="submit" size="sm" variant="secondary">
                      Sync
                    </Button>
                  </InlineForm>
                  <InlineForm
                    action={removeSourceAction}
                    hidden={{ id: s.id }}
                  >
                    <Button type="submit" size="sm" variant="ghost">
                      Remove
                    </Button>
                  </InlineForm>
                </span>
              </li>
            ))}
        </ul>
      </section>

      {/* Upload */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Upload / paste</h3>
        <InlineForm action={uploadAction}>
          <div className="grid gap-3 sm:max-w-md">
            <div className="grid gap-1">
              <Label htmlFor="k-category">Kind</Label>
              <NativeSelect id="k-category" name="category" defaultValue="doc">
                <option value="doc">Project doc / ADR / note</option>
                <option value="chatgpt_export">
                  ChatGPT export (conversations.json)
                </option>
                <option value="linkedin_shares">LinkedIn Shares.csv</option>
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="k-title">Title (for a pasted doc)</Label>
              <Input id="k-title" name="title" placeholder="e.g. Auth design notes" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="k-file">File</Label>
              <Input id="k-file" name="file" type="file" accept=".json,.csv,.md,.txt" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="k-text">…or paste text</Label>
              <Textarea id="k-text" name="text" rows={5} />
            </div>
            <Button type="submit" size="sm" className="w-fit">
              Queue for extraction
            </Button>
          </div>
        </InlineForm>
      </section>
    </div>
  );
}
