/**
 * Scaffold per-job application folders — the deterministic half of
 * /apply-morning. Claude Code then writes the prose files (why-fit,
 * cover-letter, pitch-recruiter, pitch-referral).
 *
 *   pnpm apply-prep --jobs <jobs.json> --pick 0,3,7 [--date YYYY-MM-DD]
 *
 * `jobs.json` is the output of `pnpm jobs --json`. Each pick writes
 * applications/<date>/<company>__<role>/ with job.json, proof-bundle.md,
 * outreach-targets.md, search-provenance.md and resume.md/.html/.pdf — to the
 * local cache and, when R2 is configured, to the `applications` bucket.
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
  const cfg = loadJobSearchConfig();

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
        `      applications/${out.date}/${out.folder}\n` +
        `      archetype=${out.archetype} · proof: ${out.proof.skills} skills / ${out.proof.features} features` +
        (out.pdfOk ? " · resume.pdf ✓" : " · resume.pdf ✗ (no Chrome — print resume.html by hand)") +
        `\n      write next: why-fit.md, cover-letter.md (if the JD asks), pitch-recruiter.md, pitch-referral.md`,
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
