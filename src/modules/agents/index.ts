import type { BaseAgent } from "./base-agent";
import { careerAgent } from "./career-agent";
import { contentAgent } from "./content-agent";
import { learningAgent } from "./learning-agent";
import { projectAgent } from "./project-agent";

/** Agents that can be triggered (manually or by cron). Grows each phase. */
export const AGENTS: Record<string, BaseAgent> = {
  learning: learningAgent,
  project: projectAgent,
  career: careerAgent,
  content: contentAgent,
};

export function getAgent(name: string): BaseAgent | null {
  return AGENTS[name] ?? null;
}

export { BaseAgent } from "./base-agent";
export type { AgentResult, AgentContext } from "./types";
