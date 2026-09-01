import assert from "node:assert/strict";
import { test } from "node:test";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import { ProjectPlanSchema } from "../src/modules/agents/project-plan-schema.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";

const sample = {
  portfolioGaps: [
    { gap: "No distributed-systems proof", why: "RabbitMQ learned but never shipped." },
  ],
  projectIdeas: [
    {
      name: "AI Agent Orchestrator",
      pitch: "Proves distributed coordination + agent design.",
      problemSolved: "Coordinating long-running AI tasks with human approval.",
      buildComplexity: "medium",
      targetSkills: ["RabbitMQ", "Event-Driven Architecture", "AI Agents"],
      suggestedFeatures: [
        { title: "Task queue with retries + DLQ", skills: ["RabbitMQ", "Retry Patterns"] },
        { title: "Human-in-the-loop approval gate", skills: ["System Design"] },
      ],
    },
  ],
  existingProjectNextSteps: [
    { project: "Notification Platform", suggestion: "Mark the DLQ feature done and link skills." },
  ],
};

test("ProjectPlanSchema converts for both providers", () => {
  assert.doesNotThrow(() => toGeminiSchema(ProjectPlanSchema));
  assert.doesNotThrow(() => toOpenAiSchema(ProjectPlanSchema));
});

test("ProjectPlanSchema parses a well-formed plan", () => {
  const parsed = ProjectPlanSchema.parse(sample);
  assert.equal(parsed.projectIdeas[0].buildComplexity, "medium");
  assert.equal(parsed.projectIdeas[0].suggestedFeatures.length, 2);
});

test("MockProvider round-trips the project plan", async () => {
  const mock = new MockProvider({ structuredResponse: sample });
  const out = await mock.generateStructured({
    schema: ProjectPlanSchema,
    schemaName: "project_plan",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.portfolioGaps[0].gap, "No distributed-systems proof");
});

test("rejects a plan with zero project ideas", () => {
  assert.throws(() =>
    ProjectPlanSchema.parse({ ...sample, projectIdeas: [] }),
  );
});
