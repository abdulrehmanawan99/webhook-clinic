import { test } from "node:test";
import assert from "node:assert/strict";
import labels from "../evaluation/webhook-quality-v1.json";
import baseline from "../evaluation/gemini-baseline-2026-11-06.json";
import { score } from "../scripts/evaluate.js";
test("persisted live baseline scores against frozen development labels without inference", () => {
  const result = score(labels, baseline);
  assert.equal(result.passed, true);
  assert.equal(result.primaryCorrect, 3);
  assert.equal(result.citationCorrect, 7);
});
test("scorer rejects missing/duplicate cases and execution fields; fails incorrect cause or quote", () => {
  const missing = structuredClone(baseline);
  missing.results.pop();
  assert.throws(() => score(labels, missing));
  const duplicate = structuredClone(baseline);
  duplicate.results[1] = duplicate.results[0];
  assert.throws(() => score(labels, duplicate));
  const extra = structuredClone(baseline);
  assert.throws(() =>
    score(labels, { ...extra, destination: "http://example.invalid" }),
  );
  const unsupported = structuredClone(baseline);
  unsupported.results[0].selection.checks[0].evidenceQuote =
    "fabricated source";
  assert.equal(score(labels, unsupported).passed, false);
  const wrong = structuredClone(baseline);
  wrong.results[0].selection.primary = "status";
  assert.equal(score(labels, wrong).passed, false);
  const duplicatedCheck = structuredClone(baseline);
  duplicatedCheck.results[0].selection.checks.push(
    duplicatedCheck.results[0].selection.checks[0],
  );
  assert.throws(() => score(labels, duplicatedCheck));
});
