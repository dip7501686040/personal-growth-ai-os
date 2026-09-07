/**
 * Fetch, score and group today's matching jobs from every available source.
 *
 *   pnpm jobs [--json] [--b]     # --json: raw result · --b: also print Group B
 *
 * Tune resume/job-search.json. This is the precursor to J5's /apply-morning.
 */
import { loadJobSearchConfig, runJobSearch } from "@/lib/jobs/search";
import type { ScoredJob } from "@/lib/jobs/types";

function line(j: ScoredJob): string {
  const sal = j.salaryLpa != null ? `${j.salaryLpa}LPA` : "—";
  const flags = j.flags.length ? `  {${j.flags.join(", ")}}` : "";
  return (
    `  ${j.score.toFixed(2)}  ${(j.company + " — " + j.role).slice(0, 62).padEnd(63)}` +
    ` ${j.remoteKind.padEnd(13)} ${sal.padEnd(8)} reply ${j.replyLikelihood.toFixed(2)}` +
    ` [${j.seenIn.join("/")}]${flags}\n        ${j.url}`
  );
}

async function main() {
  const json = process.argv.includes("--json");
  const showB = process.argv.includes("--b");
  const cfg = loadJobSearchConfig();
  const r = await runJobSearch(cfg);

  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }

  console.log(
    `sources used: ${r.sourcesUsed.join(", ") || "(none)"}` +
      (r.sourcesSkipped.length
        ? `\nskipped: ${r.sourcesSkipped.map((s) => `${s.source} (${s.reason})`).join(", ")}`
        : ""),
  );
  console.log(
    `fetched ${r.fetched} → ${r.afterDedupe} after dedupe · USD/INR ${r.usdInr.toFixed(1)}\n`,
  );

  console.log(`━━ GROUP A — clean (${r.groupA.length}) ━━`);
  r.groupA.slice(0, 25).forEach((j) => console.log(line(j)));

  console.log(`\n━━ GROUP B — flagged, review (${r.groupB.length}) ━━`);
  (showB ? r.groupB : r.groupB.slice(0, 10)).forEach((j) => console.log(line(j)));
  if (!showB && r.groupB.length > 10)
    console.log(`  … +${r.groupB.length - 10} more (pnpm jobs --b)`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
