"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteFolderAction,
  regenPdfAction,
  regenProofAction,
  regenResumeAction,
  saveFileAction,
  type ActionState,
} from "@/app/(app)/applications/actions";

type FileEntry = { name: string; text: string | null };

const EDITABLE = /\.(md|txt|json|html)$/i;

export function FolderEditor({
  date,
  folder,
  files,
  ledgerStatus,
}: {
  date: string;
  folder: string;
  files: FileEntry[];
  ledgerStatus: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const originals = useMemo(
    () =>
      Object.fromEntries(
        files.filter((f) => f.text != null).map((f) => [f.name, f.text as string]),
      ),
    [files],
  );

  const [active, setActive] = useState(
    files.find((f) => EDITABLE.test(f.name))?.name ?? files[0]?.name ?? "",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(originals);

  const activeFile = files.find((f) => f.name === active) ?? null;
  const isEditable = activeFile ? EDITABLE.test(activeFile.name) : false;
  const original = originals[active] ?? "";
  const draft = drafts[active] ?? original;
  const dirty = isEditable && draft !== original;

  const run = (
    fn: () => Promise<ActionState>,
    after?: () => void,
  ) =>
    start(async () => {
      const res = await fn();
      if (res?.ok) {
        toast.success(res.message);
        after?.();
        router.refresh();
      } else {
        toast.error(res?.message ?? "Failed.");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {ledgerStatus && <Badge variant="outline">ledger: {ledgerStatus}</Badge>}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => regenResumeAction(null, { date, folder }))}
        >
          Regenerate résumé
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => regenProofAction(null, { date, folder }))}
        >
          Regenerate proof bundle
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => regenPdfAction(null, { date, folder }))}
        >
          Re-print PDF
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="ml-auto"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                `Delete "${folder}" and all its files from R2? This cannot be undone.`,
              )
            )
              return;
            run(
              () => deleteFolderAction(null, { date, folder }),
              () => router.push("/applications"),
            );
          }}
        >
          Delete folder
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((f) => {
            const changed =
              drafts[f.name] != null && drafts[f.name] !== (f.text ?? "");
            return (
              <li key={f.name}>
                <button
                  type="button"
                  onClick={() => setActive(f.name)}
                  className={cn(
                    "flex w-full items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left",
                    f.name === active
                      ? "bg-accent font-medium"
                      : "hover:bg-accent/60",
                  )}
                >
                  <span className="truncate">{f.name}</span>
                  {changed && <span className="text-amber-600">●</span>}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="min-w-0">
          {!activeFile ? (
            <p className="text-sm text-muted-foreground">No files.</p>
          ) : isEditable ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [active]: e.target.value }))
                }
                disabled={pending}
                spellCheck={false}
                className="min-h-[60vh] font-mono text-xs"
              />
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={!dirty || pending}
                  onClick={() =>
                    run(() =>
                      saveFileAction(null, {
                        date,
                        folder,
                        file: active,
                        content: draft,
                      }),
                    )
                  }
                >
                  Save {active}
                </Button>
                {dirty && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() =>
                      setDrafts((d) => ({ ...d, [active]: original }))
                    }
                  >
                    revert
                  </button>
                )}
                <a
                  href={`/applications/${date}/${folder}/${active}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs text-muted-foreground underline"
                >
                  open raw
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <a
                href={`/applications/${date}/${folder}/${activeFile.name}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                Open {activeFile.name}
              </a>
              {/\.pdf$/i.test(activeFile.name) && (
                <iframe
                  title={activeFile.name}
                  src={`/applications/${date}/${folder}/${activeFile.name}`}
                  className="h-[70vh] w-full rounded-md border"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
