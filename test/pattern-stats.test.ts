import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePatternStats,
  rankWeakPatterns,
  type AttemptForStats,
} from "../src/modules/learning/pattern-stats.ts";

const PATTERNS = [
  { slug: "bfs", name: "BFS" },
  { slug: "dp", name: "Dynamic Programming" },
  { slug: "two_pointers", name: "Two Pointers" },
];

const mk = (o: Partial<AttemptForStats>): AttemptForStats => ({
  patternSlugs: ["bfs"],
  solved: true,
  hintsUsed: 0,
  timeTakenMinutes: 20,
  failureReason: "none",
  attemptedAt: "2026-08-01",
  ...o,
});

test("only patterns with attempts are returned", () => {
  const s = computePatternStats(PATTERNS, [mk({ patternSlugs: ["bfs"] })]);
  assert.equal(s.length, 1);
  assert.equal(s[0].slug, "bfs");
});

test("solve rate and avg hints", () => {
  const s = computePatternStats(PATTERNS, [
    mk({ solved: true, hintsUsed: 0 }),
    mk({ solved: false, hintsUsed: 2, failureReason: "other" }),
  ]);
  assert.equal(s[0].attempts, 2);
  assert.equal(s[0].solved, 1);
  assert.equal(s[0].solveRate, 0.5);
  assert.equal(s[0].avgHints, 1);
});

test("recognition gap: solves it but can't identify it", () => {
  const attempts = [
    mk({ solved: true, failureReason: "none" }),
    mk({ solved: true, failureReason: "could_not_identify_pattern" }),
    mk({ solved: true, failureReason: "could_not_identify_pattern" }),
    mk({ solved: false, failureReason: "could_not_identify_pattern" }),
  ];
  const s = computePatternStats(PATTERNS, attempts);
  assert.equal(s[0].recognitionGap, true);
  assert.equal(s[0].couldNotIdentify, 3);
});

test("no recognition gap when solve rate is low across the board", () => {
  const attempts = [
    mk({ solved: false, failureReason: "knew_pattern_impl_bug" }),
    mk({ solved: false, failureReason: "tle" }),
    mk({ solved: false, failureReason: "other" }),
  ];
  const s = computePatternStats(PATTERNS, attempts);
  assert.equal(s[0].recognitionGap, false);
});

test("rankWeakPatterns puts a recognition gap first", () => {
  const attempts: AttemptForStats[] = [
    // bfs: strong
    mk({ patternSlugs: ["bfs"], solved: true, hintsUsed: 0 }),
    mk({ patternSlugs: ["bfs"], solved: true, hintsUsed: 0 }),
    mk({ patternSlugs: ["bfs"], solved: true, hintsUsed: 0 }),
    // dp: recognition gap
    mk({ patternSlugs: ["dp"], solved: true, failureReason: "could_not_identify_pattern" }),
    mk({ patternSlugs: ["dp"], solved: true, failureReason: "could_not_identify_pattern" }),
    mk({ patternSlugs: ["dp"], solved: true, failureReason: "none" }),
  ];
  const ranked = rankWeakPatterns(computePatternStats(PATTERNS, attempts));
  assert.equal(ranked[0].slug, "dp");
});
