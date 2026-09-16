"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { prepSearchJobsAction, searchJobsAction } from "@/app/(app)/applications/actions";
import type { JobSearchResult, ScoredJob } from "@/lib/jobs/types";

const PAGE_SIZE = 20;

/** Same `company|role` key `recordApplication` upserts on
 *  (@/modules/applications/service's `dedupe`) — reimplemented here rather
 *  than imported since that module pulls in the server-only drizzle client. */
const dedupeKey = (company: string, role: string) =>
  `${company.trim().toLowerCase()}|${role.trim().toLowerCase().replace(/\s+/g, " ")}`;

function Row({
  j,
  i,
  checked,
  onToggle,
  alreadyApplied,
}: {
  j: ScoredJob;
  i: number;
  checked: boolean;
  onToggle: (i: number) => void;
  alreadyApplied: boolean;
}) {
  const gm =
    j.graphMatch != null && j.graphMatch > j.substringSkillMatch
      ? ` · graph ${j.graphMatch.toFixed(2)}`
      : "";
  return (
    <label
      className={`flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/50 ${
        alreadyApplied ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        className="accent-primary"
        checked={checked}
        disabled={alreadyApplied}
        onChange={() => onToggle(i)}
      />
      <span className="w-6 shrink-0 text-muted-foreground tabular-nums">{i}</span>
      <span className="tabular-nums">{j.score.toFixed(2)}</span>
      <span className="font-medium">{j.company}</span>
      <span className="text-muted-foreground">{j.role}</span>
      {alreadyApplied && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          already applied
        </span>
      )}
      <span className="ml-auto text-muted-foreground">
        {j.remoteKind} · reply {j.replyLikelihood.toFixed(2)} · skill {j.skillMatch.toFixed(2)}
        {gm}
      </span>
    </label>
  );
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-1.5 text-xs text-muted-foreground">
      <button
        type="button"
        className="underline disabled:opacity-40 disabled:no-underline"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        prev
      </button>
      <span>
        page {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        className="underline disabled:opacity-40 disabled:no-underline"
        disabled={page >= totalPages - 1}
        onClick={() => onPage(page + 1)}
      >
        next
      </button>
    </div>
  );
}

function GroupSection({
  title,
  jobs,
  indexOffset,
  selected,
  onToggle,
  appliedSet,
}: {
  title: string;
  jobs: ScoredJob[];
  indexOffset: number;
  selected: Set<number>;
  onToggle: (i: number) => void;
  appliedSet: Set<string>;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const pageJobs = jobs.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (jobs.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
        {title} ({jobs.length})
      </h4>
      <div className="divide-y rounded-md border">
        {pageJobs.map((j, i) => {
          const globalIndex = indexOffset + page * PAGE_SIZE + i;
          return (
            <Row
              key={`${j.company}-${j.role}-${globalIndex}`}
              j={j}
              i={globalIndex}
              checked={selected.has(globalIndex)}
              onToggle={onToggle}
              alreadyApplied={appliedSet.has(dedupeKey(j.company, j.role))}
            />
          );
        })}
      </div>
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

export function SearchJobsPanel({
  initialResult,
  savedAt,
  appliedKeys,
}: {
  initialResult: JobSearchResult | null;
  savedAt: string | null;
  appliedKeys: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [prepPending, startPrep] = useTransition();
  const [result, setResult] = useState<JobSearchResult | null>(initialResult);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(savedAt);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const appliedSet = useMemo(() => new Set(appliedKeys), [appliedKeys]);

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const run = () =>
    start(async () => {
      const res = await searchJobsAction();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setResult(res.result);
      setLastSavedAt(new Date().toISOString());
      setSelected(new Set());
      toast.success(
        `${res.result.groupA.length} clean, ${res.result.groupB.length} flagged.`,
      );
    });

  const prep = () =>
    startPrep(async () => {
      const res = await prepSearchJobsAction([...selected]);
      if (!res) return;
      if (res.ok) {
        toast.success(res.message);
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  const savedLabel = useMemo(() => {
    if (!lastSavedAt) return null;
    try {
      return new Date(lastSavedAt).toLocaleString();
    } catch {
      return null;
    }
  }, [lastSavedAt]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Search jobs</h3>
        <span className="text-xs text-muted-foreground">
          fetch + score every configured source — deterministic, no judgment needed
          {savedLabel && ` · last saved ${savedLabel}`}
        </span>
        <Button size="sm" variant="secondary" className="ml-auto" disabled={pending} onClick={run}>
          {pending ? "Searching…" : "Search jobs"}
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            sources: {result.sourcesUsed.join(", ") || "(none)"}
            {result.sourcesSkipped.length > 0 &&
              ` — skipped: ${result.sourcesSkipped.map((s) => s.source).join(", ")}`}
            {" · "}
            fetched {result.fetched} → {result.afterDedupe} after dedupe
            {result.graphTerms.length > 0 &&
              ` · graph terms: ${result.graphTerms.join(", ")}`}
          </p>

          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={prepPending || selected.size === 0}
              onClick={prep}
            >
              {prepPending ? "Prepping…" : `Prep ${selected.size || ""} selected`}
            </Button>
          </div>

          <GroupSection
            title="Group A — clean"
            jobs={result.groupA}
            indexOffset={0}
            selected={selected}
            onToggle={toggle}
            appliedSet={appliedSet}
          />
          <GroupSection
            title="Group B — flagged, review"
            jobs={result.groupB}
            indexOffset={result.groupA.length}
            selected={selected}
            onToggle={toggle}
            appliedSet={appliedSet}
          />

          <p className="text-xs text-muted-foreground">
            Prepping writes job.json + search-provenance.md and records a draft
            row — it shows up in &quot;Select → content → apply&quot; below.
            Résumé, proof-bundle and prose are still generated later, when a
            Claude Code session actually needs them.
          </p>
        </div>
      )}
    </div>
  );
}
