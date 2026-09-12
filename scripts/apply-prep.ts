/**
 * Scaffold per-job application folders — the deterministic half of
 * /apply-morning. Writes job.json and search-provenance.md per pick (the
 * latter is cheap string formatting off this run's search context, which
 * won't exist any later); the résumé, proof-bundle, and prose are generated
 * later, when actually needed (proof-bundle by /apply-content-queue,
 * everything else by /apply-drive) — so picking costs nothing beyond
 * recording the job and why it surfaced.
 *
 *   pnpm apply-prep --jobs <jobs.json> --pick 0,3,7 [--date YYYY-MM-DD]
 *
 * `jobs.json` is the output of `pnpm jobs --json`. Each pick writes
 * applications/<date>/<company>__<role>/{job.json,search-provenance.md} — to
 * the local cache and, when R2 is configured, to the `applications` bucket.
 *
 * All generation logic lives in src/modules/applications/generate.ts so the
 * /applications page can call the same functions.
 */
import { readFileSync } from "node:fs";
import { getOwnerUserId } from "@/lib/owner";
import { loadJobSearchConfig } from "@/lib/jobs/search";
import type { JobSearchResult } from "@/lib/jobs/types";
import { scaffoldJobFolder } from "@/modules/applications/generate";
import { isR2Configured } from "@/modules/applications/store";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const jobsPath = arg("--jobs");
  const pick = arg("--pick");
  if (!jobsPath || !pick) {
    throw new Error(
      "usage: pnpm apply-prep --jobs <jobs.json> --pick 0,3,7 [--date YYYY-MM-DD]",
    );
  }
  const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
  const result = JSON.parse(readFileSync(jobsPath, "utf8")) as JobSearchResult;
  const all = [...result.groupA, ...result.groupB];
  const idxs = pick.split(",").map((s) => Number(s.trim()));

  const userId = await getOwnerUserId();
  const cfg = await loadJobSearchConfig();

  let folders = 0;
  for (const i of idxs) {
    const job = all[i];
    if (!job) {
      console.log(`  index ${i}: out of range (have ${all.length})`);
      continue;
    }
    const out = await scaffoldJobFolder({ userId, job, cfg, result, date });
    folders += 1;
    console.log(
      `  [${i}] ${job.company} — ${job.role}\n` +
        `      applications/${out.date}/${out.folder}/{${out.files.join(",")}}`,
    );
  }

  console.log(
    `\n${folders} folder(s) scaffolded` +
      (isR2Configured()
        ? " → local cache + R2 bucket"
        : " → local cache only (R2 not configured)"),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
