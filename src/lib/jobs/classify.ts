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
