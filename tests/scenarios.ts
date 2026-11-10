// Stops/starts ONLY this project's isolated Docker services. App ports must be free.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import {
  apiBase,
  apiPort,
  mongoUrl,
  receiverBase,
  receiverPort,
  uiOrigin,
} from "../server/config.js";
const exec = promisify(execFile);
const base = `${apiBase}/api`;
const database = `webhook_clinic_v2_test_${randomUUID().replaceAll("-", "")}`;
const mongo = new MongoClient(mongoUrl, {
  serverSelectionTimeoutMS: 3000,
});
let child: ReturnType<typeof spawn> | undefined;
let forbiddenHits = 0;
const trap = createServer((_req, res) => {
  forbiddenHits++;
  res.end("must not be reached");
});
async function freePort(port: number) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}
async function call(path: string, body?: unknown) {
  const response = await fetch(base + path, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: uiOrigin,
          },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(6000),
  });
  return { status: response.status, data: await response.json() };
}
async function ready() {
  for (let i = 0; i < 80; i++) {
    if (child && child.exitCode !== null)
      throw new Error(`Test app exited with code ${child.exitCode}`);
    try {
      if ((await call("/health")).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Test app did not become ready");
}
async function start(mode: string) {
  console.log(`SCENARIO: starting receiver mode ${mode}`);
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      CLINIC_DATABASE: database,
      CLINIC_TEST_RECEIVER_MODE: mode,
      GEMINI_API_KEY: "",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code, signal) =>
    console.log(`SCENARIO: app exited (code=${code}, signal=${signal})`),
  );
  await ready();
  console.log("SCENARIO: app ready");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const current = child;
  await new Promise<void>((resolve) => {
    current.once("exit", () => resolve());
    current.kill("SIGTERM");
  });
  child = undefined;
}
async function docker(...args: string[]) {
  console.log(`SCENARIO: docker compose ${args.join(" ")}`);
  await exec("docker", ["compose", ...args], {
    timeout: 45000,
    maxBuffer: 100000,
  });
}
try {
  await freePort(apiPort);
  await freePort(receiverPort);
  await new Promise<void>((resolve, reject) => {
    trap.once("error", reject);
    trap.listen(receiverPort + 1, "127.0.0.1", resolve);
  });
  await mongo.connect();
  await start("timeout");
  const db = mongo.db(database);
  console.log("SCENARIO: replay timeout and deduplication");
  await call("/deliveries/evt_signature/diagnose", {});
  const timeout = await call("/deliveries/evt_signature/replay", {
    approval: "REPLAY LOCAL FIXTURE",
  });
  assert.equal(timeout.data.audit.state, "uncertain");
  assert.equal(timeout.data.audit.status, null);
  const duplicate = await call("/deliveries/evt_signature/replay", {
    approval: "REPLAY LOCAL FIXTURE",
  });
  assert.equal(duplicate.data.audit.replayId, timeout.data.audit.replayId);
  assert.equal(duplicate.data.deduplicated, true);
  assert.equal(
    await db
      .collection("receiver_receipts")
      .countDocuments({ deliveryId: "evt_signature" }),
    1,
  );
  // Simulate the durable checkpoint left by termination immediately after approval insert.
  console.log("SCENARIO: retained approval checkpoint");
  await call("/deliveries/evt_status/diagnose", {});
  const crashId = randomUUID();
  await db.collection("replay_audits").insertOne({
    deliveryId: "evt_status",
    replayId: crashId,
    state: "pending",
    approvedAt: new Date().toISOString(),
    destination: `${receiverBase}/receive`,
    approval: "explicit-local-fixture",
    status: null,
    detail: "Test: process terminated after approval checkpoint.",
  });
  const pending = await call("/deliveries/evt_status/replay", {
    approval: "REPLAY LOCAL FIXTURE",
  });
  assert.equal(pending.data.audit.state, "pending");
  assert.equal(pending.data.deduplicated, true);
  assert.equal(
    await db
      .collection("receiver_receipts")
      .countDocuments({ replayId: crashId }),
    0,
  );
  await call("/deliveries/evt_timeout/diagnose", {});
  console.log("SCENARIO: Redis outage before replay");
  await docker("stop", "redis");
  const startTime = performance.now();
  const offline = await call("/deliveries/evt_timeout/replay", {
    approval: "REPLAY LOCAL FIXTURE",
  });
  assert.equal(offline.status, 503);
  assert(performance.now() - startTime < 3000);
  assert.equal(
    await db
      .collection("replay_audits")
      .countDocuments({ deliveryId: "evt_timeout" }),
    0,
  );
  await docker("up", "-d", "--wait", "redis");
  await ready();
  console.log("SCENARIO: Mongo outage and recovery");
  await docker("stop", "mongo");
  const unavailable = await call("/deliveries/evt_signature");
  assert.equal(unavailable.status, 503);
  await docker("up", "-d", "--wait", "mongo");
  await ready();
  await stop();
  await start("redirect");
  console.log("SCENARIO: redirect rejection and checkpoint after restart");
  const redirect = await call("/deliveries/evt_timeout/replay", {
    approval: "REPLAY LOCAL FIXTURE",
  });
  assert.equal(redirect.data.audit.state, "uncertain");
  assert.equal(forbiddenHits, 0);
  const retained = await call("/deliveries/evt_status");
  assert.equal(retained.data.audit.replayId, crashId);
  assert.equal(retained.data.audit.state, "pending");
  console.log(
    "PASS: actual replay timeout with dedupe, crash-checkpoint restart retention, Redis outage fails before audit/send, Mongo outage returns controlled error, redirect destination receives zero requests.",
  );
} finally {
  await stop();
  await docker("up", "-d", "--wait", "mongo", "redis");
  await new Promise<void>((resolve) => trap.close(() => resolve()));
  // Only the uniquely named database created by this invocation is disposable.
  await mongo
    .db(database)
    .dropDatabase()
    .catch(() => {});
  await mongo.close();
}
