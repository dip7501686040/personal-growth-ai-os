"use client";

import { useMemo, useState } from "react";

/** Client-side paging over an already-loaded array — these lists are small
 *  enough (tens to low hundreds of rows) that a server round-trip per page
 *  isn't worth it; this just slices what's already in memory. */
export function usePaginated<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [items, clampedPage, pageSize],
  );
  return { page: clampedPage, pageCount, pageItems, setPage };
}
