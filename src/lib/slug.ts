const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Lowercase, hyphenated, ASCII-only slug capped at 64 chars. */
export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return s || "item";
}
