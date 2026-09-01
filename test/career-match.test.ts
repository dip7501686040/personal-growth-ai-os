import assert from "node:assert/strict";
import { test } from "node:test";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import { CareerMatchSchema } from "../src/modules/agents/career-match-schema.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";

const sample = {
  overallScore: 62,
  recommendation: "maybe",
  summary: "Solid backend match; Kafka and production AWS are the gaps.",
  provenMatches: ["Node.js"],
  implementedMatches: ["NestJS", "PostgreSQL", "Docker"],
  partialMatches: [{ skill: "AWS", have: "learning", note: "only learning" }],
  aspirationalMatches: ["Kafka"],
  missingSkills: ["Terraform"],
  gapClosingWork: [
    { gap: "No Kafka proof", suggestion: "Add a Kafka consumer feature to the notification project." },
  ],
  rationale: "3 of 5 core requirements are implementation-backed; 2 are not.",
};

test("CareerMatchSchema converts for both providers", () => {
  assert.doesNotThrow(() => toGeminiSchema(CareerMatchSchema));
  assert.doesNotThrow(() => toOpenAiSchema(CareerMatchSchema));
});

test("parses a well-formed match", () => {
  const p = CareerMatchSchema.parse(sample);
  assert.equal(p.overallScore, 62);
  assert.equal(p.recommendation, "maybe");
  assert.equal(p.partialMatches[0].skill, "AWS");
});

test("rejects out-of-range score", () => {
  assert.throws(() => CareerMatchSchema.parse({ ...sample, overallScore: 140 }));
});

test("rejects bad recommendation", () => {
  assert.throws(() =>
    CareerMatchSchema.parse({ ...sample, recommendation: "definitely" }),
  );
});

test("MockProvider round-trips the match", async () => {
  const mock = new MockProvider({ structuredResponse: sample });
  const out = await mock.generateStructured({
    schema: CareerMatchSchema,
    schemaName: "career_match",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.implementedMatches.length, 3);
});
