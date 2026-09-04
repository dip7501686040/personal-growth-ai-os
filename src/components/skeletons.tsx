import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared skeletons for route-level `loading.tsx` fallbacks.
 *
 * A single `loading.tsx` at the (app) group root only fires on the first entry
 * into the group — once that Suspense boundary is committed, navigating between
 * sibling/nested routes won't re-show it. So every leaf route folder gets its
 * own `loading.tsx` (a one-line re-export of one of these), which also enables
 * partial prefetching for the dynamic detail routes.
 */

function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44 max-w-full" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** List / overview pages: heading + stat row + content cards. */
export function PageSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-52 max-w-full" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px]" />
        ))}
      </div>

      <CardSkeleton />
      <CardSkeleton />

      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Detail pages: back link + title + badges + cards (no stat row). */
export function DetailSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={5} />
      </div>
      <CardSkeleton rows={6} />

      <span className="sr-only">Loading…</span>
    </div>
  );
}
