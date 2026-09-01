import { execFileSync } from "node:child_process";

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return "";
  }
}

export const repoRoot = (cwd: string): string | null =>
  git(["rev-parse", "--show-toplevel"], cwd) || null;

export const branch = (cwd: string): string | null =>
  git(["rev-parse", "--abbrev-ref", "HEAD"], cwd) || null;

export const head = (cwd: string): string | null =>
  git(["rev-parse", "HEAD"], cwd) || null;

export const statusPorcelain = (cwd: string): string[] =>
  git(["status", "--porcelain"], cwd).split("\n").filter(Boolean);

/** repo-relative path → single status letter (A/M/D/R…), working tree + since HEAD. */
export function changedPaths(
  cwd: string,
  sinceHead: string | null,
): Map<string, string> {
  const map = new Map<string, string>();
  const add = (raw: string) => {
    for (const line of raw.split("\n").filter(Boolean)) {
      const m = /^([A-Z])\d*\t(.+)$/.exec(line.trim());
      if (m) map.set(m[2].split("\t").pop()!.trim(), m[1]);
    }
  };
  // committed during the session
  if (sinceHead) add(git(["diff", "--name-status", `${sinceHead}..HEAD`], cwd));
  // still uncommitted
  add(git(["diff", "--name-status", "HEAD"], cwd));
  for (const line of git(["status", "--porcelain"], cwd).split("\n")) {
    if (!line) continue;
    const code = line.slice(0, 2);
    const p = line.slice(3).trim();
    if (code.includes("?")) map.set(p, "A");
    else if (!map.has(p)) map.set(p, code.trim().charAt(0) || "M");
  }
  return map;
}

export function commitsSince(
  cwd: string,
  sinceHead: string | null,
): { hash: string; message: string }[] {
  const range = sinceHead ? `${sinceHead}..HEAD` : "-20";
  const out = git(["log", range, "--pretty=format:%H%x1f%s"], cwd);
  if (!out) return [];
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, message] = line.split("\x1f");
      return { hash: hash.slice(0, 40), message: message ?? "" };
    });
}

function parseShortstat(s: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  const fc = /(\d+) files? changed/.exec(s);
  const ins = /(\d+) insertions?/.exec(s);
  const del = /(\d+) deletions?/.exec(s);
  return {
    filesChanged: Number(fc?.[1] ?? 0),
    insertions: Number(ins?.[1] ?? 0),
    deletions: Number(del?.[1] ?? 0),
  };
}

/** Combined working-tree + committed-this-session diff stats. */
export function diffStats(
  cwd: string,
  sinceHead: string | null,
): { filesChanged: number; insertions: number; deletions: number } {
  const working = parseShortstat(git(["diff", "--shortstat", "HEAD"], cwd));
  const committed = sinceHead
    ? parseShortstat(git(["diff", "--shortstat", `${sinceHead}..HEAD`], cwd))
    : { filesChanged: 0, insertions: 0, deletions: 0 };
  return {
    filesChanged: working.filesChanged + committed.filesChanged,
    insertions: working.insertions + committed.insertions,
    deletions: working.deletions + committed.deletions,
  };
}
