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
import { fmtDate } from "@/lib/format";
import {
  deleteDocumentAction,
  loadMoreDocumentsAction,
  type ActionState,
  type DocumentFilterParams,
} from "@/app/(app)/knowledge/actions";
import type { KnowledgeDocListItem } from "@/lib/knowledge";

export function DocumentsList({
  initialItems,
  initialCursor,
  filters,
}: {
  initialItems: KnowledgeDocListItem[];
  initialCursor: string | null;
  /** active search/skill/module filters — carried into "load more" pages */
  filters?: DocumentFilterParams;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, startLoad] = useTransition();

  const [delState, runDelete] = useActionState<ActionState, string>(
    deleteDocumentAction,
    null,
  );
  const seen = useRef<ActionState>(null);
  useEffect(() => {
    if (!delState || delState === seen.current) return;
    seen.current = delState;
    if (delState.ok) toast.success(delState.message);
    else toast.error(delState.message);
  }, [delState]);

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
          const page = await loadMoreDocumentsAction(cursor, filters);
          setItems((cur) => {
            const ids = new Set(cur.map((d) => d.id));
            return [...cur, ...page.items.filter((d) => !ids.has(d.id))];
          });
          setCursor(page.nextCursor);
        });
      },
      { root, rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // `filters` is an object literal from the parent — its identity changes
    // every render, but its contents only change when the URL (and thus the
    // doc list + this component's `key`) does, so it's intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loadingMore]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No knowledge documents match the current search/filters.
      </p>
    );
  }

  function onDelete(doc: KnowledgeDocListItem) {
    if (!confirm(`Delete knowledge document "${doc.title}"?`)) return;
    setItems((cur) => cur.filter((d) => d.id !== doc.id));
    runDelete(doc.id);
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={scrollRef} className="max-h-96 overflow-y-auto rounded-md border">
        <ul className="flex flex-col divide-y text-sm">
          {items.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50"
            >
              <Link
                href={`/knowledge/documents/${d.id}`}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
              >
                <span className="font-medium">{d.title}</span>
                <Badge variant="secondary">{d.docType}</Badge>
                <Badge variant="outline">{d.sourceKind}</Badge>
                {d.supersededAt && (
                  <Badge variant="destructive">superseded</Badge>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {d.chunkCount} chunk{d.chunkCount === 1 ? "" : "s"} ·{" "}
                  {fmtDate(d.createdAt)}
                </span>
              </Link>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-destructive"
                onClick={() => onDelete(d)}
              >
                Delete
              </Button>
            </li>
          ))}
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
        {cursor ? "+" : ""} document{items.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
