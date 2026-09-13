import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFileText, isR2Configured } from "@/modules/files/store";

export interface MasterExperience {
  role: string;
  company: string;
  location: string;
  period: string;
  bullets: string[];
  tech: string[];
}

export interface MasterBullet {
  text: string;
  /** "<project-slug>#<feature-slug>" of the real, synced portfolio card that
   *  backs this specific claim — verified against the actual projectFeatures
   *  table, not guessed from the bullet text. Omit when no shipped feature
   *  backs it (e.g. a project that was never synced to the portfolio) —
   *  never invent one just to fill the field. The project-slug prefix lets a
   *  bullet point at a different sub-project than the résumé entry's own
   *  `slug` (needed for the merged Platform Infra/GitOps entry, whose
   *  bullets are drawn from two separately-synced portfolio projects). */
  link?: string;
}

export interface MasterProject {
  name: string;
  slug: string;
  repoUrl: string | null;
  /** second repo, for a project entry that merges two repos (e.g. infra + GitOps). */
  repoUrl2?: string | null;
  /** an external write-up (Notion, PDF, etc.) for a project with no synced
   *  portfolio page — the Tech-line equivalent of a portfolio link for a
   *  project that can't get one. Labeled `docLabel`, default "Case study". */
  docUrl?: string | null;
  docLabel?: string;
  /** a real, live, interactive deployment of the project — distinct from
   *  `docUrl` (a static write-up). Labeled "Live". */
  liveUrl?: string | null;
  oneLiner: string;
  bullets: MasterBullet[];
  /** archetype-flavored bullet set — same underlying facts, different emphasis/order.
   *  Falls back to `bullets` for any archetype not covered here. */
  bulletsByArchetype?: Partial<Record<ArchetypeKey, MasterBullet[]>>;
  tech: string[];
  /** short, honest list of the real domain/skill phrases this project's own
   *  work demonstrates — used to rank/select which projects lead a tailored
   *  résumé for a given JD (see `render.ts`'s project scoring). Deliberately
   *  hand-curated rather than derived from `tech`/bullet text: a bag-of-words
   *  match against a JD's raw text is dominated by generic tech nouns
   *  (Kubernetes, TypeScript, AWS...) shared by most projects, and by
   *  coincidental hits (this candidate's own company/product name overlapping
   *  a JD's employer name). A term here should be something this project's
   *  bullets can actually back up — never add one just to chase a JD. */
  matchTerms?: string[];
}

export interface MasterEducation {
  degree: string;
  institution: string;
  period: string;
  note?: string;
}

export interface MasterArchetype {
  label: string;
  summaryKey: string;
  skillOrder: string[];
  leadKeywords: string[];
  projectOrder: string[];
}

export interface MasterResume {
  name: string;
  /** per-archetype title line, keyed like `summary` (plus "default"). */
  title: Record<string, string>;
  location: string;
  email: string;
  phone: string;
  github: string;
  linkedin: string;
  /** base URL for resolving each bullet's `link` ("<slug>#<feature>") into a
   *  full portfolio-card URL — so a recruiter who never sees a cover letter
   *  or proof-bundle (most portals don't ask) still lands on real proof for
   *  the specific claim, not just the résumé's own words. */
  portfolioUrl: string;
  yearsExperience: number;
  summary: Record<string, string>;
  skills: { label: string; items: string[] }[];
  experience: MasterExperience[];
  projects: MasterProject[];
  education: MasterEducation[];
  archetypes: Record<string, MasterArchetype>;
}

export const ARCHETYPES = ["backend", "platform", "ai-llm"] as const;
export type ArchetypeKey = (typeof ARCHETYPES)[number];

/** `my-files` R2 (source of truth) when configured, else the local file. */
export async function loadMaster(root = process.cwd()): Promise<MasterResume> {
  if (isR2Configured()) {
    try {
      const text = await getFileText("resume/master.json");
      if (text != null) return JSON.parse(text) as MasterResume;
    } catch {
      // bucket not provisioned / not reachable yet — fall through to local
    }
  }
  return JSON.parse(
    readFileSync(join(root, "resume", "master.json"), "utf8"),
  ) as MasterResume;
}

/** Whole-word match so a keyword can't hijack the pick via a substring
 *  collision inside an unrelated word ("rag" inside "leveraging") or a
 *  loose stem match against marketing boilerplate ("agent" inside "agents",
 *  "agentic") rather than an actual job requirement. */
function hasKeyword(lower: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
}

/** Pick the archetype whose lead keywords best cover the JD text. */
export function suggestArchetype(
  master: MasterResume,
  jdText: string,
): ArchetypeKey {
  const lower = jdText.toLowerCase();
  let best: ArchetypeKey = "backend";
  let bestScore = -1;
  for (const key of ARCHETYPES) {
    const a = master.archetypes[key];
    const score = a.leadKeywords.filter((k) => hasKeyword(lower, k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}
