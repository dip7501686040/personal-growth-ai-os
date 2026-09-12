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
  /** Adzuna country codes to query, most important first (us, gb, de, …) */
  adzunaCountries: string[];
  /** how many of `adzunaCountries` to query per run (default 6; rotate the list
   *  over the week if you want fuller coverage without the API-call cost) */
  adzunaMaxCountries?: number;
  /** Countries/regions you'd actually take a remote role in (human names).
   *  A posting that names a country outside this set — and isn't
   *  worldwide/anywhere — is flagged `region_restricted` → Group B. */
  targetCountries?: string[];
  /** bias ranking toward companies with a detectable funding signal:
   *  strong signal → score bump, weak/negative → penalty, unknown → small nudge. */
  preferFunded?: boolean;
  /** cap results kept per source before merge */
  maxPerSource: number;
  /** how many titles SerpApi's google_jobs search spends a request on (default 3) */
  serpapiMaxQueries?: number;
  /** blend the knowledge-graph match into `skillMatch` (default true) */
  useGraphMatch?: boolean;
  /** cap on per-run graph-match embedding calls (default 50) */
  graphMatchLimit?: number;
  /** extra source-query terms derived from the graph — set at runtime by
   *  `runJobSearch`, never in `resume/job-search.json`. */
  graphTitles?: string[];
  /** technologies/specializations you've explicitly rejected a job over
   *  before (e.g. "NetApp", primary Java/Go) — a JD mentioning one gets
   *  flagged `hard_skill_gap:<term>` → Group B, instead of ranking clean in
   *  Group A. Grown from real /apply-drive rejections, not guessed upfront. */
  hardSkillGaps?: string[];
}

/** One job's knowledge-graph match — from the same matcher `get_proof_for_jd` uses. */
export interface GraphMatch {
  /** 0..1, blended into `skillMatch` as `max(substring, this)` */
  score: number;
  skills: { name: string; score: number }[];
  features: { title: string; score: number }[];
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
  /** full-time / contract / freelance / … when the source states it */
  employmentType?: string | null;
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
  /** final skill match — `max(substringSkillMatch, graphMatch ?? 0)` */
  skillMatch: number;
  /** keyword-only match against `job-search.json`'s `skills` */
  substringSkillMatch: number;
  /** knowledge-graph match score, or null when not computed for this job */
  graphMatch: number | null;
  /** skills the graph matcher hit in this JD (for the provenance file) */
  graphSkills: { name: string; score: number }[];
  graphFeatures: { title: string; score: number }[];
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
  /** extra query terms the knowledge graph contributed this run */
  graphTerms: string[];
  /** how many jobs got a knowledge-graph score */
  graphMatched: number;
}
