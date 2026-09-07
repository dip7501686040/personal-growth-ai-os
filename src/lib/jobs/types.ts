export interface JobSearchConfig {
  /** role titles to search, e.g. "Senior Backend Engineer" */
  titles: string[];
  /** drop a posting whose title contains any of these (case-insensitive) */
  excludeTitles: string[];
  /** rough skill list for a keyword skill-match score (J5 uses get_proof_for_jd) */
  skills: string[];
  /** salary floor in LPA-equivalent; below → flag `low_salary` (not dropped) */
  minLpa: number;
  /** if true, non-remote postings are always flagged `onsite` → Group B */
  remoteOnly: boolean;
  /** Adzuna country codes to query (in, gb, us, …) */
  adzunaCountries: string[];
  /** cap results kept per source before merge */
  maxPerSource: number;
}

export interface RawJob {
  source: string;
  company: string;
  role: string;
  location: string | null;
  remote: boolean | null;
  salaryText: string | null;
  postedAt: string | null;
  url: string;
  applyUrl: string | null;
  /** recruiter/agency name if the poster differs from the hiring company */
  publisher: string | null;
  descriptionSnippet: string | null;
  contactEmail: string | null;
}

export type RemoteKind = "remote" | "onsite_foreign" | "onsite_india" | "unknown";
export type CompanyType =
  | "product"
  | "agency_named_client"
  | "agency_unnamed"
  | "body_shop"
  | "unknown";

export interface ScoredJob extends RawJob {
  roleKey: string;
  seenIn: string[];
  salaryLpa: number | null;
  remoteKind: RemoteKind;
  companyType: CompanyType;
  funding: { stage: string | null; note: string | null };
  contactName: string | null;
  flags: string[];
  replyLikelihood: number;
  skillMatch: number;
  score: number;
  group: "A" | "B";
}

export interface JobSearchResult {
  groupA: ScoredJob[];
  groupB: ScoredJob[];
  sourcesUsed: string[];
  sourcesSkipped: { source: string; reason: string }[];
  fetched: number;
  afterDedupe: number;
  usdInr: number;
}
