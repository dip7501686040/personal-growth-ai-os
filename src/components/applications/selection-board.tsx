"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  applyAction,
  deleteApplicationAction,
  processContentAction,
} from "@/app/(app)/applications/actions";

export interface SelectionRow {
  id: string;
  company: string;
  role: string;
  status: string;
  remoteKind: string | null;
  companyType: string | null;
  skillMatch: number | null;
  replyLikelihood: number | null;
  salaryLpa: number | null;
  flags: string[];
  bundleDir: string | null;
  folder: string | null;
  date: string | null;
  contentRequestedAt: string | null;
  contentPreparedAt: string | null;
  applyRequestedAt: string | null;
  appliedAt: string | null;
  recommended: boolean;
}

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

function queueBadge(row: SelectionRow) {
  const contentQueued =
    row.contentRequestedAt &&
    (!row.contentPreparedAt || row.contentPreparedAt < row.contentRequestedAt);
  const applyQueued =
    row.applyRequestedAt && (!row.appliedAt || row.appliedAt < row.applyRequestedAt);
  if (!contentQueued && !applyQueued) return null;
  return (
    <span className="flex gap-1">
      {contentQueued && (
        <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300">
          content queued
        </Badge>
      )}
      {applyQueued && (
        <Badge variant="outline" className="border-violet-400 text-violet-700 dark:text-violet-300">
          apply queued
        </Badge>
      )}
    </span>
  );
}

export function SelectionBoard({ rows }: { rows: SelectionRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.recommended).map((r) => r.id)),
  );

  const grouped = useMemo(() => {
    const order = ["draft", "applied", "screening", "interviewing", "offer", "rejected", "ghosted"];
    return order
      .map((status) => ({ status, items: rows.filter((r) => r.status === status) }))
      .filter((g) => g.items.length > 0);
  }, [rows]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectableIds = rows.map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const run = (fn: () => Promise<{ ok: boolean; message: string } | null>) =>
    start(async () => {
      const res = await fn();
      if (!res) return;
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No applications yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="accent-primary"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(selectableIds))
            }
          />
          select all
        </label>
        <span className="text-xs text-muted-foreground">
          {selected.size} selected
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || selected.size === 0}
            onClick={() => run(() => processContentAction([...selected]))}
          >
            Process content
          </Button>
          <Button
            size="sm"
            disabled={pending || selected.size === 0}
            onClick={() => run(() => applyAction([...selected]))}
          >
            Apply
          </Button>
        </div>
      </div>

      {grouped.map(({ status, items }) => (
        <section key={status} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {status} · {items.length}
          </h3>
          <div className="divide-y rounded-lg border">
            {items.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="font-medium">{r.company}</span>
                  <span className="text-muted-foreground">{r.role}</span>
                  {r.recommended && (
                    <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-300">
                      recommended
                    </Badge>
                  )}
                  {r.remoteKind && <Badge variant="outline">{r.remoteKind}</Badge>}
                  {r.companyType && r.companyType !== "product" && (
                    <Badge variant="outline">{r.companyType}</Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {r.skillMatch != null && `match ${(r.skillMatch * 100).toFixed(0)}%`}
                    {r.replyLikelihood != null && ` · reply ${(r.replyLikelihood * 100).toFixed(0)}%`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {r.salaryLpa != null && <span>{r.salaryLpa} LPA</span>}
                  {r.folder && r.date && (
                    <Link
                      href={`/applications/${r.date}/${r.folder}`}
                      className="underline"
                    >
                      {r.folder}
                    </Link>
                  )}
                  {queueBadge(r)}
                  <button
                    type="button"
                    className="ml-auto text-destructive underline disabled:opacity-50"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Delete ${r.company} — ${r.role}? This removes it and its folder for good.`)) return;
                      run(() => deleteApplicationAction(r.id));
                    }}
                  >
                    delete
                  </button>
                </div>
                {r.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.flags.map((f) => (
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
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export { STATUS_VARIANT };
