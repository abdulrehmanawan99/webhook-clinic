import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixtureSnapshot,
  fixtureIds,
  privateFixture,
  verifyFixtureBytes,
  redact,
  diagnose,
  sign,
  verify,
  destination,
} from "../server/domain.js";
const fixtures = () =>
  fixtureIds.map((id, i) =>
    fixtureSnapshot(
      id,
      {
        status: [401, 503, null][i],
        headers: {},
        body: [
          "signature mismatch",
          "receiver unavailable",
          "No response before deadline",
        ][i],
      },
      [20, 20, 150][i],
    ),
  );
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

test("original verification uses private exact fixture bytes, not a validity flag", () => {
  for (const id of fixtureIds) {
    const source = privateFixture(id);
    assert.equal(
      verifyFixtureBytes(source.raw, source.signature),
      id !== "evt_signature",
    );
    if (id !== "evt_signature")
      assert.equal(
        verifyFixtureBytes(source.raw + " ", source.signature),
        false,
      );
    const publicEvidence = JSON.stringify(fixtures());
    assert(!publicEvidence.includes(source.signature));
    assert(!publicEvidence.includes(source.raw));
    assert(!publicEvidence.includes("signatureValid"));
  }
});
