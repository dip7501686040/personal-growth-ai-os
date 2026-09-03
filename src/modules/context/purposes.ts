import type { ContextPurpose, CoreSlice } from "./types";

export interface PurposeConfig {
  /** Default soft cap on the rendered prompt string. */
  budgetTokens: number;
  /** How many knowledge chunks to retrieve. */
  knowledgeK: number;
  /** Restrict retrieval to these knowledge doc types (undefined = all). */
  knowledgeDocTypes?: string[];
  /** Restrict retrieval to these source kinds (undefined = all). */
  knowledgeSourceKinds?: string[];
  /** RRF signal weights — bias toward semantic vs keyword match. */
  rrf: { vector: number; keyword: number };
  /** Recency half-life (days). Higher = old knowledge still counts. */
  halfLifeDays: number;
  /** Build the retrieval query when the caller passes none. */
  defaultQuery: (slice: CoreSlice) => string;
}

const flatSkills = (s: CoreSlice, n: number): string =>
  Object.values(s.skillsByLevel).flat().slice(0, n).join(", ");

const recentTopics = (s: CoreSlice, n: number): string =>
  s.recentSessions
    .slice(0, n)
    .map((x) => x.topic)
    .join(", ");

export const PURPOSES: Record<ContextPurpose, PurposeConfig> = {
  learning_plan: {
    budgetTokens: 2200,
    knowledgeK: 6,
    knowledgeDocTypes: ["learning", "concept", "decision", "repo_summary"],
    rrf: { vector: 1, keyword: 0.6 },
    halfLifeDays: 90, // recent study is what the plan builds on
    defaultQuery: (s) =>
      [...s.inProgressSkills.map((k) => k.name), recentTopics(s, 3)]
        .filter(Boolean)
        .join(", ") || "recent engineering learning and practice",
  },
  career_match: {
    budgetTokens: 2600,
    knowledgeK: 8,
    knowledgeDocTypes: ["repo_summary", "decision", "concept", "profile"],
    rrf: { vector: 1, keyword: 1 }, // JD keywords matter as much as meaning
    halfLifeDays: 400, // proven work doesn't expire
    defaultQuery: (s) => flatSkills(s, 20) || "proven engineering skills",
  },
  project_ideas: {
    budgetTokens: 2200,
    knowledgeK: 6,
    knowledgeDocTypes: ["repo_summary", "decision", "concept", "learning"],
    rrf: { vector: 1, keyword: 0.7 },
    halfLifeDays: 180,
    defaultQuery: (s) =>
      s.inProgressSkills.map((k) => k.name).join(", ") ||
      "skills to turn into projects",
  },
  content_draft: {
    budgetTokens: 1800,
    knowledgeK: 6,
    knowledgeDocTypes: ["learning", "decision", "concept", "repo_summary"],
    rrf: { vector: 0.9, keyword: 0.8 },
    halfLifeDays: 60, // write about what's fresh
    defaultQuery: (s) => recentTopics(s, 4) || "recent work worth writing about",
  },
  business_scan: {
    budgetTokens: 2200,
    knowledgeK: 6,
    knowledgeDocTypes: ["repo_summary", "concept", "decision"],
    rrf: { vector: 1, keyword: 0.6 },
    halfLifeDays: 240,
    defaultQuery: (s) => flatSkills(s, 15) || "solo-buildable technical skills",
  },
  daily_briefing: {
    budgetTokens: 2000,
    knowledgeK: 5,
    rrf: { vector: 1, keyword: 0.7 },
    halfLifeDays: 45, // the briefing is about right now
    defaultQuery: (s) =>
      [...s.inProgressSkills.map((k) => k.name), recentTopics(s, 3)]
        .filter(Boolean)
        .join(", ") || "current engineering focus and priorities",
  },
};
