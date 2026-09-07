/**
 * Scaffold a per-job application folder — the deterministic half of
 * /apply-morning. Claude Code then writes the prose files (why-fit,
 * cover-letter, pitch-recruiter, pitch-referral).
 *
 *   pnpm apply-prep --jobs <jobs.json> --pick 0,3,7 [--date YYYY-MM-DD] [--root applications]
 *
 * `jobs.json` is the output of `pnpm jobs --json`. Per pick it writes
 * <root>/<date>/<company>__<role>/ with: job.json, proof-bundle.md,
 * outreach-targets.md, resume.md/.html/.docx.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getOwnerUserId } from "@/lib/owner";
import type { JobSearchResult, ScoredJob } from "@/lib/jobs/types";
import { getProofForJd, type JdProof } from "@/modules/knowledge/jd-proof";
import { loadMaster, suggestArchetype } from "@/modules/resume/master";
import {
  buildResumeModel,
  toDocxBuffer,
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
    writeFileSync(join(dir, "resume.html"), toHtml(model));
    writeFileSync(join(dir, "resume.docx"), await toDocxBuffer(model));
    writeFileSync(join(dir, "proof-bundle.md"), proofBundleMd(j, proof));
    writeFileSync(join(dir, "outreach-targets.md"), outreachMd(j));
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
        `      archetype=${archetype} · proof: ${proof.skills.length} skills / ${proof.features.length} features\n` +
        `      write next: why-fit.md, cover-letter.md (if the JD asks), pitch-recruiter.md, pitch-referral.md`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
