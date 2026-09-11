"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteFileAction,
  renameFileAction,
  uploadFileAction,
  type ActionState,
} from "@/app/(app)/media/actions";

export function FilesList({ fileKeys }: { fileKeys: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [addKey, setAddKey] = useState("");
  const addFileInput = useRef<HTMLInputElement | null>(null);
  const reuploadInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const run = (fn: () => Promise<ActionState>, after?: () => void) =>
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
        <Input
          placeholder="path e.g. resume/notes.txt"
          value={addKey}
          onChange={(e) => setAddKey(e.target.value)}
          disabled={pending}
          className="max-w-xs text-xs"
        />
        <input
          ref={addFileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !addKey.trim()) return;
            const fd = new FormData();
            fd.set("key", addKey.trim());
            fd.set("file", file);
            run(() => uploadFileAction(fd), () => setAddKey(""));
            e.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !addKey.trim()}
          onClick={() => addFileInput.current?.click()}
        >
          Add file
        </Button>
      </div>

      {fileKeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">(empty)</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {fileKeys.map((key) => (
            <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              {renaming === key ? (
                <>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={pending}
                    className="max-w-xs text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={pending || !newName.trim()}
                    onClick={() =>
                      run(
                        () => renameFileAction(null, { oldKey: key, newKey: newName.trim() }),
                        () => setRenaming(null),
                      )
                    }
                  >
                    Save
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setRenaming(null)}
                  >
                    cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="truncate font-mono text-xs">{key}</span>
                  <div className="ml-auto flex items-center gap-3">
                    <a
                      href={`/api/media-files/${encodeURIComponent(key)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline"
                    >
                      open
                    </a>
                    <input
                      ref={(el) => {
                        reuploadInputs.current[key] = el;
                      }}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.set("key", key);
                        fd.set("file", file);
                        run(() => uploadFileAction(fd));
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="text-xs underline"
                      disabled={pending}
                      onClick={() => reuploadInputs.current[key]?.click()}
                    >
                      re-upload
                    </button>
                    <button
                      type="button"
                      className="text-xs underline"
                      disabled={pending}
                      onClick={() => {
                        setRenaming(key);
                        setNewName(key);
                      }}
                    >
                      rename
                    </button>
                    <button
                      type="button"
                      className="text-xs text-destructive underline"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Delete ${key}? This cannot be undone.`)) return;
                        run(() => deleteFileAction(null, key));
                      }}
                    >
                      delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
