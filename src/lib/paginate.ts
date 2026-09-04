/**
 * Keyset (cursor) pagination over rows ordered by `(created_at DESC, id DESC)`.
 * The cursor is opaque to callers — `"<iso>__<uuid>"` of the last row on a page.
 */

export interface Page<T> {
  items: T[];
  /** pass back to fetch the next page; null when the last page was returned */
  nextCursor: string | null;
}

export interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return `${c.createdAt.toISOString()}__${c.id}`;
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  const i = raw.lastIndexOf("__");
  if (i < 0) return null;
  const createdAt = new Date(raw.slice(0, i));
  const id = raw.slice(i + 2);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}
