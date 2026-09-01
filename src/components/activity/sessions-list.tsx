import type { ActivityEvent } from "@/lib/db/schema";

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function SessionsList({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No coding sessions captured yet. Set up the collector (below) and run a
        Claude Code session in a git repo.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((e) => {
        const created = e.filesCreated as string[];
        const modified = e.filesModified as string[];
        const deleted = e.filesDeleted as string[];
        const commits = e.gitCommits as { hash: string; message: string }[];
        const stats = e.gitStats as {
          filesChanged?: number;
          insertions?: number;
          deletions?: number;
        };
        const fileCount = created.length + modified.length + deleted.length;

        return (
          <li key={e.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                {e.projectName ?? "unknown project"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(e.startedAt).toLocaleString()} ·{" "}
                {fmtDuration(e.durationSeconds)} · {fileCount} file
                {fileCount === 1 ? "" : "s"} · {commits.length} commit
                {commits.length === 1 ? "" : "s"}
              </span>
              <span
                className={
                  e.status === "analyzed"
                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : e.status === "failed"
                      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-300"
                      : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {e.status}
              </span>
              {e.gitBranch && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {e.gitBranch}
                </span>
              )}
            </div>

            {(stats.insertions || stats.deletions) && (
              <p className="mt-1 text-xs text-muted-foreground">
                +{stats.insertions ?? 0} / -{stats.deletions ?? 0}
              </p>
            )}

            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">details</summary>
              <div className="mt-1 flex flex-col gap-1">
                {commits.length > 0 && (
                  <div>
                    <span className="font-medium text-foreground">Commits:</span>
                    <ul className="list-disc pl-5">
                      {commits.map((c) => (
                        <li key={c.hash}>
                          <code>{c.hash.slice(0, 7)}</code> {c.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {[
                  ["Created", created],
                  ["Modified", modified],
                  ["Deleted", deleted],
                ].map(([label, list]) =>
                  (list as string[]).length ? (
                    <div key={label as string}>
                      <span className="font-medium text-foreground">
                        {label}:
                      </span>{" "}
                      {(list as string[]).join(", ")}
                    </div>
                  ) : null,
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
