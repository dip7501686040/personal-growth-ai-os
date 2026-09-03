import assert from "node:assert/strict";
import { test } from "node:test";
import { toGeminiSchema, toOpenAiSchema } from "../src/lib/llm/schema.ts";
import { MockProvider } from "../src/lib/llm/mock.ts";
import {
  CanonicalKnowledgeSchema,
  isEmptyCanonical,
} from "../src/modules/ingestion/canonical.ts";

const sample = {
  summary:
    "A notification service built with an event-sourced core and a Postgres projection store.",
  entities: {
    projects: [
      {
        name: "notification-service",
        description:
          "Multi-channel notification delivery with retry and an append-only delivery log.",
      },
    ],
    skills: [
      {
        name: "Event Sourcing",
        category: "concept",
        evidence: "delivery state is stored as an append-only event log",
        confidence: 0.8,
      },
      {
        name: "PostgreSQL",
        category: "database",
        evidence: "projections rebuilt from events into Postgres read models",
        confidence: 0.7,
      },
    ],
    concepts: [{ name: "CQRS", note: "write model vs read projections" }],
    decisions: [
      {
        title: "Use event sourcing for delivery state",
        rationale: "full audit trail and rebuildable read models",
      },
    ],
    learnings: [
      { topic: "projection lag", detail: "eventual consistency on dashboards" },
    ],
    tools: ["RabbitMQ"],
    achievements: ["cut duplicate sends to near zero"],
  },
  documents: [
    {
      docType: "decision",
      title: "Chose event sourcing for delivery state",
      body: "Delivery state (queued, sent, failed, retried) is an append-only event log. This gives a full audit trail and lets read models be rebuilt. The trade-off is more moving parts and eventual consistency on projections.",
    },
  ],
};

test("CanonicalKnowledgeSchema converts for both providers", () => {
  assert.doesNotThrow(() => toGeminiSchema(CanonicalKnowledgeSchema));
  assert.doesNotThrow(() => toOpenAiSchema(CanonicalKnowledgeSchema));
});

test("parses a well-formed canonical record", () => {
  const p = CanonicalKnowledgeSchema.parse(sample);
  assert.equal(p.entities.skills[0].name, "Event Sourcing");
  assert.equal(p.documents[0].docType, "decision");
  assert.equal(isEmptyCanonical(p), false);
});

test("rejects an out-of-range confidence and a bad category", () => {
  assert.throws(() =>
    CanonicalKnowledgeSchema.parse({
      ...sample,
      entities: {
        ...sample.entities,
        skills: [{ ...sample.entities.skills[0], confidence: 1.5 }],
      },
    }),
  );
  assert.throws(() =>
    CanonicalKnowledgeSchema.parse({
      ...sample,
      entities: {
        ...sample.entities,
        skills: [{ ...sample.entities.skills[0], category: "not-a-category" }],
      },
    }),
  );
});

test("isEmptyCanonical is true for an all-empty record", () => {
  const empty = CanonicalKnowledgeSchema.parse({
    summary: "nothing here",
    entities: {
      projects: [],
      skills: [],
      concepts: [],
      decisions: [],
      learnings: [],
      tools: [],
      achievements: [],
    },
    documents: [],
  });
  assert.equal(isEmptyCanonical(empty), true);
});

test("MockProvider round-trips the canonical record", async () => {
  const mock = new MockProvider({ structuredResponse: sample });
  const out = await mock.generateStructured({
    schema: CanonicalKnowledgeSchema,
    schemaName: "canonical_knowledge",
    prompt: "x",
    model: "mock",
  });
  assert.equal(out.data.summary, sample.summary);
  assert.equal(out.data.entities.skills.length, 2);
});
