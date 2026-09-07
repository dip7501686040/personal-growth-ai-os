import {
  AlignmentType,
  Document,
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
    bullets: string[];
    tech: string[];
    repoUrl: string | null;
  }[];
  education: MasterResume["education"];
  archetypeLabel: string;
  tailoredTo: string | null;
}

const has = (set: Set<string>, s: string) => set.has(s.toLowerCase());

/** Reorder `items` so JD-matched ones come first, order otherwise preserved. */
function hoist(items: string[], jd: Set<string>): string[] {
  if (jd.size === 0) return items;
  const lead: string[] = [];
  const rest: string[] = [];
  for (const it of items) (has(jd, it) ? lead : rest).push(it);
  return [...lead, ...rest];
}

export function buildResumeModel(
  master: MasterResume,
  archetype: ArchetypeKey,
  jd?: JdTailor,
): ResumeModel {
  const a = master.archetypes[archetype];
  const jdSkills = new Set((jd?.skillNames ?? []).map((s) => s.toLowerCase()));
  const jdProjects = new Set((jd?.projectNames ?? []).map((s) => s.toLowerCase()));

  // skills — group order from the archetype, JD matches hoisted within each group
  const byLabel = new Map(master.skills.map((g) => [g.label, g]));
  const skills = a.skillOrder
    .map((label) => byLabel.get(label))
    .filter((g): g is (typeof master.skills)[number] => !!g)
    .map((g) => ({ label: g.label, items: hoist(g.items, jdSkills) }));

  // experience — bullets with a JD term first, tech hoisted
  const experience = master.experience.map((e) => ({
    ...e,
    tech: hoist(e.tech, jdSkills),
    bullets: jdSkills.size
      ? [...e.bullets].sort((x, y) => {
          const hx = [...jdSkills].some((k) => x.toLowerCase().includes(k)) ? 0 : 1;
          const hy = [...jdSkills].some((k) => y.toLowerCase().includes(k)) ? 0 : 1;
          return hx - hy;
        })
      : e.bullets,
  }));

  // projects — archetype order, JD-matched projects hoisted, top 4
  const bySlug = new Map(master.projects.map((p) => [p.slug, p]));
  const ordered = a.projectOrder
    .map((slug) => bySlug.get(slug))
    .filter((p): p is (typeof master.projects)[number] => !!p);
  const projects = [
    ...ordered.filter((p) => has(jdProjects, p.name)),
    ...ordered.filter((p) => !has(jdProjects, p.name)),
  ]
    .slice(0, 4)
    .map((p) => ({
      name: p.name,
      oneLiner: p.oneLiner,
      bullets: p.bullets,
      tech: hoist(p.tech, jdSkills),
      repoUrl: p.repoUrl,
    }));

  const contactLine = [
    master.location,
    master.email,
    master.phone,
    master.github.replace(/^https?:\/\//, ""),
    master.linkedin.replace(/^https?:\/\//, ""),
  ].join("  |  ");

  return {
    name: master.name,
    title: master.title,
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
  L.push(`## Experience`);
  for (const e of m.experience) {
    L.push(``);
    L.push(`### ${e.role} — ${e.company}`);
    L.push(`${e.location} | ${e.period}`);
    for (const b of e.bullets) L.push(`- ${b}`);
    L.push(`*Tech: ${e.tech.join(", ")}*`);
  }
  L.push(``);
  L.push(`## Projects`);
  for (const p of m.projects) {
    L.push(``);
    L.push(`### ${p.name}`);
    L.push(p.oneLiner);
    for (const b of p.bullets) L.push(`- ${b}`);
    L.push(`*Tech: ${p.tech.join(", ")}*${p.repoUrl ? `  ·  ${p.repoUrl}` : ""}`);
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
  parts.push(`<h2>Experience</h2>`);
  for (const e of m.experience) {
    parts.push(`<h3>${esc(e.role)} — ${esc(e.company)}</h3>`);
    parts.push(`<p class="meta">${esc(e.location)} | ${esc(e.period)}</p>`);
    parts.push(`<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
    parts.push(`<p class="tech">Tech: ${esc(e.tech.join(", "))}</p>`);
  }
  parts.push(`<h2>Projects</h2>`);
  for (const pr of m.projects) {
    parts.push(`<h3>${esc(pr.name)}</h3>`);
    parts.push(`<p>${esc(pr.oneLiner)}</p>`);
    parts.push(`<ul>${pr.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`);
    parts.push(
      `<p class="tech">Tech: ${esc(pr.tech.join(", "))}${pr.repoUrl ? `  ·  ${esc(pr.repoUrl)}` : ""}</p>`,
    );
  }
  parts.push(`<h2>Education</h2>`);
  for (const ed of m.education)
    parts.push(`<p><strong>${esc(ed.degree)}</strong>, ${esc(ed.institution)} — ${esc(ed.period)}</p>`);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.name)} — Résumé</title>
<style>
  body{font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.35;color:#111;max-width:7.5in;margin:0.5in auto;padding:0 0.2in}
  h1{font-size:20pt;margin:0 0 2pt}
  h2{font-size:13pt;margin:14pt 0 4pt;border-bottom:1px solid #ccc;padding-bottom:2pt}
  h3{font-size:11.5pt;margin:8pt 0 1pt}
  p{margin:2pt 0}
  ul{margin:2pt 0 4pt 18pt;padding:0}
  li{margin:1pt 0}
  .title{font-weight:600}
  .contact,.meta,.tech{color:#555;font-size:10pt}
  @media print{body{margin:0.5in}}
</style></head><body>${parts.join("\n")}</body></html>`;
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
    new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Projects" }),
  );
  for (const pr of m.projects) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, text: pr.name }));
    children.push(p(pr.oneLiner));
    for (const b of pr.bullets) children.push(bullet(b));
    children.push(
      p(`Tech: ${pr.tech.join(", ")}${pr.repoUrl ? `  ·  ${pr.repoUrl}` : ""}`, {
        italics: true,
      }),
    );
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
