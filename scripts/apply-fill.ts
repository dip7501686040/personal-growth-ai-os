/**
 * Assisted application form-fill — Tier 1 of the apply automation.
 *
 *   pnpm apply-fill <folder> [--url <applyUrl>] [--date YYYY-MM-DD] [--headless] [--no-wait]
 *
 * <folder> is "<company>__<role>" (today's date), "<date>/<company>__<role>",
 * or an applications/ path. --url overrides job.json's applyUrl (many HN-sourced
 * postings don't carry a direct ATS link). Opens the apply URL in a visible
 * browser, fills the
 * standard fields from resume/profile.json + the folder's why-fit.md /
 * cover-letter.md, uploads resume.pdf, then STOPS before Submit. You review,
 * submit yourself, press Enter — it screenshots the confirmation, writes
 * apply-result.md, and marks the ledger.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { getOwnerUserId } from "@/lib/owner";
import { loadProfile } from "@/lib/apply/profile";
import { friendlyResumeFilename, writeFolderFile } from "@/modules/applications/generate";
import {
  listOpenApplications,
  recordTouchpoint,
} from "@/modules/applications/service";
import { pullRemote } from "./apply-sync";
import { runFill, type FillReport } from "./form-fill";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function parseFolder(a: string, dateFlag?: string): { date: string; folder: string } {
  const s = a.replace(/^applications[/\\]/, "").replace(/\/+$/, "");
  const parts = s.split("/");
  if (parts.length === 2) return { date: parts[0], folder: parts[1] };
  return { date: dateFlag ?? new Date().toISOString().slice(0, 10), folder: s };
}

function reportText(r: FillReport): string {
  const L = [`ATS: ${r.ats}`];
  L.push(`\nFilled ✓ (${r.filled.length})`);
  for (const f of r.filled) L.push(`  ${f.label} → ${f.value.slice(0, 80)}`);
  L.push(`\nNeeds you 🔴 (${r.needsYou.length})`);
  for (const n of r.needsYou) L.push(`  ${n.label} — ${n.note}`);
  if (r.blank.length) {
    L.push(`\nNo stored answer ⚠ (${r.blank.length})`);
    for (const b of r.blank.slice(0, 25)) L.push(`  ${b}`);
  }
  return L.join("\n");
}

function resultMd(
  job: { company: string; role: string },
  r: FillReport,
  finalUrl: string,
  preShot: string,
  confirmShot: string,
): string {
  const L = [
    `# Applied — ${job.company} / ${job.role}`,
    ``,
    `- submitted: ${new Date().toISOString()}`,
    `- portal: ${finalUrl}`,
    `- ats: ${r.ats}`,
    `- resume: ${friendlyResumeFilename(job.company)}`,
    `- pre-submit screenshot: ${preShot}`,
    `- confirmation screenshot: ${confirmShot}`,
    ``,
    `## Auto-filled`,
    ...r.filled.map((f) => `- ${f.label}: ${f.value}`),
    ``,
    `## Needed manual input`,
    ...(r.needsYou.length ? r.needsYou.map((n) => `- ${n.label} — ${n.note}`) : ["- none"]),
    ``,
  ];
  return L.join("\n");
}

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg || folderArg.startsWith("--")) {
    throw new Error(
      "usage: pnpm apply-fill <folder> [--date YYYY-MM-DD] [--headless] [--no-wait]",
    );
  }
  const { date, folder } = parseFolder(folderArg, arg("--date"));

  await pullRemote(`${date}/${folder}`).catch(() => {});
  const dir = join("applications", date, folder);
  if (!existsSync(join(dir, "job.json"))) {
    throw new Error(`no local/R2 folder for ${date}/${folder}`);
  }
  const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")) as {
    company: string;
    role: string;
    applyUrl?: string | null;
    url?: string | null;
  };
  const urlOverride = arg("--url");
  const applyUrl = urlOverride || job.applyUrl || job.url || "";
  if (!applyUrl || (!urlOverride && /news\.ycombinator\.com/.test(applyUrl))) {
    throw new Error(
      `no usable applyUrl for ${folder} (got "${applyUrl || "none"}") — ` +
        `pass --url <applyUrl> or apply manually.`,
    );
  }
  // Prefer the friendly-named copy (what the ATS/recruiter file list shows)
  // — falls back to resume.pdf for a folder scaffolded before it existed.
  const friendlyResume = friendlyResumeFilename(job.company);
  const resumeFile = existsSync(join(dir, friendlyResume)) ? friendlyResume : "resume.pdf";
  const resumePath = join(process.cwd(), dir, resumeFile);
  if (!existsSync(resumePath)) {
    throw new Error("resume.pdf missing — regenerate the folder first.");
  }
  const coverLetterPath = existsSync(join(dir, "cover-letter.md"))
    ? join(process.cwd(), dir, "cover-letter.md")
    : undefined;

  const profile = await loadProfile();
  const browser = await chromium.launch({ headless: has("--headless") });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await ctx.newPage();

  console.log(`→ ${applyUrl}`);
  await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const report = await runFill(page, {
    profile,
    resumePath,
    coverLetterPath,
    whyFit: read(join(dir, "why-fit.md")),
    coverLetter: read(join(dir, "cover-letter.md")),
  });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const preShot = `apply-${ts}.png`;
  await page.screenshot({ path: join(dir, preShot), fullPage: true }).catch(() => {});
  if (existsSync(join(dir, preShot))) {
    await writeFolderFile(date, folder, preShot, readFileSync(join(dir, preShot)));
  }

  console.log(`\n${reportText(report)}\n`);

  if (has("--no-wait")) {
    await browser.close();
    process.exit(0);
  }

  process.stdout.write(
    "▶ Review the form, fix the flagged fields, and submit it yourself.\n" +
      "  Press Enter here after submitting (Ctrl-C to abort without recording): ",
  );
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));

  const finalUrl = page.url();
  const confirmShot = `apply-confirm-${ts}.png`;
  await page.screenshot({ path: join(dir, confirmShot), fullPage: true }).catch(() => {});
  if (existsSync(join(dir, confirmShot))) {
    await writeFolderFile(date, folder, confirmShot, readFileSync(join(dir, confirmShot)));
  }
  await writeFolderFile(
    date,
    folder,
    "apply-result.md",
    resultMd(job, report, finalUrl, preShot, confirmShot),
  );

  try {
    const userId = await getOwnerUserId();
    const open = await listOpenApplications(userId);
    const hit = open.find((a) => a.company === job.company && a.role === job.role);
    if (hit) {
      await recordTouchpoint(userId, {
        applicationId: hit.id,
        kind: "submitted",
        channel: "portal",
      });
      console.log("ledger → applied · apply-result.md written");
    } else {
      console.log("ledger: no matching row — run `pnpm apply record` first");
    }
  } catch (e) {
    console.log(`ledger update skipped: ${e instanceof Error ? e.message : e}`);
  }

  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
