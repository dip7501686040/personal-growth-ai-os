/**
 * The deterministic generators behind /apply-morning and the /applications page.
 *
 * Everything that writes a file into a per-job application folder goes through
 * `persist()` here: it updates the local `applications/` cache AND the R2 bucket
 * (the source of truth) in one call. The CLI (`scripts/apply-prep.ts`) and the
 * `/applications` page's server actions both call these functions.
 *
 * Server-only — imports `node:fs` and shells out to headless Chrome for the PDF.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  JobSearchConfig,
  JobSearchResult,
  ScoredJob,
} from "@/lib/jobs/types";
import { getProofForJd, type JdProof } from "@/modules/knowledge/jd-proof";
import { loadMaster, suggestArchetype } from "@/modules/resume/master";
import { buildResumeModel, htmlToPdf, toHtml, toMarkdown } from "@/modules/resume/render";
import {
  deletePrefix,
  getText,
  isR2Configured,
  keyFor,
  listFolders,
  listKeys,
  putObject,
} from "./store";
import { visualProofUrl } from "./visual-proof";

const LOCAL_ROOT = join(process.cwd(), "applications");
const EMPTY_PROOF: JdProof = {
  skills: [],
  features: [],
  relatedContent: [],
  relatedLearning: [],
};

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

export function folderName(job: Pick<ScoredJob, "company" | "role">): string {
  return `${slug(job.company)}__${slug(job.role)}`;
}

export function jdTextOf(j: Pick<ScoredJob, "role" | "company" | "location" | "salaryText" | "descriptionSnippet" | "url">): string {
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

function localPath(date: string, folder: string, file = ""): string {
  return join(LOCAL_ROOT, date, folder, file);
}

/** Write one folder file to the local cache and (when configured) to R2. */
export async function persist(
  date: string,
  folder: string,
  file: string,
  body: string | Buffer,
): Promise<void> {
  const abs = localPath(date, folder, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  if (isR2Configured()) {
    await putObject(
      keyFor(date, folder, file),
      typeof body === "string" ? Buffer.from(body, "utf8") : body,
    );
  }
}

/** Write a file only if it doesn't already exist (or is blank) — for prose stubs. */
async function persistIfAbsent(
  date: string,
  folder: string,
  file: string,
  body: string,
): Promise<boolean> {
  const existing = await readFolderFile(date, folder, file);
  if (existing != null && existing.trim()) return false;
  await persist(date, folder, file, body);
  return true;
}

/** Push an already-written local file (e.g. the Chrome-rendered PDF) to R2. */
async function persistExistingLocal(
  date: string,
  folder: string,
  file: string,
): Promise<void> {
  if (isR2Configured()) {
    await putObject(keyFor(date, folder, file), readFileSync(localPath(date, folder, file)));
  }
}

export async function readFolderFile(
  date: string,
  folder: string,
  file: string,
): Promise<string | null> {
  if (isR2Configured()) {
    const t = await getText(keyFor(date, folder, file));
    if (t != null) return t;
  }
  try {
    return readFileSync(localPath(date, folder, file), "utf8");
  } catch {
    return null;
  }
}

async function readFolderJson<T>(
  date: string,
  folder: string,
  file: string,
): Promise<T | null> {
  const t = await readFolderFile(date, folder, file);
  return t == null ? null : (JSON.parse(t) as T);
}

// ── résumé + doc builders ────────────────────────────────────────────────────

async function resumeModelFor(jdText: string, archetype: string, proof: JdProof) {
  const master = await loadMaster();
  return buildResumeModel(master, archetype as Parameters<typeof buildResumeModel>[1], {
    skillNames: proof.skills.map((s) => s.name),
    projectNames: [
      ...proof.features.map((f) => f.projectName),
      ...proof.skills.flatMap((s) => s.proof.map((p) => p.projectName)),
    ],
  });
}

async function writeResumeFiles(
  date: string,
  folder: string,
  jdText: string,
  archetype: string,
  proof: JdProof,
): Promise<boolean> {
  const model = await resumeModelFor(jdText, archetype, proof);
  await persist(date, folder, "resume.md", toMarkdown(model));
  await persist(date, folder, "resume.html", toHtml(model));
  const pdfOk = htmlToPdf(
    resolve(localPath(date, folder, "resume.html")),
    resolve(localPath(date, folder, "resume.pdf")),
  );
  if (pdfOk) await persistExistingLocal(date, folder, "resume.pdf");
  return pdfOk;
}

export async function proofBundleMd(
  userId: string,
  j: ScoredJob,
  proof: JdProof,
): Promise<string> {
  const L: string[] = [`# Proof of work — ${j.company} / ${j.role}`, ``];
  const withProof = proof.skills.filter((s) => s.proof.length > 0);
  if (withProof.length) {
    L.push(`## Matched skills → shipped work`, ``);
    for (const s of withProof) {
      L.push(`### ${s.name}  _(${s.level})_`);
      for (const p of s.proof.slice(0, 3)) {
        const link = (await visualProofUrl(userId, p.featureId)) ?? p.repoUrl;
        L.push(
          `- **${p.featureTitle}** (${p.projectName}) — ${link ?? "no link"}`,
        );
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
      const link = (await visualProofUrl(userId, f.featureId)) ?? f.repoUrl;
      L.push(`- **${f.title}** (${f.projectName}) — ${link ?? "no link"}`);
    }
    L.push(``);
  }
  if (proof.relatedContent.length) {
    L.push(`## Related published content`);
    for (const c of proof.relatedContent) {
      const url = c.publishedUrls ? Object.values(c.publishedUrls)[0] : null;
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

export function searchProvenanceMd(
  j: ScoredJob,
  cfg: JobSearchConfig,
  result: JobSearchResult,
): string {
  const hay = `${j.role} ${j.descriptionSnippet ?? ""}`.toLowerCase();
  const manualSkills = cfg.skills.filter((s) => hay.includes(s.toLowerCase()));
  const titleHit = cfg.titles.find((t) => j.role.toLowerCase().includes(t.toLowerCase()));
  const L: (string | undefined)[] = [
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
  return L.filter((x): x is string => x !== undefined).join("\n");
}

// ── prose stubs (Claude fills these; scaffold only lays down the structure) ──

export function whyFitStub(): string {
  return (
    `<!-- ~150 words — the "why are you a fit?" box. Lead with the 2–3 strongest ` +
    `proof points from proof-bundle.md. First person, concrete, no fabrication. -->\n`
  );
}

/**
 * The one file per audience, carrying every channel. `pitch-recruiter.md` is the
 * gatekeeper (recruiter *or* hiring manager); `pitch-referral.md` is a current
 * employee. Parsed by `pnpm outreach` (Subject: line, ## Message section).
 */
export function pitchStub(kind: "recruiter" | "referral", j: ScoredJob): string {
  const who =
    kind === "recruiter" ? "recruiter / hiring manager" : "a current employee (referral)";
  const messageHint =
    kind === "recruiter"
      ? `~80 words. Open with the single strongest proof link from proof-bundle.md. First person, concrete, no fluff. Works as a cold email or a LinkedIn DM / InMail.`
      : `~70 words, warmer and shorter than the recruiter pitch. One proof link. You're asking someone inside ${j.company} to refer you.`;
  return [
    `# Pitch — ${who} · ${j.company}`,
    ``,
    `Subject: `,
    ``,
    `## Message`,
    `<!-- ${messageHint} -->`,
    ``,
    `## LinkedIn connection note (≤300 chars)`,
    `<!-- A cold open that fits the 300-char connect-request limit: who you are, the role at ${j.company}, one hook. -->`,
    ``,
  ].join("\n");
}

export function outreachMd(j: ScoredJob): string {
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

// ── the folder job.json shape ───────────────────────────────────────────────

export type FolderJob = ScoredJob & {
  bundleDir: string;
  jdText: string;
  /** set once a résumé is generated for this job — absent right after scaffolding. */
  archetype?: string;
  preparedAt: string;
  id?: string;
  /** rendered at scaffold time, when `cfg`/`result` (this search run's context)
   *  are still available; `scaffoldJobFolder` also writes it straight to
   *  search-provenance.md, kept here too as a fallback for `ensureSearchProvenance`
   *  on any folder scaffolded before that file was written up front. */
  searchProvenanceMd?: string;
};

// ── public operations ──────────────────────────────────────────────────────

export interface ScaffoldInput {
  userId: string;
  job: ScoredJob;
  cfg: JobSearchConfig;
  result: JobSearchResult;
  date?: string;
}

export interface ScaffoldResult {
  date: string;
  folder: string;
  files: string[];
}

/**
 * Scaffold one job — used by `pnpm apply-prep`. Writes `job.json` and
 * search-provenance.md (cheap — pure string formatting off `cfg`/`result`,
 * this run's context, never available again after picking). The résumé,
 * proof-bundle, and prose are generated later, when actually needed
 * (proof-bundle by /apply-content-queue, everything else by /apply-drive) —
 * so picking a job costs nothing beyond recording it and its provenance.
 */
export async function scaffoldJobFolder(input: ScaffoldInput): Promise<ScaffoldResult> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const folder = folderName(input.job);
  const jdText = jdTextOf(input.job);
  const provenance = searchProvenanceMd(input.job, input.cfg, input.result);

  const folderJob: FolderJob = {
    ...input.job,
    bundleDir: `applications/${date}/${folder}`,
    jdText,
    preparedAt: new Date().toISOString(),
    searchProvenanceMd: provenance,
  };
  await persist(date, folder, "job.json", JSON.stringify(folderJob, null, 2));
  await persist(date, folder, "search-provenance.md", provenance);

  return { date, folder, files: ["job.json", "search-provenance.md"] };
}

/** Renders resume.md/.html/.pdf from the folder's job.json — first-time
 *  generation (job.json has no `archetype` yet) or a re-render that picks up
 *  master.json edits (archetype already chosen, kept stable). */
export async function regenerateResume(
  userId: string,
  date: string,
  folder: string,
): Promise<{ pdfOk: boolean }> {
  const job = await readFolderJson<FolderJob>(date, folder, "job.json");
  if (!job) throw new Error(`no job.json for ${date}/${folder}`);
  const jdText = job.jdText ?? jdTextOf(job);
  let proof: JdProof;
  try {
    proof = await getProofForJd(userId, jdText);
  } catch {
    proof = EMPTY_PROOF;
  }
  const archetype = job.archetype ?? suggestArchetype(await loadMaster(), jdText);
  const pdfOk = await writeResumeFiles(date, folder, jdText, archetype, proof);
  if (!job.archetype) {
    await persist(date, folder, "job.json", JSON.stringify({ ...job, archetype }, null, 2));
  }
  return { pdfOk };
}

/** Re-print resume.pdf from resume.html (which may have been hand-edited on R2). */
export async function regeneratePdf(
  date: string,
  folder: string,
): Promise<{ pdfOk: boolean }> {
  const html = await readFolderFile(date, folder, "resume.html");
  if (html == null) throw new Error(`no resume.html for ${date}/${folder}`);
  await persist(date, folder, "resume.html", html); // mirror R2 → local before Chrome
  const pdfOk = htmlToPdf(
    resolve(localPath(date, folder, "resume.html")),
    resolve(localPath(date, folder, "resume.pdf")),
  );
  if (pdfOk) await persistExistingLocal(date, folder, "resume.pdf");
  return { pdfOk };
}

/** Re-run get_proof_for_jd from the folder's job.json and rewrite proof-bundle.md. */
/** Also doubles as first-time creation — /apply-content-queue calls this to
 *  generate a job's proof-bundle.md the first time, since scaffolding no
 *  longer writes one up front. */
export async function regenerateProofBundle(
  userId: string,
  date: string,
  folder: string,
): Promise<{ skills: number; features: number }> {
  const job = await readFolderJson<FolderJob>(date, folder, "job.json");
  if (!job) throw new Error(`no job.json for ${date}/${folder}`);
  const jdText = job.jdText ?? jdTextOf(job);
  const proof = await getProofForJd(userId, jdText);
  await persist(date, folder, "proof-bundle.md", await proofBundleMd(userId, job, proof));
  return { skills: proof.skills.length, features: proof.features.length };
}

// ── on-demand files for /apply-drive — each is a no-op if already written,
// so driving mid-way through a folder (or re-running) never clobbers prose ──

export async function ensureWhyFitStub(date: string, folder: string): Promise<boolean> {
  return persistIfAbsent(date, folder, "why-fit.md", whyFitStub());
}

export async function ensurePitchStub(
  date: string,
  folder: string,
  kind: "recruiter" | "referral",
): Promise<boolean> {
  const job = await readFolderJson<FolderJob>(date, folder, "job.json");
  if (!job) throw new Error(`no job.json for ${date}/${folder}`);
  return persistIfAbsent(date, folder, `pitch-${kind}.md`, pitchStub(kind, job));
}

export async function ensureOutreachTargets(date: string, folder: string): Promise<boolean> {
  const job = await readFolderJson<FolderJob>(date, folder, "job.json");
  if (!job) throw new Error(`no job.json for ${date}/${folder}`);
  return persistIfAbsent(date, folder, "outreach-targets.md", outreachMd(job));
}

/** Fallback for a folder scaffolded before search-provenance.md was written
 *  up front — materializes the run-context provenance stashed in job.json
 *  (cfg/result aren't available any later than scaffold time). No-op for any
 *  folder that already has the file, which is every folder scaffolded now. */
export async function ensureSearchProvenance(date: string, folder: string): Promise<boolean> {
  const job = await readFolderJson<FolderJob>(date, folder, "job.json");
  if (!job) throw new Error(`no job.json for ${date}/${folder}`);
  const md = job.searchProvenanceMd ?? "_(not captured for this job)_\n";
  return persistIfAbsent(date, folder, "search-provenance.md", md);
}

/** Write / overwrite one file in a folder (the /applications inline editor, prose). */
export async function writeFolderFile(
  date: string,
  folder: string,
  file: string,
  content: string | Buffer,
): Promise<void> {
  await persist(date, folder, file, content);
}

export async function deleteJobFolder(
  date: string,
  folder: string,
): Promise<{ removed: number }> {
  let removed = 0;
  if (isR2Configured()) removed = await deletePrefix(`${date}/${folder}/`);
  rmSync(localPath(date, folder), { recursive: true, force: true });
  return { removed };
}

// ── listings (R2-first, local fallback) ────────────────────────────────────

export async function listDates(): Promise<string[]> {
  if (isR2Configured()) {
    return (await listFolders("")).map((p) => p.replace(/\/$/, ""));
  }
  try {
    return readdirSync(LOCAL_ROOT)
      .filter((d) => statSync(join(LOCAL_ROOT, d)).isDirectory())
      .sort();
  } catch {
    return [];
  }
}

export async function listJobFolders(date: string): Promise<string[]> {
  if (isR2Configured()) {
    return (await listFolders(`${date}/`)).map((p) =>
      p.replace(`${date}/`, "").replace(/\/$/, ""),
    );
  }
  try {
    return readdirSync(join(LOCAL_ROOT, date))
      .filter((d) => statSync(join(LOCAL_ROOT, date, d)).isDirectory())
      .sort();
  } catch {
    return [];
  }
}

export async function listFolderFiles(
  date: string,
  folder: string,
): Promise<string[]> {
  if (isR2Configured()) {
    return (await listKeys(`${date}/${folder}/`)).map((k) => k.split("/").pop() as string);
  }
  try {
    return readdirSync(join(LOCAL_ROOT, date, folder)).sort();
  } catch {
    return [];
  }
}
