"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteAssetAction,
  reuploadAssetAction,
  updateCaptionAction,
  type ActionState,
} from "@/app/(app)/media/actions";

interface Asset {
  projectSlug: string;
  featureKey: string;
  kind: "video" | "screenshot" | "diagram";
  resourceType: "image" | "video";
  cloudinaryId: string;
  format: string;
  caption: string;
  previewUrl: string | null;
}

export function CloudinaryAssets({ assets }: { assets: Asset[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

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

  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">No visual proof uploaded yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((a) => {
        const id = a.cloudinaryId;
        const isEditing = editing === id;
        const caption = captions[id] ?? a.caption;
        return (
          <div key={id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
            <div className="relative aspect-video bg-muted">
              {a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.previewUrl} alt={a.caption} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  no preview
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="outline">{a.projectSlug}</Badge>
                <Badge variant="outline">{a.featureKey}</Badge>
                <Badge>{a.kind}</Badge>
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={caption}
                    onChange={(e) =>
                      setCaptions((c) => ({ ...c, [id]: e.target.value }))
                    }
                    disabled={pending}
                    className="text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            updateCaptionAction(null, {
                              projectSlug: a.projectSlug,
                              featureKey: a.featureKey,
                              cloudinaryId: id,
                              caption,
                            }),
                          () => setEditing(null),
                        )
                      }
                    >
                      Save
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => setEditing(null)}
                    >
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-left text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setEditing(id)}
                  disabled={pending}
                >
                  {a.caption || "(no caption — click to add)"}
                </button>
              )}

              <div className={cn("mt-auto flex items-center gap-3 pt-1", pending && "opacity-60")}>
                <input
                  ref={(el) => {
                    fileInputs.current[id] = el;
                  }}
                  type="file"
                  accept={a.resourceType === "video" ? "video/*" : "image/*"}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.set("file", file);
                    fd.set("projectSlug", a.projectSlug);
                    fd.set("featureKey", a.featureKey);
                    fd.set("cloudinaryId", id);
                    fd.set("resourceType", a.resourceType);
                    run(() => reuploadAssetAction(fd));
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="text-xs font-medium text-accent-foreground underline"
                  disabled={pending}
                  onClick={() => fileInputs.current[id]?.click()}
                >
                  Re-upload
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-destructive underline"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete this ${a.kind} for ${a.projectSlug}/${a.featureKey}? Any content card or proof-bundle line referencing it will break until regenerated.`,
                      )
                    )
                      return;
                    run(() =>
                      deleteAssetAction(null, {
                        projectSlug: a.projectSlug,
                        featureKey: a.featureKey,
                        cloudinaryId: id,
                        resourceType: a.resourceType,
                      }),
                    );
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
