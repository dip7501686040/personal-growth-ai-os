import { estimateTokens } from "@/lib/knowledge/chunk";
import type { KnowledgeHit } from "@/lib/knowledge/search";
import { LEVEL_LABEL, SKILL_LEVELS } from "@/modules/skills/levels";
import type { ContextPurpose, CoreSlice, LearningSlice } from "./types";

export interface Section {
  title: string;
  body: string;
  /** Lower renders first and survives budget trimming. */
  priority: number;
}

function skillsBlock(slice: CoreSlice): string {
  const lines: string[] = [];
  for (const level of [...SKILL_LEVELS].reverse()) {
    const names = slice.skillsByLevel[level];
    if (names.length) lines.push(`- ${LEVEL_LABEL[level]}: ${names.join(", ")}`);
  }
  return lines.join("\n");
}

function knowledgeBlock(hits: KnowledgeHit[]): string {
  return hits
    .map((h) => {
      const excerpt = h.content.replace(/\s+/g, " ").slice(0, 320).trim();
      return `- [${h.docType}] ${h.title}: ${excerpt}`;
    })
    .join("\n");
}

function isLearningSlice(s: CoreSlice): s is LearningSlice {
  return "weakPatterns" in s;
}

/** Ordered sections for a purpose. Empty bodies are dropped by the renderer. */
export function buildSections(
  purpose: ContextPurpose,
  slice: CoreSlice,
  knowledge: KnowledgeHit[],
): Section[] {
  const sections: Section[] = [
    { title: "Skills by level", body: skillsBlock(slice), priority: 1 },
    {
      title: "In progress now",
      body: slice.inProgressSkills
        .map((k) => `- ${k.name} (${k.level}, ${k.category})`)
        .join("\n"),
      priority: 2,
    },
    {
      title: "Recent learning sessions",
      body: slice.recentSessions
        .map(
          (s) =>
            `- ${s.occurredAt} ${s.topic} (${s.category})` +
            (s.confidenceAfter != null
              ? ` — confidence ${s.confidenceAfter}/5`
              : ""),
        )
        .join("\n"),
      priority: 4,
    },
    {
      title: "Evidence from real development activity",
      body: slice.activityEvidence
        .map((e) => `- [${e.skill}] ${e.summary}`)
        .join("\n"),
      priority: 5,
    },
    {
      title: "Relevant past knowledge",
      body: knowledgeBlock(knowledge),
      priority: 7,
    },
  ];

  if (purpose === "learning_plan" && isLearningSlice(slice)) {
    sections.push(
      {
        title: "DSA pattern stats",
        body: slice.patternStats.length
          ? JSON.stringify(
              slice.patternStats.map((p) => ({
                pattern: p.name,
                attempts: p.attempts,
                solveRate: p.solveRate,
                avgHints: p.avgHints,
                couldNotIdentify: p.couldNotIdentify,
                recognitionGap: p.recognitionGap,
              })),
            )
          : "",
        priority: 3,
      },
      {
        title: "Weakest DSA patterns (ranked)",
        body: slice.weakPatterns
          .map(
            (p) =>
              `- ${p.name}: ${p.attempts} attempts, ${Math.round(
                p.solveRate * 100,
              )}% solved, avg ${p.avgHints} hints` +
              (p.recognitionGap
                ? `, "couldn't identify the pattern" on ${p.couldNotIdentify} — recognition gap`
                : ""),
          )
          .join("\n"),
        priority: 3,
      },
      {
        title: "Recent DSA attempts",
        body: slice.recentAttempts
          .map(
            (a) =>
              `- ${a.attemptedAt} ${a.title} — ${
                a.solved ? "solved" : "unsolved"
              }, ${a.hintsUsed} hints, reason: ${a.failureReason}`,
          )
          .join("\n"),
        priority: 6,
      },
    );
  }

  return sections;
}

export interface RenderResult {
  text: string;
  tokenEstimate: number;
  truncated: boolean;
}

/** Render sections in priority order, stopping once the budget is hit. */
export function renderSections(
  sections: Section[],
  budgetTokens: number,
): RenderResult {
  const ordered = sections
    .filter((s) => s.body.trim().length > 0)
    .sort((a, b) => a.priority - b.priority);

  const parts: string[] = [];
  let tokens = 0;
  let truncated = false;

  for (const s of ordered) {
    const block = `## ${s.title}\n${s.body.trim()}`;
    const cost = estimateTokens(block);
    if (parts.length > 0 && tokens + cost > budgetTokens) {
      truncated = true;
      continue;
    }
    parts.push(block);
    tokens += cost;
  }

  return { text: parts.join("\n\n"), tokenEstimate: tokens, truncated };
}
