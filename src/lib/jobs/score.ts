import {
  companyTypeOf,
  contactOf,
  fundingOf,
  regionOf,
  remoteKindOf,
} from "./classify";
import { salaryToLpa } from "./salary";
import type { GraphMatch, JobSearchConfig, RawJob, ScoredJob } from "./types";

const DIRECT_BOARDS = new Set(["wwr", "remoteok", "remotive", "hn"]);
const AGENCY_PUBLISHER =
  /\b(staffing|talent|recruit|consultanc|resourc|manpower|placements?)\b/i;

const B_FLAGS = new Set([
  "agency_publisher",
  "evergreen",
  "no_salary",
  "agency_named_client",
  "agency_unnamed",
  "body_shop",
  "weak_funding",
  "onsite",
  "excluded_region",
  "region_restricted",
  "verify_apply_link",
  "visa_blocker",
]);

/** Found via a real apply-drive encounter (Product Genius: JD said "REMOTE
 *  (US)", the actual Ashby form then said "we are not sponsoring visas at
 *  this time"). The user needs sponsorship for every country but India, so
 *  either signal makes a role a near-certain dead end regardless of skill
 *  match — flag it before scaffolding a folder for it. */
const NO_SPONSORSHIP_PHRASES =
  /\b(no\s+visa\s+sponsorship|not\s+sponsoring\s+visas?|unable\s+to\s+sponsor|will\s+not\s+sponsor|does\s+not\s+sponsor|without\s+sponsorship|us\s+citizens?\s+only)\b/i;
// "Remote (US)" and "(USA Only, ...)" are both real title phrasings this
// missed on 2026-09-13 (Close: "Senior Backend Engineer - CRM (USA Only,
// 100% Remote)" scored 0.82 clean into Group A, no flag at all).
const US_ONLY_REMOTE = /\bremote\s*\(\s*us\)|\b(us|usa)\s+only\b/i;
/** Found via a real apply-drive encounter (Mind Computing, 2026-09-16): a
 *  federal-contractor (VA) posting whose aggregator snippet plainly said
 *  "The candidate must reside within the continental US" — a residency
 *  requirement is the same dead end as an explicit no-sponsorship phrase for
 *  an India-based candidate, but neither NO_SPONSORSHIP_PHRASES nor
 *  US_ONLY_REMOTE catches "must reside"/"must be a U.S. citizen" wording. */
const RESIDENCY_REQUIRED =
  /\bmust\s+(?:reside|be\s+located|live)\s+(?:within|in)\s+the\s+(?:continental\s+)?(?:u\.?s\.?a?\.?|united\s+states)\b|\brequires?\s+u\.?s\.?\s+citizenship\b|\bmust\s+be\s+a\s+u\.?s\.?\s+citizen\b|\bu\.?s\.?\s+citizens?\s+(?:only|required)\b/i;
/** Positive signal, not just an absence of red flags — a posting that
 *  explicitly names India or a genuinely global/worldwide hiring footprint
 *  is real evidence the company already hires outside the US/EU, which a
 *  bare "remote" tag doesn't tell you (Mind Computing's location field was
 *  just "Anywhere" and still turned out to be a hard US-residency job). */
const INDIA_OR_GLOBAL_FRIENDLY =
  /\b(india|bengaluru|bangalore|hyderabad|remote[- ]india|hire(?:s|d)?\s+(?:globally|internationally|worldwide)|global(?:ly)?\s+remote|remote[- ]first,?\s+global|distributed\s+team|work\s+from\s+anywhere|worldwide)\b/i;

/** Sources whose own "Apply" always walls into a signup/login page, not the
 *  real company form — found via real apply-drive attempts (Himalayas
 *  routes every job to /signup/talent regardless of company; Jobicy's own
 *  "Apply Now" fires a `RegistrationGateOpened` tracking event and opens a
 *  registration modal instead of the employer's form — confirmed twice,
 *  ClickUp and Grafana Labs, both times the real posting was findable on
 *  the employer's own Greenhouse/Ashby board via a web search). Resolve the
 *  real link at scaffold time (apply-morning), not discovered later. */
const WALLED_SOURCES = new Set(["himalayas", "jobicy"]);

/** A short/abruptly-cut `descriptionSnippet` silently starves everything
 *  downstream that tailors off it — archetype pick, skill/project hoisting,
 *  proof matching — of whatever requirement language got cut (found the
 *  hard way: Vercel's snippet was truncated mid-sentence, before the
 *  paragraph naming SCIM/RBAC/SAML/OAuth2, and the résumé silently
 *  tailored around their absence until the real JD was re-fetched by hand).
 *  A real posting almost always ends on real punctuation; a snippet cut off
 *  by a length limit usually doesn't — and a snippet under ~400 chars is
 *  rarely the whole posting regardless of how it ends. */
function looksTruncated(snippet: string | null): boolean {
  if (!snippet) return false;
  const lines = snippet.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  let last = lines[lines.length - 1].trim();
  if (/^https?:\/\//.test(last) && lines.length > 1) last = lines[lines.length - 2].trim();
  if (snippet.trim().length < 400) return true;
  return !/[.!?"')\]:]$/.test(last);
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const d = Date.parse(iso);
  return Number.isNaN(d) ? null : Math.floor((Date.now() - d) / 864e5);
}

export function scoreJob(
  j: RawJob & { roleKey: string; seenIn: string[] },
  cfg: JobSearchConfig,
  usdInr: number,
): ScoredJob {
  const flags: string[] = [];
  const salaryLpa = salaryToLpa(j.salaryText, usdInr);
  const remoteKind = remoteKindOf(j);
  const { companyType, namedClient } = companyTypeOf(j);
  const fund = fundingOf(j);
  const contact = contactOf(j);
  const region = regionOf(j, cfg.targetCountries);
  const age = daysAgo(j.postedAt);

  let reply = 0.5;
  const bump = (n: number) => {
    reply += n;
  };

  if (age != null && age <= 7) bump(0.12);
  if (age != null && age > 21) flags.push(`stale:${age}d`);
  if (DIRECT_BOARDS.has(j.source)) bump(0.12);
  if (WALLED_SOURCES.has(j.source)) {
    flags.push("verify_apply_link");
    bump(-0.05);
  }
  if (j.publisher && AGENCY_PUBLISHER.test(j.publisher)) {
    flags.push("agency_publisher");
    bump(-0.18);
  }
  if (contact.email || contact.name) {
    flags.push("has_contact");
    bump(0.15);
  }
  if (age != null && age > 21 && j.seenIn.length >= 3) {
    flags.push("evergreen");
    bump(-0.12);
  }
  if (!salaryLpa) flags.push("no_salary");
  else if (salaryLpa >= cfg.minLpa) bump(0.1);
  else flags.push(`low_salary:${salaryLpa}`);

  if (companyType === "product") bump(0.1);
  else if (companyType === "agency_named_client")
    flags.push(`agency_named_client${namedClient ? `:${namedClient}` : ""}`);
  else if (companyType === "agency_unnamed") {
    flags.push("agency_unnamed");
    bump(-0.1);
  } else if (companyType === "body_shop") {
    flags.push("body_shop");
    bump(-0.15);
  } else flags.push("verify_company");

  if (fund.weak) {
    flags.push("weak_funding");
    bump(cfg.preferFunded ? -0.2 : -0.1);
  } else if (fund.stage) {
    // detectable funding signal — reward it harder when the user asked to
    if (cfg.preferFunded) bump(0.12);
  } else {
    flags.push("verify_funding");
    if (cfg.preferFunded) bump(-0.05);
  }

  if (
    remoteKind === "onsite_foreign" ||
    remoteKind === "onsite_india" ||
    (cfg.remoteOnly && remoteKind !== "remote")
  ) {
    flags.push("onsite");
  }

  if (region.excluded) {
    flags.push("excluded_region");
    bump(-0.3);
  } else if (region.restricted) {
    flags.push(`region_restricted${region.note ? `:${region.note}` : ""}`);
    bump(-0.15);
  }

  if (looksTruncated(j.descriptionSnippet)) flags.push("truncated_jd_text");

  const hay = `${j.role} ${j.descriptionSnippet ?? ""}`.toLowerCase();
  if (NO_SPONSORSHIP_PHRASES.test(hay) || US_ONLY_REMOTE.test(hay) || RESIDENCY_REQUIRED.test(hay)) {
    flags.push("visa_blocker");
    bump(-0.2);
  } else if (INDIA_OR_GLOBAL_FRIENDLY.test(hay)) {
    // Only rewarded when nothing above already flagged a hard blocker — a
    // posting can still say "worldwide" in its perks section while its
    // actual screening questions require US residency.
    flags.push("india_friendly");
    bump(0.08);
  }
  for (const gap of cfg.hardSkillGaps ?? []) {
    // word-boundary, not substring — "Java" must not match inside "JavaScript"
    const re = new RegExp(`\\b${gap.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(hay)) {
      flags.push(`hard_skill_gap:${gap}`);
      bump(-0.15);
    }
  }
  // Bare "Go" isn't in hardSkillGaps — too common an English word ("go
  // beyond", "goals") for a blanket word-boundary match. These narrow
  // phrases are how a real Go-backend JD actually says it (Spacelift:
  // "On the backend we're using 100% Go" — surfaced clean two days
  // running), so they're safe without the false-positive risk.
  if (/\b100%\s*go\b|\bwritten\s+in\s+go\b|\bgo\s+backend\b/i.test(hay)) {
    flags.push("hard_skill_gap:Go");
    bump(-0.15);
  }

  const replyLikelihood = Math.max(0, Math.min(1, reply));

  const hits = cfg.skills.filter((s) => hay.includes(s.toLowerCase())).length;
  const substringSkillMatch = cfg.skills.length
    ? Math.min(1, hits / Math.min(cfg.skills.length, 8))
    : 0;

  const score = replyLikelihood * (0.4 + 0.6 * substringSkillMatch);

  const toB =
    flags.some((f) => f.startsWith("stale:")) ||
    flags.some((f) => f.startsWith("low_salary")) ||
    flags.some((f) => f.startsWith("hard_skill_gap:")) ||
    flags.some((f) => B_FLAGS.has(f.split(":")[0]));

  return {
    ...j,
    salaryLpa,
    remoteKind,
    companyType,
    funding: { stage: fund.stage, note: fund.note },
    contactName: contact.name,
    contactEmail: contact.email,
    flags,
    replyLikelihood,
    skillMatch: substringSkillMatch,
    substringSkillMatch,
    graphMatch: null,
    graphSkills: [],
    graphFeatures: [],
    score,
    group: toB ? "B" : "A",
  };
}

/**
 * Fold a job's knowledge-graph match into its score: `skillMatch` becomes
 * `max(substring, graph)` and the final score is recomputed on it. Returns a
 * new object; group is flag-based so it never changes here.
 */
export function applyGraphMatch(j: ScoredJob, gm: GraphMatch): ScoredJob {
  const skillMatch = Math.max(j.substringSkillMatch, gm.score);
  return {
    ...j,
    graphMatch: gm.score,
    graphSkills: gm.skills,
    graphFeatures: gm.features,
    skillMatch,
    score: j.replyLikelihood * (0.4 + 0.6 * skillMatch),
  };
}
