import { readFileSync } from "node:fs";
import { join } from "node:path";
import { usdInrRate } from "./salary";
import { scoreJob } from "./score";
import { SOURCES } from "./sources";
import type { JobSearchConfig, JobSearchResult, RawJob } from "./types";

export function loadJobSearchConfig(root = process.cwd()): JobSearchConfig {
  return JSON.parse(
    readFileSync(join(root, "resume", "job-search.json"), "utf8"),
  ) as JobSearchConfig;
}

const normRole = (r: string) =>
  r
    .toLowerCase()
    .replace(/\b(sr\.?|senior)\b/g, "senior")
    .replace(/\b(engineer|developer|dev)\b/g, "engineer")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const weekBucket = (iso: string | null) => {
  const d = iso ? Date.parse(iso) : Date.now();
  return Math.floor((Number.isNaN(d) ? Date.now() : d) / (7 * 864e5));
};

/** Fetch every available source in parallel, merge + dedupe, classify + score,
 *  split into Group A (clean) / Group B (flagged). Nothing is dropped. */
export async function runJobSearch(
  cfg: JobSearchConfig,
): Promise<JobSearchResult> {
  const usdInr = await usdInrRate();

  const settled = await Promise.allSettled(
    (Object.entries(SOURCES) as [string, (c: JobSearchConfig) => Promise<RawJob[]>][]).map(
      async ([name, fn]) => ({ name, jobs: await fn(cfg) }),
    ),
  );

  const raw: RawJob[] = [];
  const sourcesUsed: string[] = [];
  const sourcesSkipped: { source: string; reason: string }[] = [];
  const names = Object.keys(SOURCES);
  settled.forEach((s, i) => {
    const name = names[i];
    if (s.status === "fulfilled") {
      sourcesUsed.push(name);
      raw.push(...s.value.jobs);
    } else {
      sourcesSkipped.push({
        source: name,
        reason:
          s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    }
  });

  // dedupe on (company, normalized role, ~week)
  const byKey = new Map<string, RawJob & { roleKey: string; seenIn: Set<string> }>();
  for (const j of raw) {
    if (!j.company || !j.role || !j.url) continue;
    const roleKey = normRole(j.role);
    const key = `${j.company.toLowerCase().trim()}|${roleKey}|${weekBucket(j.postedAt)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.seenIn.add(j.source);
      // prefer the entry with more metadata (salary / description / applyUrl)
      const richer =
        (j.salaryText ? 1 : 0) +
          (j.descriptionSnippet ? 1 : 0) +
          (j.applyUrl ? 1 : 0) >
        (existing.salaryText ? 1 : 0) +
          (existing.descriptionSnippet ? 1 : 0) +
          (existing.applyUrl ? 1 : 0);
      if (richer) {
        const seen = existing.seenIn;
        byKey.set(key, { ...j, roleKey, seenIn: seen.add(j.source) });
      }
    } else {
      byKey.set(key, { ...j, roleKey, seenIn: new Set([j.source]) });
    }
  }

  const scored = [...byKey.values()].map((j) =>
    scoreJob({ ...j, seenIn: [...j.seenIn] }, cfg, usdInr),
  );

  const groupA = scored
    .filter((j) => j.group === "A")
    .sort((a, b) => b.score - a.score);
  const groupB = scored
    .filter((j) => j.group === "B")
    .sort((a, b) => b.score - a.score);

  return {
    groupA,
    groupB,
    sourcesUsed,
    sourcesSkipped,
    fetched: raw.length,
    afterDedupe: scored.length,
    usdInr,
  };
}
