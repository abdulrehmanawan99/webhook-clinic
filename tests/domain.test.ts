import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixtures,
  redact,
  diagnose,
  sign,
  verify,
  destination,
} from "../server/domain.js";
test("fixture secrets and identity data are sanitized recursively before persistence", () => {
  const data = JSON.stringify(fixtures());
  assert(!data.includes("synthetic@example.invalid"));
  assert(!data.includes("synthetic-invalid"));
  assert(data.includes("[REDACTED]"));
  assert.deepEqual(
    redact({ nested: [{ apiToken: "private", safe: "visible" }] }),
    { nested: [{ apiToken: "[REDACTED]", safe: "visible" }] },
  );
});
test("all three bounded diagnostics expose the source value and expected failure", () => {
  const cases = fixtures();
  assert.equal(diagnose(cases[0])[0].level, "fail");
  assert.equal(diagnose(cases[1])[1].level, "fail");
  assert.equal(diagnose(cases[2])[2].level, "fail");
  for (const d of cases) {
    const before = JSON.stringify(d);
    assert.equal(diagnose(d).length, 3);
    assert(diagnose(d).every((f) => f.evidence.length > 10));
    assert.equal(JSON.stringify(d), before);
  }
});
test("signature verification binds exact bytes and rejects malformed signatures", () => {
  const signature = sign('{"fixture":true}', "demo");
  assert(verify('{"fixture":true}', signature, "demo"));
  assert(!verify('{ "fixture":true}', signature, "demo"));
  assert(!verify("{}", "bad", "demo"));
  assert(!verify("{}", "a".repeat(64), "other"));
  assert.equal(destination, "http://127.0.0.1:9011/receive");
});
