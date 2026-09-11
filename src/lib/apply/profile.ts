/**
 * The standing answer bank for job-application forms and outreach.
 * Source: resume/profile.json (gitignored; copy from resume/profile.example.json).
 *
 * `answerFor(label)` maps a form field's visible label / question text to the
 * best stored answer, with a `confident` flag so the form-filler can auto-fill
 * the sure ones and flag the rest for the user.
 *
 * Server-only (reads the filesystem).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getFileText, isR2Configured } from "@/modules/files/store";

const authEntrySchema = z.object({
  status: z.enum(["citizen", "authorized", "not_authorized"]),
  needsSponsorship: z.boolean(),
});

const profileSchema = z.object({
  identity: z.object({
    firstName: z.string(),
    lastName: z.string(),
    fullName: z.string(),
    email: z.string().email(),
    phone: z.string(),
    location: z.object({
      city: z.string(),
      region: z.string().default(""),
      country: z.string(),
    }),
    timezone: z.string(),
    pronouns: z.string().default(""),
  }),
  links: z.object({
    linkedin: z.string().default(""),
    github: z.string().default(""),
    portfolio: z.string().default(""),
    website: z.string().default(""),
  }),
  work: z.object({
    yearsExperience: z.number(),
    currentTitle: z.string(),
    seniority: z.string(),
    noticePeriodDays: z.number().int().nonnegative(),
    earliestStartDate: z.string().default(""),
    remoteOnly: z.boolean(),
    willingToRelocate: z.boolean(),
    employmentTypes: z.array(z.string()),
  }),
  authorization: z.record(z.string(), authEntrySchema),
  compensation: z.object({
    currency: z.string(),
    // number (e.g. 120000) or free text (e.g. "25k USD", "$120k") or null
    expectationMin: z.union([z.string(), z.number()]).nullable(),
    expectationMax: z.union([z.string(), z.number()]).nullable(),
    expectationNote: z.string().default(""),
    currentCtc: z.union([z.string(), z.number()]).nullable().default(null),
  }),
  eeo: z.object({
    gender: z.string(),
    race: z.string(),
    veteranStatus: z.string(),
    disabilityStatus: z.string(),
    hispanicLatino: z.string(),
  }),
  screening: z.object({
    criminalRecord: z.boolean(),
    requiresSponsorship: z.boolean(),
    over18: z.boolean(),
    canPassBackgroundCheck: z.boolean(),
    referencesAvailable: z.boolean(),
    howDidYouHear: z.string(),
  }),
});

export type Profile = z.infer<typeof profileSchema>;
export type AuthRegion =
  | "us"
  | "uk"
  | "eu"
  | "canada"
  | "australia"
  | "india"
  | "default";

let cached: Profile | null = null;

/** `my-files` R2 (source of truth) when configured, else the local file. */
export async function loadProfile(): Promise<Profile> {
  if (cached) return cached;
  if (isR2Configured()) {
    try {
      const text = await getFileText("resume/profile.json");
      if (text != null) {
        cached = profileSchema.parse(JSON.parse(text));
        return cached;
      }
    } catch {
      // bucket not provisioned / not reachable yet — fall through to local
    }
  }
  const path = join(process.cwd(), "resume", "profile.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(
      "profile.json not found in R2 (my-files bucket) or locally — run: " +
        "cp resume/profile.example.json resume/profile.json and fill it in " +
        "(or pnpm files push once R2 is configured).",
    );
  }
  cached = profileSchema.parse(JSON.parse(raw));
  return cached;
}

/** Which set of TODO / unset fields still need the user's input. */
export function profileGaps(p: Profile): string[] {
  const gaps: string[] = [];
  if (!p.identity.pronouns) gaps.push("identity.pronouns");
  if (!p.links.portfolio) gaps.push("links.portfolio");
  if (!p.work.earliestStartDate) gaps.push("work.earliestStartDate");
  if (
    p.compensation.expectationMin == null &&
    p.compensation.expectationMax == null &&
    !p.compensation.expectationNote
  )
    gaps.push("compensation.expectation");
  return gaps;
}

const COUNTRY_REGION: Array<[RegExp, AuthRegion]> = [
  [/\b(u\.?s\.?a?|united states|america)\b/i, "us"],
  [/\b(u\.?k\.?|united kingdom|britain|england|scotland|wales)\b/i, "uk"],
  [/\b(canada|canadian)\b/i, "canada"],
  [/\b(australia|australian)\b/i, "australia"],
  [/\b(india|indian)\b/i, "india"],
  [
    /\b(eu\b|european union|eea|schengen|germany|france|netherlands|spain|ireland|portugal|poland|sweden|norway|denmark|finland|belgium|austria)\b/i,
    "eu",
  ],
];

export function regionFromLabel(label: string): AuthRegion {
  for (const [re, region] of COUNTRY_REGION) if (re.test(label)) return region;
  return "default";
}

export function authFor(region: AuthRegion, p: Profile) {
  return p.authorization[region] ?? p.authorization.default;
}

function money(v: string | number, currency: string): string {
  return typeof v === "number" ? `${currency} ${v.toLocaleString()}` : v;
}

function compExpectation(p: Profile): string {
  const { expectationMin, expectationMax, currency, expectationNote } =
    p.compensation;
  if (expectationMin != null && expectationMax != null) {
    return `${money(expectationMin, currency)}–${money(expectationMax, currency)}`;
  }
  if (expectationMin != null) {
    return typeof expectationMin === "number"
      ? `${money(expectationMin, currency)}+`
      : expectationMin;
  }
  if (expectationMax != null) return `up to ${money(expectationMax, currency)}`;
  return expectationNote || "Open — happy to discuss a range.";
}

export interface Answer {
  /** the value to type / select */
  value: string;
  /** profile path it came from — provenance for the UI */
  field: string;
  /** safe to auto-fill without review */
  confident: boolean;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

/**
 * Best answer for a form field given its label / question text.
 * Returns null when nothing in the profile plausibly answers it.
 */
export function answerFor(label: string, p: Profile): Answer | null {
  const q = label.toLowerCase().replace(/\s+/g, " ").trim();
  const m = (re: RegExp) => re.test(q);
  const A = (value: string, field: string, confident = true): Answer => ({
    value,
    field,
    confident,
  });

  // ── identity ──────────────────────────────────────────────────────────────
  if (m(/first name|given name/)) return A(p.identity.firstName, "identity.firstName");
  if (m(/last name|surname|family name/)) return A(p.identity.lastName, "identity.lastName");
  if (m(/full name|legal name|^name$|your name|candidate name/))
    return A(p.identity.fullName, "identity.fullName");
  if (m(/e-?mail/)) return A(p.identity.email, "identity.email");
  if (m(/phone|mobile|cell|contact number|telephone/))
    return A(p.identity.phone, "identity.phone");
  if (m(/pronoun/))
    return p.identity.pronouns
      ? A(p.identity.pronouns, "identity.pronouns")
      : A("Decline to self-identify", "identity.pronouns", false);
  if (m(/time ?zone/)) return A(p.identity.timezone, "identity.timezone");
  if (m(/country/)) return A(p.identity.location.country, "identity.location.country");
  if (m(/\bstate\b|province/) && !m(/work|authori|eligib|united states/))
    return A(p.identity.location.region, "identity.location.region");
  if (m(/\bcity\b|current location|where are you (based|located)|\blocation\b/))
    return A(
      [p.identity.location.city, p.identity.location.region, p.identity.location.country]
        .filter(Boolean)
        .join(", "),
      "identity.location",
    );

  // ── links ────────────────────────────────────────────────────────────────
  if (m(/linkedin/)) return A(p.links.linkedin, "links.linkedin");
  if (m(/github/)) return A(p.links.github, "links.github");
  if (m(/portfolio|personal ?(web)?site|website|url/)) {
    const v = p.links.portfolio || p.links.website || p.links.github;
    return A(v, p.links.portfolio ? "links.portfolio" : "links.github", Boolean(p.links.portfolio));
  }

  // ── work logistics ───────────────────────────────────────────────────────
  if (m(/notice period/))
    return A(`${p.work.noticePeriodDays} days`, "work.noticePeriodDays");
  if (m(/start date|when can you start|availability|available to start|earliest/))
    return p.work.earliestStartDate
      ? A(p.work.earliestStartDate, "work.earliestStartDate")
      : A(`~${p.work.noticePeriodDays} days from an offer`, "work.noticePeriodDays", false);
  if (m(/years? of (professional )?experience|how many years|yoe/))
    return A(String(p.work.yearsExperience), "work.yearsExperience");
  if (m(/current (job )?title|current role/))
    return A(p.work.currentTitle, "work.currentTitle");
  if (m(/relocat/))
    return A(
      p.work.willingToRelocate ? "Yes" : "No — I'm looking for fully remote roles.",
      "work.willingToRelocate",
    );
  if (m(/remote|work from home|onsite|hybrid/))
    return A(
      p.work.remoteOnly ? "Remote only" : "Open to remote or hybrid",
      "work.remoteOnly",
    );

  // ── authorization / sponsorship ──────────────────────────────────────────
  if (m(/sponsor/)) {
    const region = regionFromLabel(q);
    if (region === "default")
      return A(yesNo(p.screening.requiresSponsorship), "screening.requiresSponsorship");
    return A(yesNo(authFor(region, p).needsSponsorship), `authorization.${region}.needsSponsorship`);
  }
  if (m(/authori[sz]ed to work|legally (authori[sz]ed|entitled|able) to work|right to work|work permit|work authori[sz]ation|eligible to work/)) {
    const region = regionFromLabel(q);
    const a = authFor(region, p);
    const val =
      a.status === "citizen"
        ? "Yes"
        : a.status === "authorized"
          ? "Yes"
          : region === "default"
            ? "I'm based in India and open to fully-remote roles; I would need sponsorship for a country-specific work permit."
            : "No — I would require visa sponsorship.";
    return A(val, `authorization.${region}.status`, region !== "default");
  }

  // ── compensation ─────────────────────────────────────────────────────────
  if (m(/salary|compensation|expected (ctc|pay|rate|salary)|pay expectation|rate expectation|desired (salary|compensation)/))
    return A(
      compExpectation(p),
      "compensation",
      p.compensation.expectationMin != null || p.compensation.expectationMax != null,
    );
  if (m(/current (ctc|salary|compensation)/))
    return p.compensation.currentCtc != null
      ? A(money(p.compensation.currentCtc, p.compensation.currency), "compensation.currentCtc")
      : A("Prefer not to disclose", "compensation.currentCtc", false);

  // ── EEO / voluntary ──────────────────────────────────────────────────────
  if (m(/gender/)) return A(p.eeo.gender, "eeo.gender");
  if (m(/hispanic|latino|latinx/)) return A(p.eeo.hispanicLatino, "eeo.hispanicLatino");
  if (m(/race|ethnicit/)) return A(p.eeo.race, "eeo.race");
  if (m(/veteran|military service/)) return A(p.eeo.veteranStatus, "eeo.veteranStatus");
  if (m(/disab/)) return A(p.eeo.disabilityStatus, "eeo.disabilityStatus");

  // ── screening ────────────────────────────────────────────────────────────
  if (m(/how did you (hear|find|learn)/))
    return A(p.screening.howDidYouHear, "screening.howDidYouHear");
  if (m(/over ?18|at least 18|18 years|age of majority/))
    return A(yesNo(p.screening.over18), "screening.over18");
  if (m(/background check|background screening/))
    return A(yesNo(p.screening.canPassBackgroundCheck), "screening.canPassBackgroundCheck");
  if (m(/reference/)) return A("Available on request", "screening.referencesAvailable");
  if (m(/crimin|convicted|felony|been charged/))
    return A(yesNo(p.screening.criminalRecord), "screening.criminalRecord");

  return null;
}

/** Convenience: answers for a batch of field labels, keyed by label. */
export function answersFor(labels: string[], p: Profile): Record<string, Answer | null> {
  return Object.fromEntries(labels.map((l) => [l, answerFor(l, p)]));
}
