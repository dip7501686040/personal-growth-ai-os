/**
 * Outreach + email-apply drafts, straight into your Gmail Drafts.
 *
 *   pnpm outreach email <folder> [--kind apply|cold] [--to addr] [--subject "..."] [--date YYYY-MM-DD]
 *   pnpm outreach send  <draftId>
 *   pnpm outreach drafts
 *
 * `email` builds the message from the folder's cover-letter.md (apply) or the
 * Message section of pitch-recruiter.md (cold), attaches resume.pdf, and
 * creates a DRAFT only. Review it in Gmail, then `pnpm outreach send <id>`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadProfile } from "@/lib/apply/profile";
import {
  createDraft,
  listDrafts,
  sendDraft,
  tokenExists,
} from "@/lib/outreach/gmail";
import { writeFolderFile } from "@/modules/applications/generate";
import { pullRemote } from "./apply-sync";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function parseFolder(a: string, dateFlag?: string): { date: string; folder: string } {
  const s = a.replace(/^applications[/\\]/, "").replace(/\/+$/, "");
  const parts = s.split("/");
  if (parts.length === 2) return { date: parts[0], folder: parts[1] };
  return { date: dateFlag ?? new Date().toISOString().slice(0, 10), folder: s };
}

function sectionOf(md: string, heading: string): string {
  const re = new RegExp(`^##\\s+${heading}\\b.*$`, "im");
  const m = md.match(re);
  if (!m || m.index == null) return "";
  const rest = md.slice(m.index + m[0].length);
  const end = rest.search(/^##\s+/m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function subjectOf(md: string): string {
  return md.match(/^subject:\s*(.+)$/im)?.[1]?.trim() ?? "";
}

function signature(): string {
  const p = loadProfile();
  return ["—", p.identity.fullName, p.links.linkedin, p.links.github]
    .filter(Boolean)
    .join("\n");
}

async function emailCmd() {
  const folderArg = process.argv[3];
  if (!folderArg || folderArg.startsWith("--")) {
    throw new Error("usage: pnpm outreach email <folder> [--kind apply|cold] [--to addr]");
  }
  if (!tokenExists()) throw new Error("Not authorized — run `pnpm gmail-auth` once.");

  const { date, folder } = parseFolder(folderArg, arg("--date"));
  await pullRemote(`${date}/${folder}`).catch(() => {});
  const dir = join("applications", date, folder);
  if (!existsSync(join(dir, "job.json"))) {
    throw new Error(`no local/R2 folder for ${date}/${folder}`);
  }
  const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")) as {
    company: string;
    role: string;
    contactEmail?: string | null;
  };

  const kind = (arg("--kind") ?? (job.contactEmail ? "apply" : "cold")) as
    | "apply"
    | "cold";
  const to = arg("--to") ?? (kind === "apply" ? job.contactEmail ?? "" : "");
  if (!to) {
    throw new Error(
      kind === "apply"
        ? "no contactEmail in job.json — pass --to <addr>"
        : "cold email needs --to <addr> (find one from outreach-targets.md)",
    );
  }

  const pitch = read(join(dir, "pitch-recruiter.md"));
  const cover = read(join(dir, "cover-letter.md"));
  const whyFit = read(join(dir, "why-fit.md"));

  let body =
    kind === "apply"
      ? cover || whyFit
      : sectionOf(pitch, "Message") || pitch.replace(/^subject:.*$/im, "").trim() || whyFit;
  if (!body) throw new Error(`no prose to send — write ${kind === "apply" ? "cover-letter.md / why-fit.md" : "pitch-recruiter.md"} first`);
  if (!/dipankar saha/i.test(body.slice(-160))) body = `${body}\n\n${signature()}`;

  const subject =
    arg("--subject") ||
    subjectOf(pitch) ||
    (kind === "apply"
      ? `Application — ${job.role}`
      : `${job.role} at ${job.company} — quick note`);

  const attachments = existsSync(join(dir, "resume.pdf"))
    ? [{ path: join(process.cwd(), dir, "resume.pdf"), contentType: "application/pdf" }]
    : [];

  const { id } = await createDraft({ to, subject, body, attachments });

  const logLine =
    `\n## ${new Date().toISOString()} · draft · ${kind} · to ${to}\n` +
    `subject: ${subject}\n` +
    `draft id: ${id}  → review in Gmail, then \`pnpm outreach send ${id}\`\n`;
  await writeFolderFile(date, folder, "outreach-log.md", read(join(dir, "outreach-log.md")) + logLine);

  console.log(
    `draft created — ${id}\n` +
      `  to: ${to}\n  subject: ${subject}\n  attach: ${attachments.length ? "resume.pdf" : "(none)"}\n` +
      `  review: https://mail.google.com/mail/u/0/#drafts\n` +
      `  send:   pnpm outreach send ${id}`,
  );
}

async function sendCmd() {
  const id = process.argv[3];
  if (!id) throw new Error("usage: pnpm outreach send <draftId>");
  if (!tokenExists()) throw new Error("Not authorized — run `pnpm gmail-auth` once.");
  const r = await sendDraft(id);
  console.log(`sent — message ${r.id} (thread ${r.threadId})`);
}

async function draftsCmd() {
  if (!tokenExists()) throw new Error("Not authorized — run `pnpm gmail-auth` once.");
  const rows = await listDrafts();
  if (!rows.length) {
    console.log("(no drafts)");
    return;
  }
  for (const d of rows) {
    console.log(`${d.id}  →  ${d.to || "(no to)"}  ·  ${d.subject || "(no subject)"}`);
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "email") return emailCmd();
  if (cmd === "send") return sendCmd();
  if (cmd === "drafts") return draftsCmd();
  throw new Error("commands: email | send | drafts");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
