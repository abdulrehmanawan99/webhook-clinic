// Run explicitly against the local fixture app. Does not clear or drop data.
import assert from "node:assert/strict";
import { request } from "node:http";
import { MongoClient } from "mongodb";
const base = "http://127.0.0.1:8011/api";
const origin = "http://127.0.0.1:5174";
async function call(path: string, body?: unknown, customOrigin = origin) {
  const r = await fetch(
    base + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json", origin: customOrigin },
          body: JSON.stringify(body),
        },
  );
  return { status: r.status, data: await r.json() };
}
assert.equal((await call("/health")).status, 200);
const list = await call("/deliveries?limit=2");
assert.equal(list.data.items.length, 2);
assert.equal(list.data.total, 3);
assert.equal((await call("/deliveries?limit=999")).status, 400);
assert.equal((await call("/deliveries/unknown")).status, 400);
assert.equal(
  (
    await call(
      "/deliveries/evt_signature/diagnose",
      {},
      "https://untrusted.invalid",
    )
  ).status,
  403,
);
assert.equal(
  (await call("/deliveries/evt_signature/diagnose", { tool: "replay" })).status,
  400,
);
assert.equal(
  (await call("/deliveries/evt_signature/replay", { approval: "yes" })).status,
  400,
);
assert.equal(
  (
    await call("/deliveries/evt_signature/replay", {
      approval: "REPLAY LOCAL FIXTURE",
      destination: "http://example.invalid",
    })
  ).status,
  400,
);
const before = await call("/deliveries/evt_signature");
if (!before.data.diagnosis)
  assert.equal(
    (
      await call("/deliveries/evt_signature/replay", {
        approval: "REPLAY LOCAL FIXTURE",
      })
    ).status,
    409,
  );
const analysis = await call("/deliveries/evt_signature/diagnose", {});
assert.equal(analysis.data.findings.length, 3);
assert.equal(analysis.data.engine, "deterministic-receiver-v2");
for (const id of ["evt_signature", "evt_status", "evt_timeout"]) {
  const reproduced = await call(`/deliveries/${id}/reproduce`, {});
  assert.equal(reproduced.status, 200);
  const observation = reproduced.data.observation;
  assert.equal(observation.signatureVerification.valid, id !== "evt_signature");
  assert.equal(
    observation.response.status,
    id === "evt_signature" ? 401 : id === "evt_status" ? 503 : null,
  );
  if (id === "evt_timeout")
    assert(
      observation.durationMs >= observation.budgetMs &&
        observation.durationMs < 1500,
    );
  assert(!JSON.stringify(observation).includes("synthetic@example.invalid"));
  assert.equal(observation.signatureValid, undefined);
}
const selected = await call("/deliveries/evt_signature/investigate", {
  mode: "fixture",
});
assert.equal(selected.data.state, "succeeded");
assert.equal(selected.data.result.provider, "fixture");
assert.equal(
  (
    await call("/deliveries/evt_signature/investigate", {
      mode: "fixture",
      tool: "replay",
    })
  ).status,
  400,
);
const config = await call("/config");
if (!config.data.geminiAvailable)
  assert.equal(
    (await call("/deliveries/evt_signature/investigate", { mode: "gemini" }))
      .status,
    409,
  );
const oversized = await fetch(base + "/deliveries/evt_signature/replay", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ approval: "x".repeat(17000) }),
});
assert.equal(oversized.status, 413);
const malformed = await fetch(base + "/deliveries/evt_signature/replay", {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: "{",
});
assert.equal(malformed.status, 400);
const hostStatus = await new Promise<number>((resolve, reject) => {
  const req = request(
    base + "/health",
    { headers: { host: "untrusted.invalid" } },
    (r) => {
      r.resume();
      resolve(r.statusCode ?? 0);
    },
  );
  req.on("error", reject);
  req.end();
});
assert.equal(hostStatus, 403);
const responses = await Promise.all(
  Array.from({ length: 5 }, () =>
    call("/deliveries/evt_signature/replay", {
      approval: "REPLAY LOCAL FIXTURE",
    }),
  ),
);
assert(responses.every((r) => [200, 201, 409].includes(r.status)));
const retry = await call("/deliveries/evt_signature/replay", {
  approval: "REPLAY LOCAL FIXTURE",
});
assert.equal(retry.status, 200);
assert.equal(retry.data.deduplicated, true);
assert.equal(retry.data.audit.state, "succeeded");
assert.equal(retry.data.audit.status, 200);
const after = await call("/deliveries/evt_signature");
assert.deepEqual(after.data.delivery, before.data.delivery);
const receiver = await fetch("http://127.0.0.1:9011/receive", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
assert.equal(receiver.status, 401);
const mongo = new MongoClient(
  process.env.MONGO_URL ?? "mongodb://127.0.0.1:27018",
);
await mongo.connect();
try {
  const db = mongo.db(process.env.CLINIC_DATABASE ?? "webhook_clinic_v2");
  assert.equal(
    await db
      .collection("replay_audits")
      .countDocuments({ deliveryId: "evt_signature" }),
    1,
  );
  assert.equal(
    await db
      .collection("receiver_receipts")
      .countDocuments({ replayId: retry.data.audit.replayId }),
    1,
  );
  assert.equal(
    await db
      .collection("diagnoses")
      .countDocuments({ deliveryId: "evt_signature" }),
    1,
  );
} finally {
  await mongo.close();
}
console.log(
  "PASS: pagination, redaction boundary, approval/origin/target validation, diagnostics, concurrent replay dedupe, immutable evidence, signed receiver, retained audit and one receipt.",
);
