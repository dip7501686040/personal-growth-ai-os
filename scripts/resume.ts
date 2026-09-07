/**
 * Render a tailored, ATS-clean résumé from resume/master.json.
 *
 *   pnpm resume <backend|platform|ai-llm|auto> [--jd <file>] [--out <dir>]
 *
 * Always writes resume.md + resume.html + resume.docx. `--jd` reorders skills,
 * bullets and projects to lead with what the job description matched (via the
 * same deterministic `get_proof_for_jd` engine). PDF: open resume.html and
 * Print → Save as PDF, or run pandoc if you have it.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getOwnerUserId } from "@/lib/owner";
import { getProofForJd } from "@/modules/knowledge/jd-proof";
import {
  ARCHETYPES,
  loadMaster,
  suggestArchetype,
  type ArchetypeKey,
} from "@/modules/resume/master";
import {
  buildResumeModel,
  toDocxBuffer,
  toHtml,
  toMarkdown,
  type JdTailor,
} from "@/modules/resume/render";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function atsLint(md: string): string[] {
  const problems: string[] = [];
  if (/\n\s*\|.*\|/.test(md)) problems.push("markdown table syntax found");
  if (/!\[/.test(md)) problems.push("image found");
  if ((md.match(/^# /gm) ?? []).length !== 1)
    problems.push("expected exactly one H1");
  for (const h of ["## Summary", "## Skills", "## Experience", "## Projects", "## Education"])
    if (!md.includes(h)) problems.push(`missing heading ${h}`);
  return problems;
}

async function main() {
  const first = process.argv[2];
  if (!first) {
    throw new Error("usage: pnpm resume <backend|platform|ai-llm|auto> [--jd f] [--out d]");
  }
  const jdPath = arg("--jd");
  const outDir = arg("--out") ?? join("resume", "out");
  const master = loadMaster();

  let jdText = "";
  let jd: JdTailor | undefined;
  if (jdPath) {
    jdText = readFileSync(jdPath, "utf8");
    const userId = await getOwnerUserId();
    const proof = await getProofForJd(userId, jdText);
    jd = {
      skillNames: proof.skills.map((s) => s.name),
      projectNames: [
        ...proof.features.map((f) => f.projectName),
        ...proof.skills.flatMap((s) => s.proof.map((p) => p.projectName)),
      ],
    };
    console.log(
      `JD proof: ${proof.skills.length} skills, ${proof.features.length} features, ` +
        `${proof.relatedContent.length} related content`,
    );
  }

  const archetype: ArchetypeKey =
    first === "auto"
      ? jdText
        ? suggestArchetype(master, jdText)
        : "backend"
      : (ARCHETYPES as readonly string[]).includes(first)
        ? (first as ArchetypeKey)
        : (() => {
            throw new Error(`unknown archetype "${first}"`);
          })();

  const model = buildResumeModel(master, archetype, jd);
  const md = toMarkdown(model);
  const html = toHtml(model);
  const docx = await toDocxBuffer(model);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "resume.md"), md);
  writeFileSync(join(outDir, "resume.html"), html);
  writeFileSync(join(outDir, "resume.docx"), docx);

  let pdf = "open resume.html → Print → Save as PDF";
  try {
    execSync("pandoc --version", { stdio: "ignore" });
    execSync(`pandoc "${join(outDir, "resume.md")}" -o "${join(outDir, "resume.pdf")}"`, {
      stdio: "ignore",
    });
    pdf = "resume.pdf (pandoc)";
  } catch {
    /* pandoc / pdf engine not available — html fallback stands */
  }

  const problems = atsLint(md);
  console.log(
    [
      `archetype: ${archetype} (${model.archetypeLabel})`,
      jd ? "tailored to the JD" : "generic",
      `→ ${outDir}/resume.{md,html,docx}`,
      `pdf: ${pdf}`,
      `skills groups: ${model.skills.length} · experience: ${model.experience.length} · projects: ${model.projects.length}`,
      problems.length ? `ATS LINT FAILED: ${problems.join("; ")}` : "ATS lint: clean",
    ].join("\n"),
  );
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
