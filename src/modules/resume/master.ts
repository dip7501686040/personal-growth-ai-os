import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface MasterExperience {
  role: string;
  company: string;
  location: string;
  period: string;
  bullets: string[];
  tech: string[];
}

export interface MasterProject {
  name: string;
  slug: string;
  repoUrl: string | null;
  oneLiner: string;
  bullets: string[];
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
  title: string;
  location: string;
  email: string;
  phone: string;
  github: string;
  linkedin: string;
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

export function loadMaster(root = process.cwd()): MasterResume {
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
