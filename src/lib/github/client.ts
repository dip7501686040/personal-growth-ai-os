import { env } from "@/lib/env";

const API = "https://api.github.com";

export interface GitHubRepo {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
  pushedAt: string | null;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  date: string | null;
}

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "personal-growth-ai-os",
    "x-github-api-version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const res = await fetch(`${API}${path}`, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub ${res.status} ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

/** The authenticated user's repos, newest push first. Needs GITHUB_TOKEN. */
export async function listMyRepos(limit = 200): Promise<GitHubRepo[]> {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not set — cannot list your repos.");
  }
  const out: GitHubRepo[] = [];
  for (let page = 1; out.length < limit && page <= 5; page++) {
    const rows = await gh<
      {
        full_name: string;
        description: string | null;
        default_branch: string;
        private: boolean;
        pushed_at: string | null;
      }[]
    >(`/user/repos?per_page=100&sort=pushed&page=${page}`);
    if (rows.length === 0) break;
    for (const r of rows) {
      out.push({
        fullName: r.full_name,
        description: r.description,
        defaultBranch: r.default_branch,
        private: r.private,
        pushedAt: r.pushed_at,
      });
    }
  }
  return out.slice(0, limit);
}

export async function getRepo(fullName: string): Promise<GitHubRepo> {
  const r = await gh<{
    full_name: string;
    description: string | null;
    default_branch: string;
    private: boolean;
    pushed_at: string | null;
  }>(`/repos/${fullName}`);
  return {
    fullName: r.full_name,
    description: r.description,
    defaultBranch: r.default_branch,
    private: r.private,
    pushedAt: r.pushed_at,
  };
}

export interface RepoReadme {
  text: string;
  sha: string;
}

export async function getReadme(fullName: string): Promise<RepoReadme | null> {
  try {
    const r = await gh<{ content: string; encoding: string; sha: string }>(
      `/repos/${fullName}/readme`,
    );
    const text =
      r.encoding === "base64"
        ? Buffer.from(r.content, "base64").toString("utf8")
        : r.content;
    return { text, sha: r.sha };
  } catch {
    return null;
  }
}

/** Raw text of one file (≤ ~1 MB), or null if missing/binary. */
export async function getFile(
  fullName: string,
  path: string,
): Promise<string | null> {
  try {
    const r = await gh<{ content?: string; encoding?: string }>(
      `/repos/${fullName}/contents/${path}`,
    );
    if (!r.content || r.encoding !== "base64") return null;
    return Buffer.from(r.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Commits on `branch`, newest first, stopping once `sinceSha` is reached
 * (exclusive). Capped at `max`.
 */
export async function getCommitsSince(
  fullName: string,
  branch: string,
  sinceSha: string | null,
  max = 100,
): Promise<GitHubCommit[]> {
  const out: GitHubCommit[] = [];
  for (let page = 1; out.length < max && page <= 5; page++) {
    const rows = await gh<
      {
        sha: string;
        commit: { message: string; author: { date: string } | null };
      }[]
    >(`/repos/${fullName}/commits?sha=${branch}&per_page=50&page=${page}`);
    if (rows.length === 0) break;
    for (const r of rows) {
      if (sinceSha && r.sha === sinceSha) return out;
      out.push({
        sha: r.sha,
        message: r.commit.message.split("\n")[0].slice(0, 200),
        date: r.commit.author?.date ?? null,
      });
      if (out.length >= max) break;
    }
  }
  return out;
}
