"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  createPortfolioCardAction,
  deletePortfolioCardAction,
  updatePortfolioCardAction,
  type ActionState,
} from "@/app/(app)/content/actions";

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

interface Feature {
  id: string;
  title: string;
  projectName: string;
  projectSlug: string;
}

interface Card {
  id: string;
  title: string;
  body: string | null;
  isPublic: boolean;
  assetType: string | null;
  featureId: string | null;
  featureTitle: string | null;
  projectName: string | null;
  previewUrl: string | null;
}

const assetKey = (a: Asset) => `${a.projectSlug}::${a.featureKey}::${a.cloudinaryId}`;

export function PortfolioCardsSection({
  cards,
  features,
  assets,
  cloudinaryConfigured,
}: {
  cards: Card[];
  features: Feature[];
  assets: Asset[];
  cloudinaryConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [newFeatureId, setNewFeatureId] = useState("");
  const [newAssetKey, setNewAssetKey] = useState("");

  const assetByKey = useMemo(() => new Map(assets.map((a) => [assetKey(a), a])), [assets]);
  const selectedAsset = newAssetKey ? assetByKey.get(newAssetKey) : undefined;

  const groupedCards = useMemo(() => {
    const groups = new Map<string, Card[]>();
    for (const c of cards) {
      const key = c.projectName ?? "(no project)";
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cards]);

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
        {assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No Cloudinary assets yet — upload one from <b>/media</b> or{" "}
            <code>pnpm media upload</code> first, then come back to make a card
            from it.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <NativeSelect
                value={newAssetKey}
                onChange={(e) => {
                  setNewAssetKey(e.target.value);
                  const a = assetByKey.get(e.target.value);
                  if (a && !newTitle) setNewTitle(a.caption || `${a.projectSlug} — ${a.featureKey}`);
                }}
                disabled={pending}
              >
                <option value="">Pick an uploaded asset…</option>
                {assets.map((a) => (
                  <option key={assetKey(a)} value={assetKey(a)}>
                    {a.projectSlug} / {a.featureKey} — {a.kind}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={newFeatureId}
                onChange={(e) => setNewFeatureId(e.target.value)}
                disabled={pending}
              >
                <option value="">No linked feature (optional)</option>
                {features.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.projectName} — {f.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Card title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={pending}
              />
              <Input
                placeholder="Caption (optional)"
                value={newCaption}
                onChange={(e) => setNewCaption(e.target.value)}
                disabled={pending}
              />
            </div>
            <Button
              size="sm"
              className="self-start"
              disabled={pending || !selectedAsset || !newTitle.trim()}
              onClick={() => {
                if (!selectedAsset) return;
                run(
                  () =>
                    createPortfolioCardAction(null, {
                      title: newTitle.trim(),
                      caption: newCaption.trim() || undefined,
                      kind: selectedAsset.kind,
                      cloudinaryPublicId: selectedAsset.cloudinaryId,
                      cloudinaryResourceType: selectedAsset.resourceType,
                      cloudinaryFormat: selectedAsset.format,
                      featureId: newFeatureId || undefined,
                    }),
                  () => {
                    setNewTitle("");
                    setNewCaption("");
                    setNewFeatureId("");
                    setNewAssetKey("");
                  },
                );
              }}
            >
              Add card
            </Button>
          </>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No portfolio cards yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {groupedCards.map(([project, group]) => (
              <a
                key={project}
                href={`#pc-${project.replace(/[^a-z0-9]+/gi, "-")}`}
                className="rounded-full border bg-card px-2.5 py-1 text-xs hover:bg-accent/50"
              >
                {project} <span className="text-muted-foreground">· {group.length}</span>
              </a>
            ))}
          </div>
          {groupedCards.map(([project, group]) => (
            <PortfolioCardGroup
              key={project}
              project={project}
              cards={group}
              editing={editing}
              setEditing={setEditing}
              features={features}
              pending={pending}
              run={run}
              cloudinaryConfigured={cloudinaryConfigured}
            />
          ))}
        </>
      )}
    </div>
  );
}

function PortfolioCardGroup({
  project,
  cards,
  editing,
  setEditing,
  features,
  pending,
  run,
  cloudinaryConfigured,
}: {
  project: string;
  cards: Card[];
  editing: string | null;
  setEditing: (id: string | null) => void;
  features: Feature[];
  pending: boolean;
  run: (fn: () => Promise<ActionState>, after?: () => void) => void;
  cloudinaryConfigured: boolean;
}) {
  return (
    <div
      id={`pc-${project.replace(/[^a-z0-9]+/gi, "-")}`}
      className="flex flex-col gap-2 scroll-mt-4"
    >
      <h3 className="text-sm font-semibold text-muted-foreground">
        {project} · {cards.length}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
            const isEditing = editing === c.id;
            return (
              <div key={c.id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
                <div className="relative aspect-video bg-muted">
                  {c.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.previewUrl} alt={c.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {cloudinaryConfigured ? "no preview" : "Cloudinary not configured"}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {c.projectName && <Badge variant="outline">{c.projectName}</Badge>}
                    {c.assetType && <Badge>{c.assetType}</Badge>}
                    <Badge variant={c.isPublic ? "default" : "outline"}>
                      {c.isPublic ? "public" : "hidden"}
                    </Badge>
                  </div>

                  {isEditing ? (
                    <EditCardForm
                      card={c}
                      features={features}
                      pending={pending}
                      onCancel={() => setEditing(null)}
                      onSave={(patch) =>
                        run(
                          () => updatePortfolioCardAction(null, { id: c.id, ...patch }),
                          () => setEditing(null),
                        )
                      }
                    />
                  ) : (
                    <>
                      <p className="text-sm font-medium">{c.title}</p>
                      {c.featureTitle && (
                        <p className="text-xs text-muted-foreground">{c.featureTitle}</p>
                      )}
                      <div className="mt-auto flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          className="text-xs underline"
                          disabled={pending}
                          onClick={() => setEditing(c.id)}
                        >
                          edit
                        </button>
                        <button
                          type="button"
                          className="text-xs text-destructive underline"
                          disabled={pending}
                          onClick={() => {
                            if (!window.confirm(`Delete the card "${c.title}"?`)) return;
                            run(() => deletePortfolioCardAction(null, c.id));
                          }}
                        >
                          delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );
}

function EditCardForm({
  card,
  features,
  pending,
  onCancel,
  onSave,
}: {
  card: Card;
  features: Feature[];
  pending: boolean;
  onCancel: () => void;
  onSave: (patch: {
    title: string;
    caption: string;
    isPublic: boolean;
    featureId: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [caption, setCaption] = useState(card.body ?? "");
  const [isPublic, setIsPublic] = useState(card.isPublic);
  const [featureId, setFeatureId] = useState(card.featureId ?? "");

  return (
    <div className="flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
      <Input value={caption} onChange={(e) => setCaption(e.target.value)} disabled={pending} placeholder="Caption" />
      <NativeSelect value={featureId} onChange={(e) => setFeatureId(e.target.value)} disabled={pending}>
        <option value="">No linked feature</option>
        {features.map((f) => (
          <option key={f.id} value={f.id}>
            {f.projectName} — {f.title}
          </option>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          disabled={pending}
        />
        Public on the portfolio
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !title.trim()}
          onClick={() =>
            onSave({
              title: title.trim(),
              caption: caption.trim(),
              isPublic,
              featureId: featureId || null,
            })
          }
        >
          Save
        </Button>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={onCancel}>
          cancel
        </button>
      </div>
    </div>
  );
}
