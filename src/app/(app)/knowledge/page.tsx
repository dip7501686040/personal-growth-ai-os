import { requireUserId } from "@/lib/user";
import { env } from "@/lib/env";
import { knowledgeStats } from "@/lib/knowledge";
import { countPendingJobs } from "@/modules/ingestion/queue";
import { listSources } from "@/modules/ingestion/sources";
import { KnowledgePanel } from "@/components/knowledge/knowledge-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Knowledge" };

export default async function KnowledgePage() {
  const userId = await requireUserId();
  const [sources, pending, stats] = await Promise.all([
    listSources(userId),
    countPendingJobs(userId),
    knowledgeStats(userId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Personal knowledge</h2>
        <p className="text-sm text-muted-foreground">
          Connect sources — the Extraction Agent distils them into structured
          evidence + a searchable knowledge base every agent draws on.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Knowledge documents" value={stats.documents} />
        <Stat label="Embedded chunks" value={stats.chunks} />
        <Stat label="Queued for extraction" value={pending} />
      </div>

      {stats.byType.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.byType.map((t) => `${t.n} ${t.docType}`).join(" · ")}
          {"  |  "}
          {stats.bySource.map((s) => `${s.n} from ${s.sourceKind}`).join(" · ")}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>
            GitHub repos sync incrementally (by commit SHA). Uploads are one-shot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgePanel
            sources={sources.map((s) => ({
              id: s.id,
              kind: s.kind,
              externalRef: s.externalRef,
              status: s.status,
              error: s.error,
              lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
            }))}
            githubTokenSet={!!env.GITHUB_TOKEN}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
