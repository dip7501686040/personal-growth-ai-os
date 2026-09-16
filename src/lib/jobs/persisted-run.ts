/**
 * The latest `runJobSearch()` result, persisted so the `/applications` page
 * can show it without a live browser click — `pnpm jobs` (the CLI half of
 * `/apply-morning`) saves here automatically, and `searchJobsAction` (the
 * page's own "Search jobs" button) does the same. One shared slot, not a
 * history: each run overwrites the last. Same bucket/store as the job
 * application folders (`@/modules/applications/store`) — a fixed key outside
 * the `<date>/<folder>/` scheme those use.
 *
 * Server-only.
 */
import {
  deleteObject,
  getObject,
  isR2Configured,
  putObject,
} from "@/modules/applications/store";
import type { JobSearchConfig, JobSearchResult } from "./types";

const KEY = "_job-search/latest.json";

export interface PersistedJobSearchRun {
  result: JobSearchResult;
  cfg: JobSearchConfig;
  savedAt: string;
}

/** No-ops when R2 isn't configured — this is a nice-to-have cache for the
 *  web page, never the source of truth for a run (the caller already has
 *  `result` in hand either way). */
export async function saveLatestSearchRun(
  result: JobSearchResult,
  cfg: JobSearchConfig,
): Promise<void> {
  if (!isR2Configured()) return;
  const payload: PersistedJobSearchRun = {
    result,
    cfg,
    savedAt: new Date().toISOString(),
  };
  await putObject(KEY, JSON.stringify(payload), "application/json");
}

export async function loadLatestSearchRun(): Promise<PersistedJobSearchRun | null> {
  if (!isR2Configured()) return null;
  const buf = await getObject(KEY);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as PersistedJobSearchRun;
  } catch {
    return null;
  }
}

/** "Done for today" — drop the saved run so it stops showing on the page.
 *  Picks already made are safe: `prepSearchJobsAction` already wrote them
 *  into `job_applications` (the ledger), which this never touches. */
export async function clearLatestSearchRun(): Promise<void> {
  if (!isR2Configured()) return;
  await deleteObject(KEY);
}
