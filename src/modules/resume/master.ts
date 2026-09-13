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
  oneLiner: string;
  bullets: MasterBullet[];
  /** archetype-flavored bullet set — same underlying facts, different emphasis/order.
   *  Falls back to `bullets` for any archetype not covered here. */
  bulletsByArchetype?: Partial<Record<ArchetypeKey, MasterBullet[]>>;
  tech: string[];
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
    const score = a.leadKeywords.filter((k) => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}
