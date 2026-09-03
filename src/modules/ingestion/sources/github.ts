import type { IngestionSource } from "@/lib/db/schema";
import {
  getCommitsSince,
  getFile,
  getReadme,
  getRepo,
  listMyRepos,
} from "@/lib/github/client";
import type { FetchResult, RawDoc, SourceConnector } from "./types";

const KEY_FILES = ["ARCHITECTURE.md", "DESIGN.md", "docs/architecture.md"];

export class GitHubConnector implements SourceConnector {
  readonly kind = "github_repo";

  async list(): Promise<{ ref: string; label: string; hint?: string }[]> {
    const repos = await listMyRepos();
    return repos.map((r) => ({
      ref: r.fullName,
      label: r.fullName,
      hint: r.description ?? (r.private ? "private" : "public"),
    }));
  }

  async fetchSince(source: IngestionSource): Promise<FetchResult> {
    const full = source.externalRef;
    if (!full) return { docs: [], cursor: source.lastCursor };

    const repo = await getRepo(full);
    const docs: RawDoc[] = [];

    // 1. README — dedupeKey carries the blob sha, so an unchanged README
    //    dedupes away on re-sync.
    const readme = await getReadme(full);
    if (readme && readme.text.trim().length > 40) {
      docs.push({
        kind: "github_repo_readme",
        dedupeKey: `github:${full}:readme:${readme.sha}`,
        payload: {
          text: `# ${full}\n${repo.description ? `\n${repo.description}\n` : ""}\n${readme.text}`,
          title: `${full} — README`,
          sourceKind: "github_repo",
          sourceRef: `github:${full}`,
          evidenceSourceType: "github_repo",
        },
      });
    }

    // 2. a couple of architecture-ish files, if present
    for (const path of KEY_FILES) {
      const content = await getFile(full, path);
      if (content && content.trim().length > 60) {
        docs.push({
          kind: "github_repo_doc",
          dedupeKey: `github:${full}:file:${path}:${hash(content)}`,
          payload: {
            text: content,
            title: `${full} — ${path}`,
            sourceKind: "github_repo",
            sourceRef: `github:${full}:${path}`,
            evidenceSourceType: "github_repo",
          },
        });
      }
    }

    // 3. commits since the stored cursor SHA
    const commits = await getCommitsSince(
      full,
      repo.defaultBranch,
      source.lastCursor,
    );
    const newestSha = commits[0]?.sha ?? source.lastCursor;
    if (commits.length > 0) {
      const list = commits
        .map((c) => `- ${c.sha.slice(0, 7)} ${c.message}`)
        .join("\n");
      docs.push({
        kind: "github_commits",
        dedupeKey: `github:${full}:commits:${newestSha}`,
        payload: {
          text: `Recent commits on ${full} (${repo.defaultBranch}):\n\n${list}`,
          title: `${full} — ${commits.length} recent commits`,
          sourceKind: "github_repo",
          sourceRef: `github:${full}:commits`,
          evidenceSourceType: "github_repo",
        },
      });
    }

    return { docs, cursor: newestSha };
  }
}

// tiny non-crypto hash for dedupe keys
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export const gitHubConnector = new GitHubConnector();
