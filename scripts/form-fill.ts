/**
 * ATS detection + best-effort form fill for `pnpm apply-fill`.
 * Fills what it's confident about, flags the rest. NEVER submits.
 */
import { basename } from "node:path";
import type { ElementHandle, Frame, Page } from "playwright";
import { answerFor, type Profile } from "@/lib/apply/profile";

export type Ats = "greenhouse" | "lever" | "ashby" | "unknown";

export interface FillReport {
  ats: Ats;
  filled: { label: string; value: string }[];
  needsYou: { label: string; note: string }[];
  blank: string[];
}

type Root = Page | Frame;

function atsFromUrl(u: string): Ats {
  if (/greenhouse\.io|grnh\.se/i.test(u)) return "greenhouse";
  if (/lever\.co/i.test(u)) return "lever";
  if (/ashbyhq\.com/i.test(u)) return "ashby";
  return "unknown";
}

export async function detectAts(page: Page): Promise<{ ats: Ats; root: Root }> {
  const ats = atsFromUrl(page.url());
  if (ats !== "unknown") return { ats, root: page };

  for (const f of page.frames()) {
    const a = atsFromUrl(f.url());
    if (a !== "unknown") return { ats: a, root: f };
  }
  const embed = await page.$(
    'iframe#grnhse_iframe, iframe[src*="greenhouse"], iframe[src*="lever"], iframe[src*="ashby"]',
  );
  if (embed) {
    const fr = await embed.contentFrame();
    if (fr) return { ats: atsFromUrl(fr.url()), root: fr };
  }
  return { ats: "unknown", root: page };
}

async function labelText(el: ElementHandle<HTMLElement | SVGElement>): Promise<string> {
  return el
    .evaluate((node) => {
      const el = node as HTMLElement;
      const clean = (s: string | null | undefined) =>
        (s ?? "").replace(/\s+/g, " ").trim();
      const id = el.getAttribute("id");
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l?.textContent) return clean(l.textContent);
      }
      const wrap = el.closest("label");
      if (wrap?.textContent) return clean(wrap.textContent);
      const aria = el.getAttribute("aria-label");
      if (aria) return clean(aria);
      const ref = el.getAttribute("aria-labelledby");
      if (ref) {
        const t = ref
          .split(/\s+/)
          .map((i) => document.getElementById(i)?.textContent ?? "")
          .join(" ");
        if (t.trim()) return clean(t);
      }
      const grp = el.closest(
        '.field, .form-group, [class*="field"], [class*="question"], [class*="Field"], fieldset',
      );
      const lab = grp?.querySelector("label, legend, .label");
      if (lab?.textContent) return clean(lab.textContent);
      return clean(el.getAttribute("placeholder"));
    })
    .catch(() => "");
}

async function selectByText(
  el: ElementHandle<HTMLElement | SVGElement>,
  value: string,
): Promise<boolean> {
  const opts = await el
    .$$eval("option", (os) =>
      os.map((o) => ({ v: (o as HTMLOptionElement).value, t: (o.textContent ?? "").trim() })),
    )
    .catch(() => [] as { v: string; t: string }[]);
  if (!opts.length) return false;
  const want = value.toLowerCase();
  const exact = opts.find((o) => o.t.toLowerCase() === want);
  const partial = opts.find(
    (o) => o.t && (o.t.toLowerCase().includes(want) || want.includes(o.t.toLowerCase())),
  );
  const hit = exact ?? partial;
  if (!hit) return false;
  await (el as ElementHandle<HTMLSelectElement>).selectOption(hit.v).catch(() => {});
  return true;
}

// ── known per-ATS fields ────────────────────────────────────────────────────

function locationStr(p: Profile): string {
  return [p.identity.location.city, p.identity.location.region, p.identity.location.country]
    .filter(Boolean)
    .join(", ");
}

function knownSpecs(ats: Ats, p: Profile): [string, string][] {
  if (ats === "greenhouse")
    return [
      ["#first_name", p.identity.firstName],
      ["#last_name", p.identity.lastName],
      ["#email", p.identity.email],
      ["#phone", p.identity.phone],
    ];
  if (ats === "lever")
    return [
      ['input[name="name"]', p.identity.fullName],
      ['input[name="email"]', p.identity.email],
      ['input[name="phone"]', p.identity.phone],
      ['input[name="urls[LinkedIn]"]', p.links.linkedin],
      ['input[name="urls[GitHub]"]', p.links.github],
      ['input[name="urls[Portfolio]"]', p.links.portfolio],
    ];
  if (ats === "ashby")
    return [
      ['input[name="_systemfield_name"], input[id*="_systemfield_name"]', p.identity.fullName],
      ['input[name="_systemfield_email"], input[id*="_systemfield_email"]', p.identity.email],
      ['input[name="_systemfield_phone"], input[id*="_systemfield_phone"]', p.identity.phone],
    ];
  return [];
}

async function fillKnown(
  root: Root,
  ats: Ats,
  p: Profile,
  report: FillReport,
): Promise<void> {
  void locationStr; // reserved for portals with a location text field
  for (const [sel, val] of knownSpecs(ats, p)) {
    if (!val) continue;
    const el = await root.$(sel);
    if (!el) continue;
    if (!(await el.isVisible().catch(() => false))) continue;
    const cur = await el.inputValue().catch(() => "");
    if (cur.trim()) continue;
    await el.fill(val).catch(() => {});
    report.filled.push({ label: sel, value: val });
  }
}

async function uploadResume(
  root: Root,
  resumePath: string,
  coverLetterPath: string | undefined,
  report: FillReport,
): Promise<void> {
  const files = await root.$$('input[type="file"]');
  const named: { el: (typeof files)[number]; name: string }[] = [];
  for (const f of files) {
    const name = (
      (await labelText(f)) ||
      (await f.getAttribute("name")) ||
      (await f.getAttribute("id")) ||
      ""
    ).toLowerCase();
    named.push({ el: f, name });
  }

  let resumeEl = named.find((n) => /resume|cv|résumé/.test(n.name))?.el;
  const coverEl = named.find((n) => /cover/.test(n.name))?.el;
  // fall back to the first file input that isn't the cover-letter one
  if (!resumeEl) resumeEl = named.find((n) => n.el !== coverEl)?.el;

  if (resumeEl) {
    await resumeEl.setInputFiles(resumePath).catch(() => {});
    report.filled.push({ label: "resume upload", value: basename(resumePath) });
  } else {
    report.needsYou.push({ label: "resume upload", note: "attach resume.pdf manually" });
  }
  if (coverEl && coverLetterPath) {
    await coverEl.setInputFiles(coverLetterPath).catch(() => {});
    report.filled.push({ label: "cover letter upload", value: basename(coverLetterPath) });
  }
}

async function fillFreeText(
  root: Root,
  whyFit: string,
  coverLetter: string,
  report: FillReport,
): Promise<void> {
  for (const ta of await root.$$("textarea")) {
    if (!(await ta.isVisible().catch(() => false))) continue;
    if ((await ta.inputValue().catch(() => "")).trim()) continue;
    const label = (await labelText(ta)).toLowerCase();
    if (/cover letter/.test(label) && coverLetter) {
      await ta.fill(coverLetter).catch(() => {});
      report.filled.push({ label: label || "cover letter", value: "cover-letter.md" });
    } else if (
      whyFit &&
      /(why|interest|motivat|tell us|about you|additional info|anything else|excite|passionate)/.test(
        label,
      )
    ) {
      await ta.fill(whyFit).catch(() => {});
      report.filled.push({ label: label || "why you're a fit", value: "why-fit.md" });
    }
  }
}

async function fillGeneric(
  root: Root,
  report: FillReport,
  done: Set<string>,
  profile: Profile,
): Promise<void> {
  const controls = await root.$$("input:not([type=hidden]), textarea, select");
  let seen = 0;
  for (const el of controls) {
    if (seen > 80) break;
    seen += 1;
    try {
      if (!(await el.isVisible())) continue;
      if (!(await el.isEnabled())) continue;
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      const type = ((await el.getAttribute("type")) ?? tag).toLowerCase();
      if (["submit", "button", "file", "checkbox", "radio", "password", "search"].includes(type))
        continue;
      if ((await el.inputValue().catch(() => "")).trim()) continue;
      const label = await labelText(el);
      if (!label || label.length > 200) continue;
      if (done.has(label.toLowerCase())) continue;
      done.add(label.toLowerCase());

      const ans = answerFor(label, profile);
      if (!ans) {
        report.blank.push(label);
        continue;
      }
      if (tag === "select") {
        const ok = await selectByText(el, ans.value);
        if (ok && ans.confident) report.filled.push({ label, value: ans.value });
        else
          report.needsYou.push({
            label,
            note: ok ? `set "${ans.value}" — verify` : `pick manually (suggested: ${ans.value})`,
          });
      } else if (ans.confident) {
        await el.fill(ans.value);
        report.filled.push({ label, value: ans.value });
      } else {
        report.needsYou.push({ label, note: `suggested: ${ans.value}` });
      }
    } catch {
      /* skip a field that won't cooperate */
    }
  }
}

export interface FillInput {
  profile: Profile;
  resumePath: string;
  coverLetterPath?: string;
  whyFit: string;
  coverLetter: string;
}

export async function runFill(page: Page, input: FillInput): Promise<FillReport> {
  const { ats, root } = await detectAts(page);
  const report: FillReport = { ats, filled: [], needsYou: [], blank: [] };
  await fillKnown(root, ats, input.profile, report);
  await uploadResume(root, input.resumePath, input.coverLetterPath, report);
  await fillFreeText(root, input.whyFit, input.coverLetter, report);
  await fillGeneric(
    root,
    report,
    new Set(report.filled.map((f) => f.label.toLowerCase())),
    input.profile,
  );
  return report;
}
