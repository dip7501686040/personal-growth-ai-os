import type { CompanyType, RawJob, RemoteKind } from "./types";

const INDIA =
  /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurgaon|gurugram|chennai|kolkata|ahmedabad|remote india)\b/i;

export function remoteKindOf(j: RawJob): RemoteKind {
  const loc = (j.location ?? "").toLowerCase();
  const text = `${loc} ${j.descriptionSnippet ?? ""}`.toLowerCase();
  if (j.remote === true || /\bfully remote|100% remote|remote[- ]first|work from anywhere\b/.test(text)) {
    return "remote";
  }
  if (!j.location && j.remote !== false) return "remote";
  if (INDIA.test(loc)) return "onsite_india";
  if (j.location) return "onsite_foreign";
  return "unknown";
}

const STAFFING_NAME =
  /\b(staffing|talent|consultanc|recruit|resourc|manpower|hire|placements?|infotech|it\s*services|technolabs?)\b/i;
const CLIENT_LANG =
  /\b(our client|on behalf of (a|our)|for (a|our) client|client of ours|a leading (mnc|company)|reputed (client|company)|product[- ]based company)\b/i;
const NAMED_CLIENT = /\bour client[, ]+([A-Z][\w& .-]{2,40})\b/;
const BODY_SHOP =
  /\b(c2c|c2h|corp[- ]to[- ]corp|contract to hire|contract-to-hire|bench\b|deputation|third[- ]party payroll|on\s?site at (the )?client|client (location|site))\b/i;

export function companyTypeOf(j: RawJob): {
  companyType: CompanyType;
  namedClient: string | null;
} {
  const snip = j.descriptionSnippet ?? "";
  const name = j.company ?? "";
  const publisher = j.publisher ?? "";

  if (BODY_SHOP.test(snip)) return { companyType: "body_shop", namedClient: null };

  const named = snip.match(NAMED_CLIENT);
  if (named && /\b(based in|located in|location|office in|onsite)\b/i.test(snip)) {
    return { companyType: "agency_named_client", namedClient: named[1].trim() };
  }
  if (CLIENT_LANG.test(snip)) {
    return named
      ? { companyType: "agency_named_client", namedClient: named[1].trim() }
      : { companyType: "agency_unnamed", namedClient: null };
  }
  if (STAFFING_NAME.test(name) || STAFFING_NAME.test(publisher)) {
    return { companyType: "agency_unnamed", namedClient: null };
  }
  if (
    /\b(our (product|platform|users|customers|engineering team|saas|api|sdk|app)|we(?:'re| are)? (build|building|make|making|develop|building an?)|building (a|an|our|the)|our suite of|founded to)\b/i.test(
      snip,
    )
  ) {
    return { companyType: "product", namedClient: null };
  }
  return { companyType: "unknown", namedClient: null };
}

const FUNDING =
  /(series\s+[a-e]\b|seed(?:\s+round)?|pre[- ]seed|\$[\d.]+\s?[mMbB]\+?(?:\s*(?:raised|in funding|growth equity|round))?|raised\s+(?:a\s+)?\$?[\d.]+\s?[mMbB]|backed by [A-Z][\w &]+|y ?combinator|yc\s+[swf]\d{2}|bootstrapped|profitable)/i;
const FUNDING_NEG = /\b(layoffs?|winding down|shutting down|down round|ceased operations)\b/i;

export function fundingOf(j: RawJob): {
  stage: string | null;
  note: string | null;
  weak: boolean;
} {
  const snip = `${j.company} ${j.descriptionSnippet ?? ""}`;
  if (FUNDING_NEG.test(snip)) {
    return { stage: null, note: snip.match(FUNDING_NEG)![0], weak: true };
  }
  const m = snip.match(FUNDING);
  return m ? { stage: m[0], note: m[0], weak: false } : { stage: null, note: null, weak: false };
}

// ── region fit ────────────────────────────────────────────────────────────

/** User's hard "never" list plus places remote roles almost never hire from. */
const EXCLUDED_REGION = /\b(china|\bprc\b|mainland china|pakistan|afghanistan)\b/i;
const WORLDWIDE =
  /\b(worldwide|work from anywhere|anywhere in the world|global(?:ly)?|international|any country|any location|no location restriction|location:? *remote)\b/i;
/** Broad regions that overlap the user's target set — a posting scoped to one
 *  of these is fine even if it also names a single country outside the list. */
const OK_REGION =
  /\b(europe|european|eu\b|emea|eea|schengen|americas?|north america|latam|latin america|apac|asia[- ]?pacific|worldwide)\b/i;

/** Country names we can recognise in a location string. Aliases fold to a key. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "us", "u.s.": "us", "u.s.a": "us", "united states": "us", america: "us", us: "us",
  uk: "uk", "u.k.": "uk", "united kingdom": "uk", britain: "uk", england: "uk", "great britain": "uk",
  uae: "uae", "united arab emirates": "uae", dubai: "uae", "abu dhabi": "uae",
  "the netherlands": "netherlands", holland: "netherlands",
  "czech republic": "czechia", czechia: "czechia",
};
const KNOWN_COUNTRIES = [
  "united states", "usa", "canada", "mexico", "united kingdom", "uk", "britain", "england",
  "ireland", "germany", "france", "spain", "portugal", "italy", "netherlands", "holland",
  "belgium", "austria", "switzerland", "sweden", "norway", "denmark", "finland", "iceland",
  "poland", "czech republic", "czechia", "romania", "greece", "estonia", "lithuania", "latvia",
  "india", "united arab emirates", "uae", "dubai", "singapore", "malaysia", "indonesia",
  "thailand", "vietnam", "philippines", "japan", "south korea", "taiwan", "hong kong",
  "china", "pakistan", "afghanistan", "bangladesh", "sri lanka", "nepal",
  "australia", "new zealand", "brazil", "argentina", "colombia", "chile", "south africa",
  "nigeria", "kenya", "egypt", "israel", "turkey", "ukraine",
];

const norm = (s: string) => COUNTRY_ALIASES[s.trim().toLowerCase()] ?? s.trim().toLowerCase();

export function regionOf(
  j: RawJob,
  targetCountries: string[] | undefined,
): { excluded: boolean; restricted: boolean; note: string | null } {
  const loc = (j.location ?? "").toLowerCase();
  const text = `${loc} ${(j.descriptionSnippet ?? "").toLowerCase()}`;

  if (EXCLUDED_REGION.test(text)) {
    return { excluded: true, restricted: false, note: text.match(EXCLUDED_REGION)![0] };
  }
  if (!targetCountries?.length || !loc || WORLDWIDE.test(text) || OK_REGION.test(loc)) {
    return { excluded: false, restricted: false, note: null };
  }

  const wanted = new Set(targetCountries.map(norm));
  const namedInLoc = KNOWN_COUNTRIES.filter((c) => new RegExp(`\\b${c}\\b`).test(loc)).map(norm);
  if (namedInLoc.length === 0) {
    return { excluded: false, restricted: false, note: null }; // just a city / "Remote"
  }
  const anyWanted = namedInLoc.some((c) => wanted.has(c));
  return anyWanted
    ? { excluded: false, restricted: false, note: null }
    : { excluded: false, restricted: true, note: j.location };
}

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;

export function contactOf(j: RawJob): {
  email: string | null;
  name: string | null;
} {
  const snip = j.descriptionSnippet ?? "";
  const email = j.contactEmail ?? snip.match(EMAIL)?.[0] ?? null;
  const nm = snip.match(
    /\b(?:contact|reach out to|email|dm|message)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  );
  return { email, name: nm?.[1] ?? null };
}
