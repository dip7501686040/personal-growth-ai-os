/** Shared with scripts/outreach.ts — kept here too so server code (the
 *  /applications outreach panel) doesn't need to shell out to the CLI. */

/** Pull the body under a `## Heading` line, up to the next `##` (or EOF). */
export function sectionOf(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\b.*$`, "im");
  const m = md.match(re);
  if (!m || m.index == null) return "";
  const rest = md.slice(m.index + m[0].length);
  const end = rest.search(/^##\s+/m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/** `job_applications.bundleDir` is `applications/<date>/<folder>` — this is
 *  what readFolderFile()/generate.ts need instead. */
export function parseBundleDir(
  bundleDir: string | null,
): { date: string; folder: string } | null {
  if (!bundleDir) return null;
  const parts = bundleDir.replace(/^applications[/\\]/, "").replace(/\/+$/, "").split("/");
  if (parts.length !== 2) return null;
  return { date: parts[0], folder: parts[1] };
}
