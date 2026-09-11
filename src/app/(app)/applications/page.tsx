import Link from "next/link";
import { requireUserId } from "@/lib/user";
import { listDrafts, tokenExists } from "@/lib/outreach/gmail";
import {
  applicationsOverview,
  countApplicationsByStatus,
  listApplications,
  queueCounts,
} from "@/modules/applications/service";
import {
  folderName,
  listDates,
  listJobFolders,
} from "@/modules/applications/generate";
import { isR2Configured } from "@/modules/applications/store";
import { Badge } from "@/components/ui/badge";
import {
  SelectionBoard,
  type SelectionRow,
} from "@/components/applications/selection-board";
import { SearchJobsPanel } from "@/components/applications/search-jobs-panel";
import {
  OutreachBoard,
  type OutreachDraft,
  type OutreachRow,
} from "@/components/applications/outreach-board";

export const metadata = { title: "Applications" };
export const maxDuration = 90;

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

const OPEN_FOR_OUTREACH = new Set(["applied", "screening", "interviewing"]);

async function loadDraftsSafely(): Promise<
  { id: string; to: string; subject: string; snippet: string }[]
> {
  if (!tokenExists()) return [];
  try {
    return await listDrafts();
  } catch {
    return [];
  }
}

function draftsFor(
  drafts: OutreachDraft[],
  company: string,
  role: string,
): OutreachDraft[] {
  const c = company.toLowerCase();
  const r = role.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  return drafts.filter((d) => {
    const hay = `${d.subject} ${d.snippet} ${d.to}`.toLowerCase();
    return hay.includes(c) || r.some((w) => hay.includes(w));
  });
}

export default async function ApplicationsPage() {
  const userId = await requireUserId();
  const [apps, counts, overview, dates, queued, allDrafts] = await Promise.all([
    listApplications(userId),
    countApplicationsByStatus(userId),
    applicationsOverview(userId),
    listDates(),
    queueCounts(userId),
    loadDraftsSafely(),
  ]);
  const gmailReady = tokenExists();

  const statusByFolder = new Map(
    apps.map((a) => [folderName({ company: a.company, role: a.role }), a.status]),
  );
  const folderSections = await Promise.all(
    dates.map(async (d) => ({ date: d, folders: await listJobFolders(d) })),
  );

  const selectionRows: SelectionRow[] = apps.map((a) => {
    const parts = a.bundleDir?.replace(/^applications[/\\]/, "").split("/") ?? [];
    const [date, folder] = parts.length === 2 ? parts : [null, null];
    return {
      id: a.id,
      company: a.company,
      role: a.role,
      status: a.status,
      remoteKind: a.remoteKind,
      companyType: a.companyType,
      skillMatch: a.skillMatch,
      replyLikelihood: a.replyLikelihood,
      salaryLpa: a.salaryLpa,
      flags: (a.flags as string[]) ?? [],
      bundleDir: a.bundleDir,
      folder,
      date,
      contentRequestedAt: a.contentRequestedAt?.toISOString() ?? null,
      contentPreparedAt: a.contentPreparedAt?.toISOString() ?? null,
      applyRequestedAt: a.applyRequestedAt?.toISOString() ?? null,
      appliedAt: a.appliedAt?.toISOString() ?? null,
      recommended:
        a.status === "draft" &&
        ((a.flags as string[]) ?? []).length === 0 &&
        (a.skillMatch ?? 0) >= 0.5,
    };
  });

  const outreachRows: OutreachRow[] = overview
    .filter((r) => OPEN_FOR_OUTREACH.has(r.status))
    .map((r) => ({
      applicationId: r.id,
      company: r.company,
      role: r.role,
      status: r.status,
      bundleDir: r.bundleDir,
      channels: r.channels,
      kinds: r.kinds,
      lastAt: r.lastAt,
      nextDueAt: r.nextDueAt,
      overdue: r.overdue,
      drafts: draftsFor(allDrafts, r.company, r.role),
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Applications</h2>
        <p className="text-sm text-muted-foreground">
          The job-application ledger. Rows are written by{" "}
          <code className="text-xs">/apply-morning</code> in Claude Code;
          checkboxes below queue content/apply work for the next session.
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
        {(queued.content > 0 || queued.apply > 0) && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed bg-card px-2.5 py-1 text-xs text-muted-foreground">
            queued: {queued.content} content · {queued.apply} apply — ask a
            Claude Code session to process the queue
          </span>
        )}
      </div>

      <SearchJobsPanel />

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Select → content → apply</h3>
        <SelectionBoard rows={selectionRows} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Outreach & follow-ups</h3>
          <p className="text-xs text-muted-foreground">
            One card per open application — channels, what&apos;s due, Gmail
            drafts (Send), LinkedIn note/message (copy + &quot;I sent
            it&quot;), and a general follow-up log. Sending itself stays
            manual either way.
          </p>
        </div>
        <OutreachBoard rows={outreachRows} gmailReady={gmailReady} />
      </section>

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
