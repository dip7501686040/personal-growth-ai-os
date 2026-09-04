import type { KnowledgeHit } from "@/lib/knowledge";
import type { RelatedKnowledgeHit } from "@/modules/knowledge/mapping";
import type { KnowledgeTargetType } from "@/modules/knowledge/target-types";
import type { PatternStat } from "@/modules/learning/pattern-stats";
import type { SkillLevel } from "@/modules/skills/levels";

export const CONTEXT_PURPOSES = [
  "learning_plan",
  "career_match",
  "project_ideas",
  "content_draft",
  "business_scan",
  "daily_briefing",
] as const;
export type ContextPurpose = (typeof CONTEXT_PURPOSES)[number];

export interface FocusEntity {
  targetType: KnowledgeTargetType;
  targetId: string;
}

export interface GetContextArgs {
  userId: string;
  purpose: ContextPurpose;
  /** Free-text focus for knowledge retrieval (e.g. a job description). */
  query?: string;
  /** Soft cap on the rendered prompt string. Defaults per purpose. */
  budgetTokens?: number;
  /**
   * Entities this context is specifically about (the opportunity being
   * matched, the project being advanced, ...). Their `accepted` knowledge_links
   * documents are pulled into a dedicated section ahead of generic retrieval,
   * and excluded from the generic section to avoid duplication.
   */
  focusEntities?: FocusEntity[];
}

export type SkillsByLevel = Record<SkillLevel, string[]>;

export interface InProgressSkill {
  name: string;
  level: string;
  category: string;
}
export interface RecentSession {
  topic: string;
  category: string;
  confidenceAfter: number | null;
  occurredAt: string;
}
export interface RecentAttempt {
  title: string;
  solved: boolean;
  hintsUsed: number;
  failureReason: string;
  attemptedAt: string;
}
export interface ActivityEvidenceItem {
  skill: string;
  summary: string;
}

/** Shared structured slice — every purpose gets at least this. */
export interface CoreSlice {
  skillsByLevel: SkillsByLevel;
  inProgressSkills: InProgressSkill[];
  recentSessions: RecentSession[];
  activityEvidence: ActivityEvidenceItem[];
}

/** learning_plan adds DSA + activity-count detail. */
export interface LearningSlice extends CoreSlice {
  activityCount: number;
  patternStats: PatternStat[];
  weakPatterns: PatternStat[];
  recentAttempts: RecentAttempt[];
}

export interface PersonalContext<S extends CoreSlice = CoreSlice> {
  purpose: ContextPurpose;
  generatedAt: string;
  /** Typed structured slice — hard facts from the app's own tables. */
  structured: S;
  /** Semantic recall from the knowledge base (empty until sources are ingested). */
  knowledge: KnowledgeHit[];
  /** Directly linked knowledge for `focusEntities` — empty unless the caller
   *  passed any and at least one has an accepted knowledge_links document. */
  related: RelatedKnowledgeHit[];
  /** Rough token count of `toPromptString()`. */
  tokenEstimate: number;
  /** True when sections were dropped to fit `budgetTokens`. */
  truncated: boolean;
  /** The context formatted for an LLM prompt, token-bounded. */
  toPromptString(): string;
}

export type LearningPlanContext = PersonalContext<LearningSlice>;
