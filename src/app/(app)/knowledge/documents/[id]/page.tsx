import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/user";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { getKnowledgeDocument } from "@/lib/knowledge";
import { getJobDetail } from "@/modules/ingestion/queue";
import { getRun } from "@/modules/agents/runs";
import {
  listAllLinkTargets,
  listAllTaxonomyTags,
  listDocumentLinks,
  listDocumentTags,
} from "@/modules/knowledge/mapping";
import { DocumentEditor } from "@/components/knowledge/document-editor";
import { MappingsCard } from "@/components/knowledge/mappings-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const doc = await getKnowledgeDocument(userId, id);
  return { title: doc ? `${doc.title} · Knowledge` : "Knowledge" };
}

export default async function KnowledgeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const doc = await getKnowledgeDocument(userId, id);
  if (!doc) notFound();

  const jobId = typeof doc.meta.jobId === "string" ? doc.meta.jobId : null;
  const agentRunId =
    typeof doc.meta.agentRunId === "string" ? doc.meta.agentRunId : null;

  const [job, run, links, tags, taxonomyOptions, allTargets] = await Promise.all([
    jobId ? getJobDetail(userId, jobId) : Promise.resolve(null),
    agentRunId ? getRun(userId, agentRunId) : Promise.resolve(null),
    listDocumentLinks(userId, id),
    listDocumentTags(userId, id),
    listAllTaxonomyTags(),
    listAllLinkTargets(userId),
  ]);

  const embeddedChunks = doc.chunks.filter((c) => c.embedded).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/knowledge#documents"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Knowledge
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <Badge variant="secondary">{doc.docType}</Badge>
          <Badge variant="outline">{doc.sourceKind}</Badge>
          {doc.supersededAt && <Badge variant="destructive">superseded</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {doc.sourceRef ?? "no source ref"} · created{" "}
          {fmtDateTime(doc.createdAt)}
          {doc.updatedAt !== doc.createdAt
            ? ` · updated ${fmtDateTime(doc.updatedAt)}`
            : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Body</CardTitle>
          <CardDescription>
            The distilled text — this is what gets chunked and embedded for
            retrieval. Edit or delete this document below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentEditor id={doc.id} title={doc.title} body={doc.body} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mappings & tags</CardTitle>
          <CardDescription>
            What gives this document a reason to exist — the skills, projects,
            learning sessions, and other entities it&apos;s linked to, plus its
            subject-area tags. Suggestions come from the nightly mapper;
            accept, reject, or add your own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MappingsCard
            documentId={doc.id}
            links={links}
            tags={tags}
            taxonomyOptions={taxonomyOptions}
            allTargets={allTargets}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provenance</CardTitle>
          <CardDescription>How this record was produced.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Field label="content_hash">
            <code className="text-xs">{doc.contentHash}</code>
          </Field>

          <Field label="Ingestion job">
            {job ? (
              <Link
                href={`/knowledge/queue/${job.id}`}
                className="text-primary hover:underline"
              >
                {job.kind} · {job.status} · {fmtNum(job.charCount)} chars
              </Link>
            ) : jobId ? (
              <span className="text-muted-foreground">
                {jobId} (no longer in the queue)
              </span>
            ) : (
              <span className="text-muted-foreground">not recorded</span>
            )}
          </Field>

          <Field label="Extractor run">
            {run ? (
              <span>
                {run.status}
                {run.modelUsed ? ` · ${run.modelUsed}` : ""}
                {run.inputTokens != null
                  ? ` · ${fmtNum(run.inputTokens)} in / ${fmtNum(
                      run.outputTokens ?? 0,
                    )} out`
                  : ""}
                {run.estimatedCostUsd != null
                  ? ` · ~$${Number(run.estimatedCostUsd).toFixed(4)}`
                  : ""}
                {run.finishedAt
                  ? ` · ${fmtDateTime(run.finishedAt.toISOString())}`
                  : ""}
              </span>
            ) : agentRunId ? (
              <span className="text-muted-foreground">{agentRunId}</span>
            ) : (
              <span className="text-muted-foreground">not recorded</span>
            )}
          </Field>

          <Field label="meta">
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 text-[11px]">
              {JSON.stringify(doc.meta, null, 2)}
            </pre>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            pgvector chunks ({doc.chunks.length})
          </CardTitle>
          <CardDescription>
            {embeddedChunks}/{doc.chunks.length} embedded ·{" "}
            {doc.chunks[0]?.embeddingModel ?? "no model"} · cosine HNSW. The raw
            768-dim vectors live in <code>knowledge_chunks.embedding</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {doc.chunks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This document has no chunks — nothing was embedded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-20 text-right">Tokens</TableHead>
                    <TableHead className="w-24 text-right">Vector</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.chunks.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {c.chunkIndex}
                      </TableCell>
                      <TableCell className="max-w-xl whitespace-pre-wrap text-xs">
                        {c.content}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.tokenCount ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {c.embedded ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            ✓ {c.dims ?? 768}-dim
                          </span>
                        ) : (
                          <span className="text-muted-foreground">not set</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
