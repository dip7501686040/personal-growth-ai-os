/**
 * Scaffold a per-job application folder — the deterministic half of
 * /apply-morning. Claude Code then writes the prose files (why-fit,
 * cover-letter, pitch-recruiter, pitch-referral).
 *
 *   pnpm apply-prep --jobs <jobs.json> --pick 0,3,7 [--date YYYY-MM-DD] [--root applications]
 *
 * `jobs.json` is the output of `pnpm jobs --json`. Per pick it writes
 * <root>/<date>/<company>__<role>/ with: job.json, proof-bundle.md,
 * outreach-targets.md, search-provenance.md, resume.md/.html/.pdf.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getOwnerUserId } from "@/lib/owner";
import { loadJobSearchConfig } from "@/lib/jobs/search";
import type { JobSearchConfig, JobSearchResult, ScoredJob } from "@/lib/jobs/types";
import { getProofForJd, type JdProof } from "@/modules/knowledge/jd-proof";
import { loadMaster, suggestArchetype } from "@/modules/resume/master";
import {
  buildResumeModel,
  htmlToPdf,
  toHtml,
  toMarkdown,
} from "@/modules/resume/render";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

function jdTextOf(j: ScoredJob): string {
  return [
    `${j.role} at ${j.company}`,
    j.location ? `Location: ${j.location}` : "",
    j.salaryText ? `Salary: ${j.salaryText}` : "",
    j.descriptionSnippet ?? "",
    j.url,
  ]
    .filter(Boolean)
    .join("\n");
}

function proofBundleMd(j: ScoredJob, proof: JdProof): string {
  const L: string[] = [`# Proof of work — ${j.company} / ${j.role}`, ``];
  const withProof = proof.skills.filter((s) => s.proof.length > 0);
  if (withProof.length) {
    L.push(`## Matched skills → shipped work`, ``);
    for (const s of withProof) {
      L.push(`### ${s.name}  _(${s.level})_`);
      const top = s.proof.slice(0, 3);
      for (const p of top) {
        const links = [
          p.demoVideoUrl ? `demo ${p.demoVideoUrl}` : "",
          p.repoUrl ? `repo ${p.repoUrl}` : "",
          ...p.codeLinks.slice(0, 3).map((c) => `${c.label} ${c.url}`),
        ].filter(Boolean);
        L.push(`- **${p.featureTitle}** (${p.projectName}) — ${links.join("  ·  ") || "no link"}`);
      }
      if (s.proof.length > 3) L.push(`- _…+${s.proof.length - 3} more features_`);
      L.push(``);
    }
  }
  const noProof = proof.skills.filter((s) => s.proof.length === 0).map((s) => s.name);
  if (noProof.length) {
    L.push(`## Matched, no shipped-feature proof yet`);
    L.push(noProof.join(", "), ``);
  }
  if (proof.features.length) {
    L.push(`## Directly-matched project features`, ``);
    for (const f of proof.features) {
      const links = [
        f.demoVideoUrl ? `demo ${f.demoVideoUrl}` : "",
        f.repoUrl ? `repo ${f.repoUrl}` : "",
        ...f.codeLinks.map((c) => `${c.label} ${c.url}`),
      ].filter(Boolean);
      L.push(`- **${f.title}** (${f.projectName}) — ${links.join("  ·  ") || "no link"}`);
    }
    L.push(``);
  }
  if (proof.relatedContent.length) {
    L.push(`## Related published content`);
    for (const c of proof.relatedContent) {
      const url = c.publishedUrls
        ? Object.values(c.publishedUrls)[0]
        : null;
      L.push(`- ${c.title}${url ? ` — ${url}` : ` _(no public URL yet)_`}`);
    }
    L.push(``);
  }
  if (proof.relatedLearning.length) {
    L.push(`## Related learning`);
    for (const l of proof.relatedLearning) L.push(`- ${l.topic} (${l.category})`);
    L.push(``);
  }
  return L.join("\n");
}

function searchProvenanceMd(
  j: ScoredJob,
  cfg: JobSearchConfig,
  result: JobSearchResult,
): string {
  const hay = `${j.role} ${j.descriptionSnippet ?? ""}`.toLowerCase();
  const manualSkills = cfg.skills.filter((s) => hay.includes(s.toLowerCase()));
  const titleHit = cfg.titles.find((t) => j.role.toLowerCase().includes(t.toLowerCase()));
  const L: string[] = [
    `# How this job surfaced — ${j.company} / ${j.role}`,
    ``,
    `Search score **${j.score.toFixed(2)}** · Group ${j.group} · reply-likelihood ${j.replyLikelihood.toFixed(2)}` +
      (j.employmentType ? ` · ${j.employmentType}` : ""),
    ``,
    `## Manual layer — resume/job-search.json`,
    `- Titles searched: ${cfg.titles.join(", ")}`,
    `- This role matches the title term: ${titleHit ?? "_(surfaced via description / a graph term)_"}`,
    `- Skill keywords present in the JD: ${manualSkills.join(", ") || "_none_"}  (${manualSkills.length}/${cfg.skills.length} → substring skillMatch ${j.substringSkillMatch.toFixed(2)})`,
    `- Location: ${j.location ?? "—"} · remoteKind ${j.remoteKind}`,
    `- Filters: minLpa ${cfg.minLpa} · remoteOnly ${cfg.remoteOnly} · preferFunded ${cfg.preferFunded ?? false} · adzuna ${cfg.adzunaCountries.slice(0, cfg.adzunaMaxCountries ?? 6).join("/")}`,
    `- Funding signal: ${j.funding.stage ?? "_not detected_"}`,
    ``,
    `## Knowledge-graph layer`,
  ];
  if (j.graphMatch == null) {
    L.push(`- Not graph-scored (outside the top ${cfg.graphMatchLimit ?? 50}, or graph off).`);
  } else {
    L.push(
      `- Extra query terms from the graph this run: ${result.graphTerms.join(", ") || "_none_"}`,
      `- Skills the graph matched in this JD: ${
        j.graphSkills.map((s) => `${s.name} (${s.score})`).join(", ") || "_none_"
      }`,
      `- Project features matched: ${
        j.graphFeatures.map((f) => `${f.title} (${f.score})`).join(", ") || "_none_"
      }`,
      `- graphMatch ${j.graphMatch.toFixed(2)} vs substring skillMatch ${j.substringSkillMatch.toFixed(2)} → used **${j.skillMatch.toFixed(2)}**`,
    );
  }
  L.push(
    ``,
    `## Sources`,
    `- This posting was returned by: ${j.seenIn.join(", ")}`,
    `- All sources this run: ${result.sourcesUsed.join(", ")}`,
    result.sourcesSkipped.length
      ? `- Skipped: ${result.sourcesSkipped.map((s) => `${s.source} (${s.reason})`).join(", ")}`
      : ``,
    ``,
    `## Score math`,
    `\`replyLikelihood ${j.replyLikelihood.toFixed(2)} × (0.4 + 0.6 × skillMatch ${j.skillMatch.toFixed(2)}) = ${j.score.toFixed(2)}\``,
    j.flags.length ? `Flags: ${j.flags.join(", ")}` : `No flags.`,
    ``,
  );
  return L.filter((x) => x !== undefined).join("\n");
}

function outreachMd(j: ScoredJob): string {
  const L: string[] = [`# Outreach — ${j.company} / ${j.role}`, ``];
  if (j.contactName || j.contactEmail) {
    L.push(`Contact: ${[j.contactName, j.contactEmail].filter(Boolean).join(" · ")}`);
  } else {
    L.push(`Contact: not in the posting — find one (~1 min):`);
    L.push(`- LinkedIn: "${j.company} recruiter"`);
    L.push(`- LinkedIn: "${j.company} engineering manager"`);
    L.push(`- LinkedIn: "${j.company} talent"`);
  }
  L.push(``, `Recruiter DM → pitch-recruiter.md`);
  L.push(`Referral ask → pitch-referral.md`);
  if (j.applyUrl) L.push(``, `Apply: ${j.applyUrl}`);
  return L.join("\n") + "\n";
}

async function main() {
  const jobsPath = arg("--jobs");
  const pick = arg("--pick");
  if (!jobsPath || !pick) {
    throw new Error("usage: pnpm apply-prep --jobs <jobs.json> --pick 0,3,7 [--date YYYY-MM-DD]");
  }
  const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
  const root = arg("--root") ?? "applications";
  const result = JSON.parse(readFileSync(jobsPath, "utf8")) as JobSearchResult;
  const all = [...result.groupA, ...result.groupB];
  const idxs = pick.split(",").map((s) => Number(s.trim()));

  const userId = await getOwnerUserId();
  const master = loadMaster();
  const cfg = loadJobSearchConfig();

  for (const i of idxs) {
    const j = all[i];
    if (!j) {
      console.log(`  index ${i}: out of range (have ${all.length})`);
      continue;
    }
    const dir = join(root, date, `${slug(j.company)}__${slug(j.role)}`);
    mkdirSync(dir, { recursive: true });

    const jdText = jdTextOf(j);
    let proof: JdProof;
    try {
      proof = await getProofForJd(userId, jdText);
    } catch (e) {
      console.log(`  index ${i}: proof failed — ${e instanceof Error ? e.message : e}`);
      proof = { skills: [], features: [], relatedContent: [], relatedLearning: [] };
    }

    const archetype = suggestArchetype(master, jdText);
    const model = buildResumeModel(master, archetype, {
      skillNames: proof.skills.map((s) => s.name),
      projectNames: [
        ...proof.features.map((f) => f.projectName),
        ...proof.skills.flatMap((s) => s.proof.map((p) => p.projectName)),
      ],
    });

    writeFileSync(join(dir, "resume.md"), toMarkdown(model));
    const htmlPath = join(dir, "resume.html");
    writeFileSync(htmlPath, toHtml(model));
    const pdfOk = htmlToPdf(resolve(htmlPath), resolve(join(dir, "resume.pdf")));
    writeFileSync(join(dir, "proof-bundle.md"), proofBundleMd(j, proof));
    writeFileSync(join(dir, "outreach-targets.md"), outreachMd(j));
    writeFileSync(join(dir, "search-provenance.md"), searchProvenanceMd(j, cfg, result));
    writeFileSync(
      join(dir, "job.json"),
      JSON.stringify(
        { ...j, bundleDir: dir, jdText, archetype, preparedAt: new Date().toISOString() },
        null,
        2,
      ),
    );

    console.log(
      `  [${i}] ${j.company} — ${j.role}\n` +
        `      ${dir}\n` +
        `      archetype=${archetype} · proof: ${proof.skills.length} skills / ${proof.features.length} features` +
        (pdfOk ? " · resume.pdf ✓" : " · resume.pdf ✗ (no Chrome — print resume.html by hand)") +
        `\n      write next: why-fit.md, cover-letter.md (if the JD asks), pitch-recruiter.md, pitch-referral.md`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
