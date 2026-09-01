/** Skill progression ladder. Pure module — safe to import from client code. */

export const SKILL_LEVELS = [
  "interested",
  "learning",
  "practiced",
  "implemented",
  "proven",
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_CATEGORIES = [
  "language",
  "framework",
  "database",
  "infrastructure",
  "concept",
  "tool",
  "practice",
  "dsa_pattern",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const EVIDENCE_STRENGTHS = ["weak", "moderate", "strong"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export function levelRank(level: SkillLevel): number {
  return SKILL_LEVELS.indexOf(level);
}

export function maxLevel(a: SkillLevel, b: SkillLevel): SkillLevel {
  return levelRank(a) >= levelRank(b) ? a : b;
}

export const LEVEL_LABEL: Record<SkillLevel, string> = {
  interested: "Interested",
  learning: "Learning",
  practiced: "Practiced",
  implemented: "Implemented",
  proven: "Proven",
};

export const CATEGORY_LABEL: Record<SkillCategory, string> = {
  language: "Languages",
  framework: "Frameworks",
  database: "Databases",
  infrastructure: "Infrastructure",
  concept: "Concepts",
  tool: "Tools",
  practice: "Practices",
  dsa_pattern: "DSA Patterns",
};

/** Tailwind classes for a level badge. */
export const LEVEL_BADGE_CLASS: Record<SkillLevel, string> = {
  interested: "bg-muted text-muted-foreground",
  learning: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  practiced:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  implemented:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  proven:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

/** Only these levels strongly influence the Career agent. */
export const CAREER_RELEVANT_LEVELS: readonly SkillLevel[] = [
  "implemented",
  "proven",
];
