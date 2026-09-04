import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/user";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { listDocumentsByJob } from "@/lib/knowledge";
import { getJobDetail } from "@/modules/ingestion/queue";
import { getAgentConsole } from "@/modules/agents/runs";
import { AgentRunConsole } from "@/components/agent-run-console";
import { QueueItemEditor } from "@/components/knowledge/queue-item-editor";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Queue item ${id.slice(0, 8)} · Knowledge` };
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

export default async function QueueJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const job = await getJobDetail(userId, id);
  if (!job) notFound();

  const [producedDocs, extractorConsole] = await Promise.all([
    listDocumentsByJob(userId, job.id),
    getAgentConsole(userId, "extractor"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/knowledge#queue"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Knowledge
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <Badge variant={STATUS_VARIANT[job.status] ?? "outline"}>
            {job.status}
          </Badge>
          <Badge variant="outline">{job.kind}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {job.sourceExternalRef ?? job.sourceKind ?? "upload"} · queued{" "}
          {fmtDateTime(job.createdAt)}
          {job.finishedAt ? ` · finished ${fmtDateTime(job.finishedAt)}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Field label="kind" value={job.kind} />
          <Field label="status" value={job.status} />
          <Field label="attempts" value={String(job.attempts)} />
          <Field
            label="source text"
            value={`${fmtNum(job.charCount)} chars`}
          />
          <Field label="dedupe_key" value={job.dedupeKey ?? "—"} />
          <Field label="source_ref" value={job.sourceRef ?? "—"} />
          {job.error && (
            <div className="sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">
                error
              </span>
              <p className="mt-1 whitespace-pre-wrap text-xs text-red-600 dark:text-red-400">
                {job.error}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {job.status !== "done" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extract this job</CardTitle>
            <CardDescription>
              Runs the Extraction Agent on just this item and streams its steps.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentRunConsole
              agent="extractor"
              userId={userId}
              label="Extract this job"
              input={{ jobId: job.id }}
              initial={extractorConsole}
            />
          </CardContent>
        </Card>
      )}

      {producedDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Produced documents ({producedDocs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {producedDocs.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/knowledge/documents/${d.id}`}
                    className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="font-medium">{d.title}</span>
                    <Badge variant="secondary">{d.docType}</Badge>
                    {d.supersededAt && (
                      <Badge variant="destructive">superseded</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {d.chunkCount} chunk{d.chunkCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit / delete</CardTitle>
          <CardDescription>
            The raw material handed to the Extraction Agent (capped at 24k chars
            at extraction time). Editable while the item is still queued or
            failed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueueItemEditor
            id={job.id}
            title={job.title}
            text={job.fullText}
            canEdit={job.status === "pending" || job.status === "failed"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}
