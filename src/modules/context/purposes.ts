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
    defaultQuery: (s) =>
      [...s.inProgressSkills.map((k) => k.name), recentTopics(s, 3)]
        .filter(Boolean)
        .join(", ") || "recent engineering learning and practice",
  },
  career_match: {
    budgetTokens: 2600,
    knowledgeK: 8,
    knowledgeDocTypes: ["repo_summary", "decision", "concept", "profile"],
    defaultQuery: (s) => flatSkills(s, 20) || "proven engineering skills",
  },
  project_ideas: {
    budgetTokens: 2200,
    knowledgeK: 6,
    knowledgeDocTypes: ["repo_summary", "decision", "concept", "learning"],
    defaultQuery: (s) =>
      s.inProgressSkills.map((k) => k.name).join(", ") ||
      "skills to turn into projects",
  },
  content_draft: {
    budgetTokens: 1800,
    knowledgeK: 6,
    knowledgeDocTypes: ["learning", "decision", "concept", "repo_summary"],
    defaultQuery: (s) => recentTopics(s, 4) || "recent work worth writing about",
  },
  business_scan: {
    budgetTokens: 2200,
    knowledgeK: 6,
    knowledgeDocTypes: ["repo_summary", "concept", "decision"],
    defaultQuery: (s) => flatSkills(s, 15) || "solo-buildable technical skills",
  },
};
