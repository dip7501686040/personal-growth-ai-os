import type { BaseAgent } from "./base-agent";
import { businessAgent } from "./business-agent";
import { careerAgent } from "./career-agent";
import { chiefOfStaffAgent } from "./chief-of-staff-agent";
import { contentAgent } from "./content-agent";
import { extractionAgent } from "./extraction-agent";
import { learningAgent } from "./learning-agent";
import { projectAgent } from "./project-agent";

/**
 * Agents that can be triggered (manually or by cron).
 *
 * `activity_analyzer` was retired (skill-graph-manager Phase 1) — Claude Code
 * activity capture is gone; `/sync-repo` is the only extraction pipeline now.
 * The agent file stays in the tree (deprecated) but is no longer registered.
 * `extractor` stays: it still distils manual `/knowledge` uploads (docs,
 * ChatGPT/LinkedIn exports), run on demand by the "Re-sync knowledge" button.
 */
export const AGENTS: Record<string, BaseAgent> = {
  learning: learningAgent,
  project: projectAgent,
  career: careerAgent,
  content: contentAgent,
  business: businessAgent,
  chief_of_staff: chiefOfStaffAgent,
  extractor: extractionAgent,
};

export function getAgent(name: string): BaseAgent | null {
  return AGENTS[name] ?? null;
}

export { BaseAgent } from "./base-agent";
export type { AgentResult, AgentContext } from "./types";
