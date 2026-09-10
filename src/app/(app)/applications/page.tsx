import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { fmtDateTime } from "@/lib/format";
import {
  countApplicationsByStatus,
  listApplications,
  listDueFollowups,
} from "@/modules/applications/service";
import {
  folderName,
  listDates,
  listJobFolders,
} from "@/modules/applications/generate";
import { isR2Configured } from "@/modules/applications/store";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Applications" };

const STATUS_ORDER = [
  "draft",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
] as const;

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  applied: "default",
  screening: "default",
  interviewing: "default",
  offer: "default",
  rejected: "destructive",
  ghosted: "outline",
};

export default async function ApplicationsPage() {
  const userId = await requireUserId();
  const [apps, counts, due, dates] = await Promise.all([
    listApplications(userId),
    countApplicationsByStatus(userId),
    listDueFollowups(userId),
    listDates(),
  ]);

  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: apps.filter((a) => a.status === s),
  })).filter((g) => g.items.length > 0);

  const statusByFolder = new Map(
    apps.map((a) => [folderName({ company: a.company, role: a.role }), a.status]),
  );
  const folderSections = await Promise.all(
    dates.map(async (d) => ({ date: d, folders: await listJobFolders(d) })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Applications</h2>
        <p className="text-sm text-muted-foreground">
          The job-application ledger. Rows are written by{" "}
          <code className="text-xs">/apply-morning</code> in Claude Code;
          statuses and follow-ups by your one-line log commands.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs"
          >
            <Badge variant={STATUS_VARIANT[s]}>{s}</Badge>
            <span className="tabular-nums text-muted-foreground">
              {counts[s]}
            </span>
          </span>
        ))}
        {apps.length === 0 && (
          <span className="text-sm text-muted-foreground">
            No applications yet.
          </span>
        )}
      </div>

      {due.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Follow-ups due ({due.length})
            </CardTitle>
            <CardDescription>
              Scheduled nudge date has passed and the application is still open.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border text-sm">
              {due.map((d) => (
                <li
                  key={d.application.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-2"
                >
                  <span className="font-medium">{d.application.company}</span>
                  <span className="text-muted-foreground">
                    {d.application.role}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    after {d.lastKind} · due {fmtDateTime(d.dueAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {grouped.map(({ status, items }) => (
        <section key={status} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {status} · {items.length}
          </h3>
          <div className="divide-y rounded-lg border">
            {items.map((a) => {
              const flags = (a.flags as string[]) ?? [];
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-1 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.company}</span>
                    <span className="text-muted-foreground">{a.role}</span>
                    {a.remoteKind && (
                      <Badge variant="outline">{a.remoteKind}</Badge>
                    )}
                    {a.companyType && a.companyType !== "product" && (
                      <Badge variant="outline">{a.companyType}</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {a.skillMatch != null &&
                        `match ${(a.skillMatch * 100).toFixed(0)}%`}
                      {a.replyLikelihood != null &&
                        ` · reply ${(a.replyLikelihood * 100).toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {a.salaryLpa != null && <span>{a.salaryLpa} LPA</span>}
                    {a.source && <span>via {a.source}</span>}
                    {a.contactName && <span>contact: {a.contactName}</span>}
                    {a.lastTouchpoint ? (
                      <span>
                        last: {a.lastTouchpoint.kind} (
                        {a.lastTouchpoint.channel}) ·{" "}
                        {fmtDateTime(a.lastTouchpoint.sentAt)}
                        {a.lastTouchpoint.nextDueAt &&
                          ` · next due ${fmtDateTime(a.lastTouchpoint.nextDueAt)}`}
                      </span>
                    ) : (
                      <span>no touchpoints yet</span>
                    )}
                    {a.bundleDir && <span>{a.bundleDir}</span>}
                  </div>
                  {flags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {flags.map((f) => (
                        <span
                          key={f}
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Folders</h3>
          <p className="text-xs text-muted-foreground">
            The per-job bundles.{" "}
            {isR2Configured()
              ? "Source of truth: the R2 applications bucket."
              : "R2 not configured — showing the local cache."}
          </p>
        </div>
        {folderSections.length === 0 && (
          <p className="text-sm text-muted-foreground">No folders yet.</p>
        )}
        {folderSections.map(({ date, folders }) => (
          <div key={date} className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground">
              {date} · {folders.length}
            </h4>
            <div className="divide-y rounded-lg border">
              {folders.map((f) => {
                const st = statusByFolder.get(f);
                return (
                  <Link
                    key={f}
                    href={`/applications/${date}/${f}`}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent/50"
                  >
                    <span className="truncate">{f}</span>
                    {st && (
                      <Badge
                        variant={STATUS_VARIANT[st] ?? "outline"}
                        className="ml-auto"
                      >
                        {st}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
