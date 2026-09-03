import type { BaseAgent } from "./base-agent";
import { activityAnalyzerAgent } from "./activity-analyzer-agent";
import { businessAgent } from "./business-agent";
import { careerAgent } from "./career-agent";
import { chiefOfStaffAgent } from "./chief-of-staff-agent";
import { contentAgent } from "./content-agent";
import { extractionAgent } from "./extraction-agent";
import { learningAgent } from "./learning-agent";
import { projectAgent } from "./project-agent";

/** Agents that can be triggered (manually or by cron). Grows each phase. */
export const AGENTS: Record<string, BaseAgent> = {
  learning: learningAgent,
  project: projectAgent,
  career: careerAgent,
  content: contentAgent,
  business: businessAgent,
  chief_of_staff: chiefOfStaffAgent,
  activity_analyzer: activityAnalyzerAgent,
  extractor: extractionAgent,
};

export function getAgent(name: string): BaseAgent | null {
  return AGENTS[name] ?? null;
}

export { BaseAgent } from "./base-agent";
export type { AgentResult, AgentContext } from "./types";
