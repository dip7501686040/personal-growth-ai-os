import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSections,
  renderSections,
  type Section,
} from "../src/modules/context/sections.ts";
import { PURPOSES } from "../src/modules/context/purposes.ts";
import type { LearningSlice } from "../src/modules/context/types.ts";

const emptyByLevel = {
  interested: [],
  learning: [],
  practiced: [],
  implemented: [],
  proven: [],
};

const learningSlice: LearningSlice = {
  skillsByLevel: {
    ...emptyByLevel,
    proven: ["TypeScript", "PostgreSQL"],
    learning: ["Kubernetes"],
  },
  inProgressSkills: [
    { name: "Kubernetes", level: "learning", category: "infrastructure" },
  ],
  recentSessions: [
    {
      topic: "Studied CSS grid",
      category: "technology",
      confidenceAfter: 4,
      occurredAt: "2026-09-01",
    },
  ],
  activityEvidence: [{ skill: "PostgreSQL", summary: "Wrote a recursive CTE" }],
  activityCount: 3,
  patternStats: [],
  weakPatterns: [
    {
      slug: "bfs",
      name: "BFS",
      attempts: 5,
      solved: 3,
      solveRate: 0.6,
      avgHints: 1.4,
      avgTimeMinutes: 22,
      couldNotIdentify: 3,
      implBugs: 0,
      lastAttemptedAt: "2026-09-01",
      recognitionGap: true,
    },
  ],
  recentAttempts: [
    {
      title: "Number of Islands",
      solved: false,
      hintsUsed: 2,
      failureReason: "could_not_identify_pattern",
      attemptedAt: "2026-09-01",
    },
  ],
};

test("buildSections(learning_plan) includes skills, weak patterns, and attempts", () => {
  const sections = buildSections("learning_plan", learningSlice, []);
  const titles = sections.map((s) => s.title);
  assert.ok(titles.includes("Skills by level"));
  assert.ok(titles.includes("Weakest DSA patterns (ranked)"));
  assert.ok(titles.includes("Recent DSA attempts"));

  const weak = sections.find((s) => s.title === "Weakest DSA patterns (ranked)");
  assert.match(weak!.body, /BFS/);
  assert.match(weak!.body, /recognition gap/);
});

test("renderSections drops empty-body sections", () => {
  const sections = buildSections("learning_plan", learningSlice, []);
  const { text } = renderSections(sections, 5000);
  // patternStats body is "" here → its heading must not appear
  assert.ok(!text.includes("## DSA pattern stats"));
  assert.ok(text.includes("## Skills by level"));
});

test("renderSections respects the token budget and flags truncation", () => {
  const big: Section[] = [
    { title: "A", body: "alpha ".repeat(50), priority: 1 },
    { title: "B", body: "bravo ".repeat(50), priority: 2 },
    { title: "C", body: "charlie ".repeat(400), priority: 3 },
  ];
  const { text, truncated, tokenEstimate } = renderSections(big, 120);
  assert.ok(text.includes("## A"));
  assert.ok(!text.includes("## C"), "the oversized low-priority section is dropped");
  assert.equal(truncated, true);
  assert.ok(tokenEstimate <= 120 + 40);
});

test("every purpose has a config with a usable default query", () => {
  const core = {
    skillsByLevel: { ...emptyByLevel, proven: ["Go"] },
    inProgressSkills: [
      { name: "Rust", level: "learning", category: "language" },
    ],
    recentSessions: [
      {
        topic: "ownership model",
        category: "technology",
        confidenceAfter: null,
        occurredAt: "2026-09-02",
      },
    ],
    activityEvidence: [],
  };
  for (const [name, cfg] of Object.entries(PURPOSES)) {
    const q = cfg.defaultQuery(core);
    assert.ok(q.length > 0, `${name} produced an empty default query`);
    assert.ok(cfg.budgetTokens > 0);
    assert.ok(cfg.knowledgeK > 0);
  }
});
