"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import {
  addRepoAction,
  loadSourceJobsAction,
  pauseSourceAction,
  removeSourceAction,
  resumeSourceAction,
  resyncSourceAction,
  syncSourceAction,
  uploadAction,
  type ActionState,
} from "@/app/(app)/knowledge/actions";
import type { JobListItem } from "@/modules/ingestion/queue";

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
  confirmMessage,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  hidden?: Record<string, string>;
  confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );
  useToast(state);
  return (
    <form
      action={formAction}
      className="contents"
      onSubmit={(e) => {
        if (confirmMessage && !confirm(confirmMessage)) e.preventDefault();
      }}
    >
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

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  running: "default",
  failed: "destructive",
  done: "outline",
};

function SourceHistory({ sourceId }: { sourceId: string }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [loading, startLoad] = useTransition();

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (jobs === null) {
      startLoad(async () => setJobs(await loadSourceJobsAction(sourceId)));
    }
  }

  return (
    <div className="w-full">
      <Button type="button" size="sm" variant="ghost" onClick={toggle}>
        {open ? "Hide history" : "History"}
      </Button>
      {open && (
        <ul className="mt-1 flex flex-col divide-y rounded-md border text-xs">
          {loading && (
            <li className="px-3 py-2 text-muted-foreground">Loading…</li>
          )}
          {!loading && jobs?.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">
              No queue items from this source yet.
            </li>
          )}
          {!loading &&
            jobs?.map((j) => (
              <li key={j.id} className="flex items-center gap-2 px-3 py-2">
                <Badge variant={STATUS_VARIANT[j.status] ?? "outline"}>
                  {j.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{j.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {fmtDateTime(j.createdAt)}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
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
            .map((s) => {
              const paused = s.status === "paused";
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="font-mono">{s.externalRef}</span>
                  {paused && <Badge variant="outline">paused</Badge>}
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
                    {paused ? (
                      <InlineForm action={resumeSourceAction} hidden={{ id: s.id }}>
                        <Button type="submit" size="sm" variant="secondary">
                          Resume
                        </Button>
                      </InlineForm>
                    ) : (
                      <>
                        <InlineForm action={syncSourceAction} hidden={{ id: s.id }}>
                          <Button type="submit" size="sm" variant="secondary">
                            Sync
                          </Button>
                        </InlineForm>
                        <InlineForm action={pauseSourceAction} hidden={{ id: s.id }}>
                          <Button type="submit" size="sm" variant="ghost">
                            Pause
                          </Button>
                        </InlineForm>
                      </>
                    )}
                    <InlineForm
                      action={resyncSourceAction}
                      hidden={{ id: s.id }}
                      confirmMessage={`Resync ${s.externalRef} from scratch? This re-walks its full commit history.`}
                    >
                      <Button type="submit" size="sm" variant="ghost">
                        Resync from scratch
                      </Button>
                    </InlineForm>
                    <InlineForm action={removeSourceAction} hidden={{ id: s.id }}>
                      <Button type="submit" size="sm" variant="ghost">
                        Remove
                      </Button>
                    </InlineForm>
                  </span>
                  <SourceHistory sourceId={s.id} />
                </li>
              );
            })}
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
