import { execSync } from "node:child_process";
import { findChrome } from "@/lib/chrome";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ArchetypeKey, MasterResume } from "./master";

export interface JdTailor {
  /** lowercased skill names the JD matched (from get_proof_for_jd) */
  skillNames: string[];
  /** project names whose features the JD matched */
  projectNames: string[];
  /** the JD's own text — used to score/order projects and bullets by real
   *  content overlap, not just the knowledge-graph's synced-feature index
   *  (which only "sees" projects that got a portfolio card; a project with
   *  no card can still be the JD's best match on its actual bullet text). */
  jdText?: string;
}

export interface ResumeModel {
  name: string;
  title: string;
  contactLine: string;
  summary: string;
  skills: { label: string; items: string[] }[];
  experience: MasterResume["experience"];
  projects: {
    name: string;
    oneLiner: string;
    /** each bullet with its resolved portfolio-card link (null when no real
     *  shipped feature backs it) — so the claim right next to it is
     *  verifiable, not just asserted. Rendered as a short "(proof)" hyperlink,
     *  never a spelled-out URL. */
    bullets: { text: string; link: Link | null }[];
    tech: string[];
    repoUrl: string | null;
    repoUrl2?: string | null;
    docUrl?: string | null;
    docLabel?: string;
  }[];
  education: MasterResume["education"];
  archetypeLabel: string;
  tailoredTo: string | null;
}

const has = (set: Set<string>, s: string) => set.has(s.toLowerCase());

/** One short, real hyperlink per bullet/repo instead of a spelled-out URL —
 *  spelling out a ~80-char URL after every line is both bad taste (no resume
 *  reads that way) and the single biggest driver of page overflow; a real
 *  <a>/ExternalHyperlink with a 2-4 word label is the industry-standard way
 *  to cite a link and is exactly as ATS-safe as plain text. */
export interface Link {
  label: string;
  url: string;
}

/** The Tech-line's link set for a project: one or two repo links (labeled to
 *  distinguish them when a project entry merges two repos, e.g. Platform
 *  Infra/GitOps), plus an external write-up for a project with no synced
 *  portfolio page to link bullets into (e.g. a Notion case study). */
function repoLinks(p: {
  repoUrl: string | null;
  repoUrl2?: string | null;
  docUrl?: string | null;
  docLabel?: string;
}): Link[] {
  const links: Link[] = [];
  if (p.repoUrl) links.push({ label: p.repoUrl2 ? "Infra repo" : "GitHub", url: p.repoUrl });
  if (p.repoUrl2) links.push({ label: "GitOps repo", url: p.repoUrl2 });
  if (p.docUrl) links.push({ label: p.docLabel ?? "Case study", url: p.docUrl });
  return links;
}

/** Reorder `items` so JD-matched ones come first, order otherwise preserved. */
function hoist(items: string[], jd: Set<string>): string[] {
  if (jd.size === 0) return items;
  const lead: string[] = [];
  const rest: string[] = [];
  for (const it of items) (has(jd, it) ? lead : rest).push(it);
  return [...lead, ...rest];
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "that", "this", "from",
  "into", "per", "are", "was", "were", "been", "has", "have", "will",
  "using", "use", "via", "our", "your", "you", "we", "to", "of", "in", "on",
  "at", "by", "as", "is", "it", "its", "be", "not", "also", "who", "what",
  "how", "when", "where", "which", "their", "them", "all", "any", "can",
  "new", "one", "two", "more", "most", "other", "such", "than", "then",
  "these", "those", "about", "if", "you're",
]);

/** Whole-word significant terms in `text`, lowercased — the same overlap
 *  vocabulary used to score both sides of a JD/project comparison, so a
 *  collision like "rag" inside "leveraging" can't happen (word-bounded,
 *  not substring). */
function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

function overlapScore(words: Set<string>, jdWords: Set<string>): number {
  let n = 0;
  for (const w of words) if (jdWords.has(w)) n++;
  return n;
}

/** Identity/access-control/compliance vocabulary — rare and highly diagnostic
 *  wherever it appears (very few JDs ask for SCIM or ReBAC), unlike commodity
 *  infra nouns (Terraform, Kubernetes, AWS) that show up in most backend/
 *  platform postings regardless of what's actually distinctive about the
 *  role. A project's `matchTerms` hit in this list counts for more than one
 *  that isn't, so a project whose real work is specifically about
 *  auth/permissions can outrank one that just shares a common tech stack. */
const HIGH_SIGNAL_TERMS = new Set([
  "rbac", "abac", "rebac", "scim", "saml", "sso", "oauth2", "oauth", "ldap",
  "openid", "mfa", "idp", "access control", "identity management",
  "identity synchronization", "membership management", "single sign-on",
]);

function termWeight(term: string): number {
  return HIGH_SIGNAL_TERMS.has(term.toLowerCase()) ? 3 : 1;
}

/** Whole-phrase, case-insensitive match — `phrase` can be one word or several. */
function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function buildResumeModel(
  master: MasterResume,
  archetype: ArchetypeKey,
  jd?: JdTailor,
): ResumeModel {
  const a = master.archetypes[archetype];
  const jdSkills = new Set((jd?.skillNames ?? []).map((s) => s.toLowerCase()));
  const jdProjects = new Set((jd?.projectNames ?? []).map((s) => s.toLowerCase()));
  const jdWords = jd?.jdText ? significantWords(jd.jdText) : new Set<string>();

  // skills — group order from the archetype, JD matches hoisted within each group
  const byLabel = new Map(master.skills.map((g) => [g.label, g]));
  const skills = a.skillOrder
    .map((label) => byLabel.get(label))
    .filter((g): g is (typeof master.skills)[number] => !!g)
    .map((g) => ({ label: g.label, items: hoist(g.items, jdSkills) }));

  // experience — bullets whose actual content overlaps the JD's own words
  // lead (word-bounded, not the raw substring check this used to be — that
  // let a short jdSkill collide inside an unrelated word), tech hoisted
  const experience = master.experience.map((e) => ({
    ...e,
    tech: hoist(e.tech, jdSkills),
    bullets: jdWords.size
      ? [...e.bullets].sort(
          (x, y) =>
            overlapScore(significantWords(y), jdWords) -
            overlapScore(significantWords(x), jdWords),
        )
      : e.bullets,
  }));

  // projects — scored by each project's own curated `matchTerms` found in the
  // JD's real text, not just the knowledge-graph's synced-feature index
  // (`jdProjects`, from get_proof_for_jd): that index only "sees" projects
  // with a portfolio card, so a project with no card (e.g. a client project
  // written up as a Notion case study instead) could never be recognized as
  // the JD's best match no matter how well its real work fit. A graph match
  // is still a trustworthy signal (backed by a verified shipped feature), so
  // it's kept as a modest boost — but it no longer dominates outright, so a
  // project with no card can still out-rank one that merely shares a common
  // tech stack with the JD.
  const jdTextLower = (jd?.jdText ?? "").toLowerCase();
  const bySlug = new Map(master.projects.map((p) => [p.slug, p]));
  const ordered = a.projectOrder
    .map((slug) => bySlug.get(slug))
    .filter((p): p is (typeof master.projects)[number] => !!p);
  const projectScore = (p: (typeof ordered)[number]) => {
    const graphBoost = has(jdProjects, p.name) ? 1 : 0;
    const termScore = (p.matchTerms ?? [])
      .filter((t) => hasPhrase(jdTextLower, t))
      .reduce((sum, t) => sum + termWeight(t), 0);
    return graphBoost + termScore;
  };
  const scored = ordered
    .map((p) => ({ p, score: projectScore(p) }))
    .sort((x, y) => y.score - x.score); // stable — ties keep the archetype's default order
  // flex the count with match strength: nothing matched (no JD, or a JD that
  // matched none of these projects) → keep it lean at 3 rather than padding
  // with irrelevant work; a JD that strongly matches most of the catalog →
  // show 5 instead of dropping a genuinely relevant one to a fixed cap.
  const matchedCount = scored.filter((s) => s.score > 0).length;
  const count = matchedCount === 0 ? 3 : matchedCount >= 4 ? 5 : 4;
  const portfolioBase = master.portfolioUrl.replace(/\/$/, "");
  const projects = scored.slice(0, count).map(({ p }) => {
    const rawBullets = p.bulletsByArchetype?.[archetype] ?? p.bullets;
    const bullets = jdWords.size
      ? [...rawBullets].sort(
          (x, y) =>
            overlapScore(significantWords(y.text), jdWords) -
            overlapScore(significantWords(x.text), jdWords),
        )
      : rawBullets;
    return {
      name: p.name,
      oneLiner: p.oneLiner,
      bullets: bullets.map((b) => ({
        text: b.text,
        link: b.link
          ? {
              label: "proof",
              // an absolute URL (e.g. an external doc) is used as-is; a bare
              // "<slug>#<feature>" is a portfolio card, resolved against the base.
              url: /^https?:\/\//.test(b.link) ? b.link : `${portfolioBase}/projects/${b.link}`,
            }
          : null,
      })),
      tech: hoist(p.tech, jdSkills),
      repoUrl: p.repoUrl,
      repoUrl2: p.repoUrl2,
      docUrl: p.docUrl,
      docLabel: p.docLabel,
    };
  });

  const contactLine = [
    master.location,
    master.email,
    master.phone,
    master.github.replace(/^https?:\/\//, ""),
    master.linkedin.replace(/^https?:\/\//, ""),
  ].join("  |  ");

  return {
    name: master.name,
    title: master.title[a.summaryKey] ?? master.title.default,
    contactLine,
    summary: master.summary[a.summaryKey] ?? master.summary.default,
    skills,
    experience,
    projects,
    education: master.education,
    archetypeLabel: a.label,
    tailoredTo: jd ? "this job description" : null,
  };
}

// ── Markdown (ATS-clean: single column, standard headings, no tables) ──────

export function toMarkdown(m: ResumeModel): string {
  const L: string[] = [];
  L.push(`# ${m.name}`);
  L.push(`${m.title}`);
  L.push(``);
  L.push(m.contactLine);
  L.push(``);
  L.push(`## Summary`);
  L.push(m.summary);
  L.push(``);
  L.push(`## Skills`);
  for (const g of m.skills) L.push(`**${g.label}:** ${g.items.join(", ")}`);
  L.push(``);
  L.push(`## Projects`);
  for (const p of m.projects) {
    L.push(``);
    L.push(`### ${p.name}`);
    L.push(p.oneLiner);
    for (const b of p.bullets)
      L.push(`- ${b.text}${b.link ? ` [(${b.link.label})](${b.link.url})` : ""}`);
    const links = repoLinks(p);
    const linksMd = links.map((l) => `[${l.label}](${l.url})`).join("  ·  ");
    L.push(`*Tech: ${p.tech.join(", ")}*${linksMd ? `  ·  ${linksMd}` : ""}`);
  }
  L.push(``);
  L.push(`## Experience`);
  for (const e of m.experience) {
    L.push(``);
    L.push(`### ${e.role} — ${e.company}`);
    L.push(`${e.location} | ${e.period}`);
    for (const b of e.bullets) L.push(`- ${b}`);
    L.push(`*Tech: ${e.tech.join(", ")}*`);
  }
  L.push(``);
  L.push(`## Education`);
  for (const ed of m.education) {
    L.push(`**${ed.degree}**, ${ed.institution} — ${ed.period}`);
    if (ed.note) L.push(`*${ed.note}*`);
  }
  L.push(``);
  return L.join("\n");
}

// ── HTML (ATS-clean; open + Print-to-PDF for a text-based PDF, no deps) ───

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toHtml(m: ResumeModel): string {
  const parts: string[] = [];
  parts.push(`<h1>${esc(m.name)}</h1>`);
  parts.push(`<p class="title">${esc(m.title)}</p>`);
  parts.push(`<p class="contact">${esc(m.contactLine)}</p>`);
  parts.push(`<h2>Summary</h2><p>${esc(m.summary)}</p>`);
  parts.push(`<h2>Skills</h2>`);
  for (const g of m.skills)
    parts.push(`<p><strong>${esc(g.label)}:</strong> ${esc(g.items.join(", "))}</p>`);
  parts.push(`<h2>Projects</h2>`);
  for (const pr of m.projects) {
    parts.push(`<h3>${esc(pr.name)}</h3>`);
    parts.push(`<p>${esc(pr.oneLiner)}</p>`);
    parts.push(
      `<ul>${pr.bullets
        .map(
          (b) =>
            `<li>${esc(b.text)}${b.link ? ` <a href="${esc(b.link.url)}">(${esc(b.link.label)})</a>` : ""}</li>`,
        )
        .join("")}</ul>`,
    );
    const links = repoLinks(pr);
    const linksHtml = links
      .map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`)
      .join("  ·  ");
    parts.push(
      `<p class="tech">Tech: ${esc(pr.tech.join(", "))}${linksHtml ? `  ·  ${linksHtml}` : ""}</p>`,
    );
  }
  parts.push(`<h2>Experience</h2>`);
  for (const e of m.experience) {
    parts.push(`<h3>${esc(e.role)} — ${esc(e.company)}</h3>`);
    parts.push(`<p class="meta">${esc(e.location)} | ${esc(e.period)}</p>`);
    parts.push(`<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
    parts.push(`<p class="tech">Tech: ${esc(e.tech.join(", "))}</p>`);
  }
  parts.push(`<h2>Education</h2>`);
  for (const ed of m.education)
    parts.push(`<p><strong>${esc(ed.degree)}</strong>, ${esc(ed.institution)} — ${esc(ed.period)}</p>`);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.name)} — Résumé</title>
<style>
  @page{size:letter;margin:0.45in}
  body{font-family:Calibri,Arial,Helvetica,sans-serif;font-size:10.3pt;line-height:1.26;color:#111;max-width:7.6in;margin:0.45in auto;padding:0 0.15in}
  h1{font-size:18pt;margin:0 0 1pt}
  h2{font-size:11.5pt;margin:9pt 0 3pt;border-bottom:1px solid #ccc;padding-bottom:1pt}
  h3{font-size:10.6pt;margin:6pt 0 1pt}
  p{margin:1.5pt 0}
  ul{margin:1.5pt 0 3pt 16pt;padding:0}
  li{margin:0.5pt 0}
  h2,h3{break-after:avoid}
  li,h3+p{break-inside:avoid}
  .title{font-weight:600}
  .contact,.meta,.tech{color:#555;font-size:9.3pt}
  a{color:#1a5fb4;text-decoration:none}
  @media print{body{margin:0;max-width:none;padding:0}a{color:#1a5fb4}}
</style></head><body>${parts.join("\n")}</body></html>`;
}

// ── PDF via headless Chrome (ATS-safe: it's just the printed HTML) ────────

/**
 * Render `htmlPath` to `pdfPath` using an already-installed Chrome/Chromium/Edge.
 * Returns false (no throw) when no browser is found — callers keep the HTML as
 * the fallback and print it by hand.
 */
export function htmlToPdf(htmlPath: string, pdfPath: string): boolean {
  const chrome = findChrome();
  if (!chrome) return false;
  execSync(
    `"${chrome}" --headless --disable-gpu --no-pdf-header-footer ` +
      `--print-to-pdf="${pdfPath}" "file://${htmlPath}"`,
    { stdio: "ignore", timeout: 60_000 },
  );
  return true;
}

// ── DOCX (single column, Calibri 11, Heading styles, no tables/images) ────

const p = (text: string, opts?: { bold?: boolean; italics?: boolean }) =>
  new Paragraph({
    children: [new TextRun({ text, bold: opts?.bold, italics: opts?.italics })],
    spacing: { after: 80 },
  });

const bullet = (text: string) =>
  new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 40 },
  });

const hyperlink = (label: string, url: string, opts?: { italics?: boolean }) =>
  new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text: label, style: "Hyperlink", italics: opts?.italics })],
  });

/** A trailing " · label · label" run of real hyperlinks, e.g. the Tech line's
 *  repo link(s) — same short-label-not-URL treatment as everywhere else. */
const linkRun = (links: Link[], opts?: { italics?: boolean }) =>
  links.flatMap((l) => [
    new TextRun({ text: "  ·  ", italics: opts?.italics }),
    hyperlink(l.label, l.url, opts),
  ]);

/** A bullet whose sentence ends with an optional " (proof)" hyperlink —
 *  parens are part of the clickable text, matching the Markdown/HTML render. */
const bulletWithLink = (text: string, link: Link | null) =>
  new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [
      new TextRun({ text }),
      ...(link ? [new TextRun({ text: " " }), hyperlink(`(${link.label})`, link.url)] : []),
    ],
  });

export async function toDocxBuffer(m: ResumeModel): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: m.name })],
    }),
  );
  children.push(p(m.title));
  children.push(p(m.contactLine));

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Summary" }));
  children.push(p(m.summary));

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Skills" }));
  for (const g of m.skills) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${g.label}: `, bold: true }),
          new TextRun({ text: g.items.join(", ") }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Projects" }),
  );
  for (const pr of m.projects) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, text: pr.name }));
    children.push(p(pr.oneLiner));
    for (const b of pr.bullets) children.push(bulletWithLink(b.text, b.link));
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `Tech: ${pr.tech.join(", ")}`, italics: true }),
          ...linkRun(repoLinks(pr), { italics: true }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Experience" }),
  );
  for (const e of m.experience) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        text: `${e.role} — ${e.company}`,
      }),
    );
    children.push(p(`${e.location} | ${e.period}`, { italics: true }));
    for (const b of e.bullets) children.push(bullet(b));
    children.push(p(`Tech: ${e.tech.join(", ")}`, { italics: true }));
  }

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Education" }),
  );
  for (const ed of m.education) {
    children.push(p(`${ed.degree}, ${ed.institution} — ${ed.period}`));
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
