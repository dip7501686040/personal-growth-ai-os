import Link from "next/link";
import { requireUserId } from "@/lib/user";
import {
  listContentItems,
  listFeaturesForPicker,
  listPortfolioCards,
} from "@/modules/content/service";
import { getAgentConsole, getLatestRun } from "@/modules/agents/runs";
import { isCloudinaryConfigured, mediaUrl, videoPosterUrl } from "@/lib/media/cloudinary";
import { allItems, loadManifestFromR2 } from "@/lib/media/manifest";
import { AgentRunConsole } from "@/components/agent-run-console";
import { NewIdeaDialog } from "@/components/content/new-idea-dialog";
import { PortfolioCardsSection } from "@/components/content/portfolio-cards-section";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Content" };

const COLUMNS: { status: string; label: string }[] = [
  { status: "idea", label: "Ideas" },
  { status: "draft", label: "Drafts" },
  { status: "ready_for_review", label: "Ready for review" },
  { status: "approved", label: "Approved" },
  { status: "published", label: "Published" },
];

export default async function ContentPage() {
  const userId = await requireUserId();
  const [allContent, run, contentConsole, cards, features, manifest] = await Promise.all([
    listContentItems(userId),
    getLatestRun(userId, "content"),
    getAgentConsole(userId, "content"),
    listPortfolioCards(userId),
    listFeaturesForPicker(userId),
    loadManifestFromR2(),
  ]);
  const items = allContent.filter((i) => i.platform !== "portfolio");

  const lastNote =
    run?.result && typeof run.result === "object" && "note" in run.result
      ? String((run.result as { note?: unknown }).note ?? "")
      : "";

  const cloudinaryOk = isCloudinaryConfigured();
  const pickerAssets = allItems(manifest).map(({ projectSlug, featureKey, item }) => ({
    projectSlug,
    featureKey,
    ...item,
    previewUrl: cloudinaryOk
      ? item.resourceType === "video"
        ? videoPosterUrl(item.cloudinaryId)
        : mediaUrl(item.cloudinaryId, { resourceType: "image", format: item.format })
      : null,
  }));
  const cardsWithPreview = cards.map((c) => ({
    ...c,
    previewUrl:
      cloudinaryOk && c.cloudinaryPublicId
        ? c.cloudinaryResourceType === "video"
          ? videoPosterUrl(c.cloudinaryPublicId)
          : mediaUrl(c.cloudinaryPublicId, {
              resourceType: "image",
              format: c.cloudinaryFormat ?? undefined,
            })
        : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build-in-public LinkedIn posts, grounded in your real work. Drafts
            only — you post manually.
          </p>
        </div>
        <NewIdeaDialog />
      </div>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <h2 className="text-sm font-semibold">Portfolio cards</h2>
          <p className="text-xs text-muted-foreground">
            Curated visual-proof cards — this is what the portfolio&apos;s
            deep-dive grid actually shows, live. No portfolio-side content or
            deploy needed to add, edit, or remove one.
          </p>
        </div>
        <PortfolioCardsSection
          cards={cardsWithPreview}
          features={features}
          assets={pickerAssets}
          cloudinaryConfigured={cloudinaryOk}
        />
      </section>

      <div className="flex flex-col gap-1">
        <AgentRunConsole
          agent="content"
          userId={userId}
          label="Scan for content"
          initial={contentConsole}
        />
        {lastNote && (
          <p className="text-sm text-muted-foreground">Last run: {lastNote}</p>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Run &quot;Scan for content&quot; after logging some
            learning or shipping a feature.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {COLUMNS.map(({ status, label }) => {
            const col = items.filter((i) => i.status === status);
            if (col.length === 0) return null;
            return (
              <section key={status} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {label} ({col.length})
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {col.map((i) => (
                    <Link
                      key={i.id}
                      href={`/content/${i.id}`}
                      className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <p className="text-sm font-medium">{i.title}</p>
                      {i.hook && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {i.hook}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {i.sourceCount} source{i.sourceCount === 1 ? "" : "s"}
                        {i.body ? " · has draft" : ""}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
