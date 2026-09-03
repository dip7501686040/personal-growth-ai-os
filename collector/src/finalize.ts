import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import type { RepoWindow } from "./collector.ts";
import { debug } from "./config.ts";
import * as git from "./git.ts";
import { enqueue } from "./queue.ts";

/** abs path → repo-relative, tolerant of macOS /private symlinks + deletions. */
function relTo(root: string, abs: string): string {
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {
    // ignore
  }
  const roots = [
    ...new Set([
      realRoot,
      root,
      realRoot.replace(/^\/private/, ""),
      `/private${realRoot}`,
    ]),
  ];
  let a = abs;
  try {
    a = realpathSync(abs);
  } catch {
    // deleted file — keep the raw path
  }
  for (const cand of [a, abs]) {
    for (const r of roots) {
      if (cand === r) return ".";
      if (cand.startsWith(`${r}/`)) return cand.slice(r.length + 1);
    }
  }
  return basename(abs); // last resort — never a machine path
}

/**
 * Consolidate one repo's window into a `coding_session` and enqueue it (if
 * anything changed). `windowStartAt` is the event's start time — for a
 * day-boundary rollup that's the start of the window, not the session.
 */
export function finalizeRepo(
  repo: RepoWindow,
  sessionId: string,
  windowStartAt: string,
  endedAt: string,
): boolean {
  const cwd = repo.root;
  const status = git.changedPaths(cwd, repo.startHead);

  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const abs of repo.touched) {
    const rel = relTo(repo.root, abs);
    const code = status.get(rel) ?? "";
    if (code === "D") deleted.push(rel);
    else if (code === "A") created.push(rel);
    else modified.push(rel);
  }

  const commits = git.commitsSince(cwd, repo.startHead);
  const stats = git.diffStats(cwd, repo.startHead);
  const changeCount =
    created.length + modified.length + deleted.length + commits.length;

  if (changeCount === 0) {
    debug(`finalize ${repo.name}: nothing to capture`);
    return false;
  }

  enqueue({
    clientEventId: randomUUID(),
    source: "claude_code",
    eventType: "coding_session",
    sessionId,
    projectPath: repo.root,
    projectName: repo.name,
    startedAt: windowStartAt,
    endedAt,
    durationSeconds: Math.max(
      0,
      Math.round((Date.parse(endedAt) - Date.parse(windowStartAt)) / 1000),
    ),
    files: { created, modified, deleted },
    git: {
      branch: git.branch(cwd) || repo.branch || undefined,
      commits,
      stats,
    },
    sessionSummary: commits[0]?.message || undefined,
  });
  debug(`finalize ${repo.name}: enqueued ${changeCount} changes`);
  return true;
}

/** Finalize every repo window in a session. Returns how many events fired. */
export function finalizeSession(
  repos: Record<string, RepoWindow>,
  sessionId: string,
  windowStartAt: string,
  endedAt: string,
): number {
  let fired = 0;
  for (const repo of Object.values(repos)) {
    if (finalizeRepo(repo, sessionId, windowStartAt, endedAt)) fired++;
  }
  return fired;
}
