"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtNum } from "@/lib/format";
import {
  combineSelectedAction,
  deleteQueueItemAction,
  loadMoreQueueAction,
  type ActionState,
} from "@/app/(app)/knowledge/actions";
import type { JobListItem } from "@/modules/ingestion/queue";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  running: "default",
  failed: "destructive",
  done: "outline",
};

function useToast(state: ActionState) {
  const seen = useRef<ActionState>(null);
  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

export function QueueList({
  initialItems,
  initialCursor,
}: {
  initialItems: JobListItem[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, startLoad] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [combineState, runCombine, combining] = useActionState<
    ActionState,
    string[]
  >(combineSelectedAction, null);
  const [deleteState, runDelete] = useActionState<ActionState, string>(
    deleteQueueItemAction,
    null,
  );
  useToast(combineState);
  useToast(deleteState);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root || !cursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || loadingMore || !cursor) {
          return;
        }
        startLoad(async () => {
          const page = await loadMoreQueueAction(cursor);
          setItems((cur) => {
            const seen = new Set(cur.map((j) => j.id));
            return [...cur, ...page.items.filter((j) => !seen.has(j.id))];
          });
          setCursor(page.nextCursor);
        });
      },
      { root, rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore]);

  if (items.length === 0) {
    return (
      <div className="rounded-md border px-3 py-3 text-sm text-muted-foreground">
        Queue is empty — nothing pending, running, or failed.
      </div>
    );
  }

  const pendingCount = items.filter((j) => j.status === "pending").length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onDelete(job: JobListItem) {
    if (!confirm(`Delete queue item "${job.title}"?`)) return;
    setItems((cur) => cur.filter((j) => j.id !== job.id));
    setSelected((prev) => {
      if (!prev.has(job.id)) return prev;
      const next = new Set(prev);
      next.delete(job.id);
      return next;
    });
    runDelete(job.id);
  }

  return (
    <div className="flex flex-col gap-2">
      {(selected.size > 0 || pendingCount > 1) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground tabular-nums">
            {selected.size} selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={combining || selected.size < 2}
            onClick={() => runCombine([...selected])}
          >
            {combining ? "Combining…" : `Combine ${selected.size} into one`}
          </Button>
          {selected.size > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          )}
          <span className="text-muted-foreground">
            Keeps the most recent snapshot, removes the rest.
          </span>
        </div>
      )}

      <div ref={scrollRef} className="max-h-96 overflow-y-auto rounded-md border">
        <ul className="flex flex-col divide-y text-sm">
          {items.map((j) => {
            const selectable = j.status === "pending";
            return (
              <li
                key={j.id}
                className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-30"
                  checked={selected.has(j.id)}
                  disabled={!selectable}
                  onChange={() => toggle(j.id)}
                  aria-label={`Select "${j.title}"`}
                />
                <Link
                  href={`/knowledge/queue/${j.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[j.status] ?? "outline"}>
                      {j.status}
                    </Badge>
                    <span className="font-medium">{j.title}</span>
                    <Badge variant="outline">{j.kind}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {fmtNum(j.charCount)} chars
                    </span>
                  </div>
                  {j.preview && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {j.preview}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    <span>
                      {j.sourceExternalRef ?? j.sourceKind ?? "upload"}
                    </span>
                    <span>queued {fmtDateTime(j.createdAt)}</span>
                    {j.attempts > 0 && <span>{j.attempts} attempt(s)</span>}
                    {j.error && (
                      <span className="text-red-600 dark:text-red-400">
                        {j.error.slice(0, 100)}
                      </span>
                    )}
                  </div>
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive"
                  disabled={j.status === "running"}
                  onClick={() => onDelete(j)}
                >
                  Delete
                </Button>
              </li>
            );
          })}
        </ul>
        {cursor && (
          <div
            ref={sentinelRef}
            className="px-3 py-2 text-center text-[11px] text-muted-foreground"
          >
            {loadingMore ? "Loading more…" : "Scroll for more"}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground tabular-nums">
        Showing {items.length}
        {cursor ? "+" : ""} item{items.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
