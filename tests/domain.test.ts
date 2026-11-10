import { test } from "node:test";
import assert from "node:assert/strict";
import { receiverPort } from "../server/config.js";
import {
  captureFixture,
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
  assert.equal(destination, `http://127.0.0.1:${receiverPort}/receive`);
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

test("deadline signal classifies timeout even when measured elapsed rounds below budget", async (t) => {
  const clock = t.mock.method(performance, "now", () => 100);
  clock.mock.mockImplementationOnce(() => 249, 1);
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      const signal = options.signal!;
      // Keep the test alive: AbortSignal.timeout itself uses an unreferenced timer.
      const keepAlive = setTimeout(() => {}, 1000);
      try {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      } finally {
        clearTimeout(keepAlive);
      }
      throw new Error("unreachable");
    },
  );
  try {
    const observation = await captureFixture("evt_timeout");
    assert.equal(observation.durationMs, 149);
    assert.equal(observation.deadlineReached, true);
    const finding = diagnose(observation).find((f) => f.code === "timeout")!;
    assert.equal(finding.level, "fail");
    assert(finding.evidence.includes("deadlineReached = true"));
  } finally {
    t.mock.restoreAll();
  }
});

test("a transport failure before the deadline is not classified as a timeout", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("connection refused");
  });
  try {
    const observation = await captureFixture("evt_timeout");
    assert.equal(observation.deadlineReached, false);
    assert.equal(
      diagnose(observation).find((f) => f.code === "timeout")!.level,
      "pass",
    );
  } finally {
    t.mock.restoreAll();
  }
});
