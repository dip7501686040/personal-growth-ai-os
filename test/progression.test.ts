import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveLevel,
  planLevelChange,
  type EvidenceLike,
} from "../src/modules/skills/progression.ts";

let n = 0;
const ev = (o: Partial<EvidenceLike>): EvidenceLike => ({
  id: `e${n++}`,
  sourceType: "manual",
  sourceId: null,
  supportsLevel: "practiced",
  strength: "moderate",
  ...o,
});

test("no evidence → interested", () => {
  assert.equal(deriveLevel([]).level, "interested");
});

test("manual evidence alone caps at practiced", () => {
  const d = deriveLevel([
    ev({ sourceType: "manual", supportsLevel: "implemented", strength: "moderate" }),
  ]);
  assert.equal(d.level, "practiced");
  assert.equal(d.claimed, "implemented");
  assert.equal(d.ambiguous, true);
});

test("learning-session evidence supports learning", () => {
  const d = deriveLevel([
    ev({ sourceType: "learning_session", supportsLevel: "learning" }),
  ]);
  assert.equal(d.level, "learning");
});

test("project_feature evidence reaches implemented", () => {
  const d = deriveLevel([
    ev({ sourceType: "project_feature", supportsLevel: "implemented", strength: "moderate" }),
  ]);
  assert.equal(d.level, "implemented");
});

test("activity_analysis (not weak) reaches implemented", () => {
  const d = deriveLevel([
    ev({ sourceType: "activity_analysis", supportsLevel: "implemented", strength: "moderate" }),
  ]);
  assert.equal(d.level, "implemented");
});

test("weak activity_analysis does NOT reach implemented", () => {
  const d = deriveLevel([
    ev({ sourceType: "activity_analysis", supportsLevel: "implemented", strength: "weak" }),
  ]);
  assert.equal(d.level, "practiced");
});

test("single project feature claiming proven is capped at implemented", () => {
  const d = deriveLevel([
    ev({ sourceType: "project_feature", supportsLevel: "proven", strength: "strong" }),
  ]);
  assert.equal(d.level, "implemented");
});

test("2 project features + activity reaches proven", () => {
  const d = deriveLevel([
    ev({ sourceType: "project_feature", sourceId: "f1", supportsLevel: "proven", strength: "moderate" }),
    ev({ sourceType: "project_feature", sourceId: "f2", supportsLevel: "implemented", strength: "moderate" }),
    ev({ sourceType: "activity_analysis", supportsLevel: "implemented", strength: "moderate" }),
  ]);
  assert.equal(d.level, "proven");
});

test("3 distinct project features reach proven without activity", () => {
  const d = deriveLevel([
    ev({ sourceType: "project_feature", sourceId: "f1", supportsLevel: "proven", strength: "moderate" }),
    ev({ sourceType: "project_feature", sourceId: "f2", supportsLevel: "proven", strength: "moderate" }),
    ev({ sourceType: "project_feature", sourceId: "f3", supportsLevel: "proven", strength: "moderate" }),
  ]);
  assert.equal(d.level, "proven");
});

test("strong manual override can reach implemented (approved-promotion path)", () => {
  const d = deriveLevel([
    ev({ sourceType: "manual", supportsLevel: "implemented", strength: "strong" }),
  ]);
  assert.equal(d.level, "implemented");
});

test("confidence rises with level and evidence", () => {
  const low = deriveLevel([ev({ supportsLevel: "learning", strength: "weak" })]);
  const high = deriveLevel([
    ev({ sourceType: "project_feature", sourceId: "a", supportsLevel: "proven", strength: "strong" }),
    ev({ sourceType: "project_feature", sourceId: "b", supportsLevel: "proven", strength: "strong" }),
    ev({ sourceType: "activity_analysis", supportsLevel: "implemented", strength: "strong" }),
  ]);
  assert.ok(high.confidence > low.confidence);
  assert.ok(high.confidence <= 100 && low.confidence >= 0);
});

// ── planLevelChange ────────────────────────────────────────────────────────

test("lateral / demotion applies immediately", () => {
  const p = planLevelChange(
    [ev({ sourceType: "project_feature", supportsLevel: "implemented" })],
    "learning",
  );
  assert.equal(p.kind, "apply");
});

test("one-step promotion below implemented applies", () => {
  const p = planLevelChange(
    [ev({ sourceType: "learning_session", supportsLevel: "learning" })],
    "practiced",
  );
  assert.equal(p.kind, "apply");
});

test("jump from interested to implemented needs approval", () => {
  const p = planLevelChange([], "implemented");
  assert.equal(p.kind, "needs_approval");
});

test("practiced → implemented without project/activity needs approval", () => {
  const p = planLevelChange(
    [ev({ sourceType: "manual", supportsLevel: "practiced" })],
    "implemented",
  );
  assert.equal(p.kind, "needs_approval");
});

test("practiced → proven needs approval (2-level jump)", () => {
  const p = planLevelChange(
    [ev({ sourceType: "project_feature", supportsLevel: "practiced" })],
    "proven",
  );
  assert.equal(p.kind, "needs_approval");
});
