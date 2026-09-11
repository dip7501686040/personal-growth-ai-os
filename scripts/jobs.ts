/**
 * Fetch, score and group today's matching jobs from every available source.
 *
 *   pnpm jobs [--json] [--b] [--no-graph]
 *     --json     raw JobSearchResult
 *     --b        also print all of Group B
 *     --no-graph skip the knowledge-graph layer (query terms + skillMatch)
 *
 * Tune resume/job-search.json (manual layer). The knowledge-graph layer is
 * automatic unless `useGraphMatch: false` there or `--no-graph` here.
 */
import { loadJobSearchConfig, runJobSearch } from "@/lib/jobs/search";
import type { ScoredJob } from "@/lib/jobs/types";
import { getOwnerUserId } from "@/lib/owner";
import { deriveGraphSearchTerms, makeGraphMatcher } from "@/modules/jobs/graph";

function line(j: ScoredJob): string {
  const sal = j.salaryLpa != null ? `${j.salaryLpa}LPA` : "—";
  const flags = j.flags.length ? `  {${j.flags.join(", ")}}` : "";
  const gm =
    j.graphMatch != null && j.graphMatch > j.substringSkillMatch
      ? ` graph ${j.graphMatch.toFixed(2)}`
      : "";
  return (
    `  ${j.score.toFixed(2)}  ${(j.company + " — " + j.role).slice(0, 62).padEnd(63)}` +
    ` ${j.remoteKind.padEnd(13)} ${sal.padEnd(8)} reply ${j.replyLikelihood.toFixed(2)}` +
    ` skill ${j.skillMatch.toFixed(2)}${gm} [${j.seenIn.join("/")}]${flags}\n        ${j.url}`
  );
}

async function main() {
  const json = process.argv.includes("--json");
  const showB = process.argv.includes("--b");
  const noGraph = process.argv.includes("--no-graph");
  const cfg = await loadJobSearchConfig();

  const graphOn = !noGraph && cfg.useGraphMatch !== false;
  let extraTerms: string[] = [];
  let graphMatch: ((jd: string) => Promise<import("@/lib/jobs/types").GraphMatch | null>) | undefined;
  if (graphOn) {
    try {
      const userId = await getOwnerUserId();
      extraTerms = await deriveGraphSearchTerms(userId);
      graphMatch = makeGraphMatcher(userId);
    } catch (e) {
      console.error(
        `graph layer unavailable (${e instanceof Error ? e.message : e}) — manual only`,
      );
    }
  }

  const r = await runJobSearch(cfg, { extraTerms, graphMatch });

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
    `fetched ${r.fetched} → ${r.afterDedupe} after dedupe · USD/INR ${r.usdInr.toFixed(1)}`,
  );
  console.log(
    r.graphTerms.length || r.graphMatched
      ? `graph: +${r.graphTerms.length} query term(s) [${r.graphTerms.join(", ")}], scored ${r.graphMatched} job(s)\n`
      : `graph: off\n`,
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
