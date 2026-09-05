import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { getLastCronRuns } from "@/lib/cron-runs";
import { env } from "@/lib/env";
import { fmtDateTime, fmtNum } from "@/lib/format";
import {
  getModuleFacets,
  getSkillFacets,
  knowledgeStats,
  listKnowledgeDocuments,
} from "@/lib/knowledge";
import {
  countJobsByStatus,
  countPendingJobs,
  listJobs,
} from "@/modules/ingestion/queue";
import { countPendingContextEvents } from "@/modules/ingestion/refresh";
import { listSources } from "@/modules/ingestion/sources";
import { getAgentConsole } from "@/modules/agents/runs";
import { DocumentFilters } from "@/components/knowledge/document-filters";
import { DocumentsList } from "@/components/knowledge/documents-list";
import { KnowledgePanel } from "@/components/knowledge/knowledge-panel";
import { QueueControls } from "@/components/knowledge/queue-controls";
import { QueueList } from "@/components/knowledge/queue-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Knowledge" };

const QUEUE_STATUSES = ["pending", "running", "failed"];
const CRON_JOBS = ["knowledge-map", "knowledge-refresh", "github-sync", "ingest-drain"] as const;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; skill?: string; type?: string }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const skillIds = sp.skill?.split(",").filter(Boolean) ?? [];
  const targetTypes = sp.type?.split(",").filter(Boolean) ?? [];

  const [
    sources,
    pending,
    pendingEvents,
    stats,
    queueCounts,
    jobsPage,
    docsPage,
    extractorConsole,
    skillFacets,
    moduleFacets,
    cronRuns,
  ] = await Promise.all([
    listSources(userId),
    countPendingJobs(userId),
    countPendingContextEvents(userId),
    knowledgeStats(userId),
    countJobsByStatus(userId),
    listJobs(userId, { statuses: QUEUE_STATUSES, limit: 10 }),
    listKnowledgeDocuments(userId, { limit: 10, q, skillIds, targetTypes }),
    getAgentConsole(userId, "extractor"),
    getSkillFacets(userId),
    getModuleFacets(userId),
    getLastCronRuns(userId, CRON_JOBS),
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
        <StatLink
          href="#documents"
          label="Knowledge documents"
          value={stats.documents}
          hint={
            `${fmtNum(stats.chunks)} embedded chunk${stats.chunks === 1 ? "" : "s"}` +
            (stats.byModel.length
              ? ` · ${stats.byModel
                  .map((m) => m.model ?? "unembedded")
                  .join(", ")}`
              : "")
          }
        />
        <StatLink
          href="#queue"
          label="Queued for extraction"
          value={pending}
          hint={
            queueCounts.running || queueCounts.failed
              ? `${queueCounts.running} running · ${queueCounts.failed} failed · ${queueCounts.done} done`
              : `${queueCounts.done} done`
          }
        />
        <StatLink
          href="#crons"
          label="Pending context events"
          value={pendingEvents}
          hint="waiting for knowledge-refresh to drain"
        />
      </div>

      {stats.byType.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.byType.map((t) => `${t.n} ${t.docType}`).join(" · ")}
          {"  |  "}
          {stats.bySource.map((s) => `${s.n} from ${s.sourceKind}`).join(" · ")}
        </p>
      )}

      {/* ── Extraction queue ─────────────────────────────────────────────── */}
      <Card id="queue" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Extraction queue</CardTitle>
          <CardDescription>
            Raw items waiting for the Extraction Agent. Processing streams the
            same live log as every other agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <QueueControls userId={userId} initial={extractorConsole} />
          <QueueList
            key={jobsPage.items.map((j) => j.id).join(",")}
            initialItems={jobsPage.items}
            initialCursor={jobsPage.nextCursor}
          />
        </CardContent>
      </Card>

      {/* ── Stored knowledge documents ──────────────────────────────────── */}
      <Card id="documents" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>
            Knowledge documents ({stats.documents}) · {fmtNum(stats.chunks)}{" "}
            embedded chunk{stats.chunks === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            The distilled, structured records in Postgres. Each row shows how many
            pgvector chunks it was embedded into — open one for its body,
            provenance, and per-chunk vectors.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DocumentFilters skillFacets={skillFacets} moduleFacets={moduleFacets} />
          <DocumentsList
            key={`${q ?? ""}|${skillIds.join(",")}|${targetTypes.join(",")}|${docsPage.items.map((d) => d.id).join(",")}`}
            initialItems={docsPage.items}
            initialCursor={docsPage.nextCursor}
            filters={{ q, skillIds, targetTypes }}
          />
        </CardContent>
      </Card>

      {/* ── Sources ─────────────────────────────────────────────────────── */}
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

      {/* ── System crons ────────────────────────────────────────────────── */}
      <Card id="crons" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>System crons</CardTitle>
          <CardDescription>
            Last run of each nightly job, straight from{" "}
            <code className="text-xs">cron_runs</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-md border text-sm">
            {CRON_JOBS.map((job, i) => {
              const run = cronRuns[i];
              return (
                <li
                  key={job}
                  className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium">{job}</span>
                  {run ? (
                    <span className="text-xs text-muted-foreground">
                      <span
                        className={
                          run.status === "error"
                            ? "text-destructive"
                            : run.status === "running"
                              ? "text-muted-foreground"
                              : "text-foreground"
                        }
                      >
                        {run.status}
                      </span>
                      {" · "}
                      {fmtDateTime(run.startedAt)}
                      {run.summary ? ` · ${run.summary}` : ""}
                      {run.error ? ` · ${run.error}` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">never run</span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatLink({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
          {hint}
        </div>
      )}
    </Link>
  );
}
