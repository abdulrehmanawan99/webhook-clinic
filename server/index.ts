import {
  apiBase,
  apiPort,
  mongoUrl,
  receiverBase,
  receiverPort,
  redisUrl,
  uiOrigin,
} from "./config.js";
import express from "express";
import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  destination,
  fixtureIds,
  captureFixture,
  privateFixture,
  verifyFixtureBytes,
  diagnose,
  sign,
  verify,
} from "./domain.js";
import type { Delivery } from "./domain.js";
import {
  fixtureInvestigation,
  geminiInvestigation,
  geminiConfigured,
} from "./investigation.js";
const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 3000 });
const redis = createClient({
  url: redisUrl,
  disableOfflineQueue: true,
  commandsQueueMaxLength: 128,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: (retries) => Math.min(100 + retries * 100, 1000),
  },
});
redis.on("error", () =>
  console.error("Redis unavailable; replay coordination fails closed."),
);
// Redis 4 retains command abort listeners after completion. A later abort can
// corrupt its queue and crash on disconnect. Bound the caller without passing
// a signal into that driver, and always clear our timer after settlement.
async function redisBound<T>(command: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      command,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Redis deadline exceeded")),
          1000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
await mongo.connect();
await redis.connect();
const databaseName = z
  .string()
  .regex(/^webhook_clinic_v2(?:_test_[a-z0-9]+)?$/)
  .parse(process.env.CLINIC_DATABASE ?? "webhook_clinic_v2");
const db = mongo.db(databaseName);
const deliveries = db.collection<Delivery>("deliveries");
const audits = db.collection("replay_audits");
const receipts = db.collection("receiver_receipts");
await Promise.all([
  deliveries.createIndex({ id: 1 }, { unique: true }),
  db.collection("diagnoses").createIndex({ deliveryId: 1 }, { unique: true }),
  audits.createIndex({ deliveryId: 1 }, { unique: true }),
  audits.createIndex({ replayId: 1 }, { unique: true }),
  receipts.createIndex({ replayId: 1 }, { unique: true }),
  db
    .collection("reproductions")
    .createIndex({ deliveryId: 1 }, { unique: true }),
  db
    .collection("investigations")
    .createIndex({ deliveryId: 1, mode: 1 }, { unique: true }),
]);
const key = process.env.DEMO_SIGNING_KEY ?? "clinic-synthetic-local-only";
const idSchema = z.enum(fixtureIds);
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (
    ![`127.0.0.1:${apiPort}`, `localhost:${apiPort}`].includes(
      req.headers.host ?? "",
    )
  ) {
    res.status(403).json({ error: "Local host required." });
    return;
  }
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.headers.origin !== uiOrigin) {
    res
      .status(403)
      .json({ error: "Mutations require the local Clinic UI origin." });
    return;
  }
  next();
});
app.get("/api/health", async (_req, res, next) => {
  try {
    await mongo.db().command({ ping: 1 });
    await redisBound(redis.ping());
    res.json({ status: "ready", mode: "deterministic fixture" });
  } catch (e) {
    next(e);
  }
});
app.get("/api/config", (_req, res) =>
  res.json({
    geminiAvailable: geminiConfigured(),
    model: "gemini-3.5-flash-lite",
    captureVersion: "receiver-v2",
    destination,
  }),
);
app.get("/api/deliveries", async (req, res, next) => {
  try {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100).default(1),
        limit: z.coerce.number().int().min(1).max(20).default(10),
      })
      .strict()
      .parse(req.query);
    const [items, total] = await Promise.all([
      deliveries
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1, id: 1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .toArray(),
      deliveries.countDocuments(),
    ]);
    res.json({ items, total, ...q });
  } catch (e) {
    next(e);
  }
});
app.get("/api/deliveries/:id", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const delivery = await deliveries.findOne(
      { id },
      { projection: { _id: 0 } },
    );
    if (!delivery) {
      res.status(404).json({ error: "Delivery not found." });
      return;
    }
    res.json({
      delivery,
      diagnosis: await db
        .collection("diagnoses")
        .findOne({ deliveryId: id }, { projection: { _id: 0 } }),
      reproduction: await db
        .collection("reproductions")
        .findOne({ deliveryId: id }, { projection: { _id: 0 } }),
      investigations: await db
        .collection("investigations")
        .find({ deliveryId: id }, { projection: { _id: 0 } })
        .limit(2)
        .toArray(),
      audit: await audits.findOne(
        { deliveryId: id },
        { projection: { _id: 0 } },
      ),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/deliveries/:id/diagnose", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    z.object({}).strict().parse(req.body);
    const delivery = await deliveries.findOne({ id });
    if (!delivery) {
      res.status(404).json({ error: "Delivery not found." });
      return;
    }
    const result = {
      deliveryId: id,
      engine: "deterministic-receiver-v2",
      createdAt: new Date().toISOString(),
      findings: diagnose(delivery),
    };
    await db
      .collection("diagnoses")
      .updateOne(
        { deliveryId: id },
        { $setOnInsert: result },
        { upsert: true },
      );
    res.json(
      await db
        .collection("diagnoses")
        .findOne({ deliveryId: id }, { projection: { _id: 0 } }),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/deliveries/:id/reproduce", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    z.object({}).strict().parse(req.body);
    const existing = await db
      .collection("reproductions")
      .findOne({ deliveryId: id }, { projection: { _id: 0 } });
    if (existing) {
      res.json(existing);
      return;
    }
    const observation = await captureFixture(id);
    const reproduction = {
      deliveryId: id,
      createdAt: new Date().toISOString(),
      observation,
      findings: diagnose(observation),
    };
    await db
      .collection("reproductions")
      .updateOne(
        { deliveryId: id },
        { $setOnInsert: reproduction },
        { upsert: true },
      );
    res.json(
      await db
        .collection("reproductions")
        .findOne({ deliveryId: id }, { projection: { _id: 0 } }),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/deliveries/:id/investigate", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const { mode } = z
      .object({ mode: z.enum(["fixture", "gemini"]) })
      .strict()
      .parse(req.body);
    const diagnosis = await db
      .collection("diagnoses")
      .findOne({ deliveryId: id });
    if (!diagnosis) {
      res
        .status(409)
        .json({ error: "Run diagnostics before an investigation." });
      return;
    }
    const existing = await db
      .collection("investigations")
      .findOne({ deliveryId: id, mode }, { projection: { _id: 0 } });
    if (existing) {
      res.json(existing);
      return;
    }
    if (mode === "gemini" && !geminiConfigured()) {
      res.status(409).json({
        error:
          "Gemini requires GEMINI_API_KEY on the server. Fixture investigation is available.",
      });
      return;
    }
    // One durable attempt per mode and delivery: prevents repeated quota use, including after a crash.
    const run = {
      deliveryId: id,
      mode,
      state: "pending",
      createdAt: new Date().toISOString(),
      diagnosisVersion: diagnosis.engine,
    };
    try {
      await db.collection("investigations").insertOne({ ...run });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) {
        res.status(409).json({
          error: "Investigation already retained or in progress. Refresh.",
        });
        return;
      }
      throw e;
    }
    try {
      const result =
        mode === "fixture"
          ? fixtureInvestigation(diagnosis.findings)
          : await geminiInvestigation(
              diagnosis.findings,
              process.env.GEMINI_API_KEY!,
            );
      await db.collection("investigations").updateOne(
        { deliveryId: id, mode },
        {
          $set: {
            state: "succeeded",
            completedAt: new Date().toISOString(),
            result,
          },
        },
      );
    } catch {
      await db.collection("investigations").updateOne(
        { deliveryId: id, mode },
        {
          $set: {
            state: "failed",
            completedAt: new Date().toISOString(),
            error:
              "Investigation unavailable or output rejected. No retry, fallback, or replay was performed.",
          },
        },
      );
    }
    res.json(
      await db
        .collection("investigations")
        .findOne({ deliveryId: id, mode }, { projection: { _id: 0 } }),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/deliveries/:id/replay", async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    z.object({ approval: z.literal("REPLAY LOCAL FIXTURE") })
      .strict()
      .parse(req.body);
    if (!(await db.collection("diagnoses").findOne({ deliveryId: id }))) {
      res.status(409).json({
        error: "Run and review diagnostics before approving a replay.",
      });
      return;
    }
    const existing = await audits.findOne(
      { deliveryId: id },
      { projection: { _id: 0 } },
    );
    if (existing) {
      res.json({ audit: existing, deduplicated: true });
      return;
    }
    const lockKey = `clinic:replay:${id}`;
    const owner = randomUUID();
    if (
      !(await redisBound(redis.set(lockKey, owner, { NX: true, PX: 10000 })))
    ) {
      res
        .status(409)
        .json({ error: "Replay already in progress. Refresh the audit." });
      return;
    }
    try {
      const delivery = await deliveries.findOne({ id });
      if (!delivery) {
        res.status(404).json({ error: "Delivery not found." });
        return;
      }
      const replayId = randomUUID();
      const audit = {
        deliveryId: id,
        replayId,
        destination,
        approvedAt: new Date().toISOString(),
        approval: "explicit-local-fixture",
        state: "pending",
        status: null as number | null,
        detail: "Approved; request is pending.",
      };
      try {
        await audits.insertOne({ ...audit });
      } catch (e) {
        if ((e as { code?: number }).code === 11000) {
          res.json({
            audit: await audits.findOne(
              { deliveryId: id },
              { projection: { _id: 0 } },
            ),
            deduplicated: true,
          });
          return;
        }
        throw e;
      }
      const body = JSON.stringify({
        replayId,
        deliveryId: id,
        event: delivery.event,
        payload: delivery.request.body,
      });
      try {
        const response = await fetch(destination, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(1500),
          headers: {
            "content-type": "application/json",
            "x-clinic-signature": sign(body, key),
          },
          body,
        });
        // Receiver is bundled and its response is deliberately tiny. Do not persist response bodies or headers.
        await response.body?.cancel();
        await audits.updateOne(
          { replayId },
          {
            $set: {
              state: response.ok ? "succeeded" : "failed",
              status: response.status,
              detail: response.ok
                ? "Controlled receiver acknowledged the synthetic payload."
                : "Controlled receiver rejected the request.",
              completedAt: new Date().toISOString(),
            },
          },
        );
      } catch {
        await audits.updateOne(
          { replayId },
          {
            $set: {
              state: "uncertain",
              detail:
                "No confirmed acknowledgement within the request bound. No automatic retry.",
              completedAt: new Date().toISOString(),
            },
          },
        );
      }
      res.status(201).json({
        audit: await audits.findOne({ replayId }, { projection: { _id: 0 } }),
        deduplicated: false,
      });
    } finally {
      await redisBound(
        redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          { keys: [lockKey], arguments: [owner] },
        ),
      ).catch(() => {});
    }
  } catch (e) {
    next(e);
  }
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Invalid request. Check fixture ID, pagination, and approval.",
      });
      return;
    }
    const status = (error as { status?: number }).status;
    res.status(status === 413 ? 413 : status === 400 ? 400 : 503).json({
      error:
        status === 413
          ? "Request too large."
          : status === 400
            ? "Malformed JSON."
            : "Service unavailable. Check local MongoDB and Redis, then refresh.",
    });
  },
);
const receiver = express();
receiver.disable("x-powered-by");
receiver.use(express.raw({ type: "application/json", limit: "16kb" }));
receiver.post("/fixtures/:id", async (req, res) => {
  const parsed = idSchema.safeParse(req.params.id);
  if (!parsed.success || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Known synthetic fixture required." });
    return;
  }
  const source = privateFixture(parsed.data);
  if (req.body.toString() !== source.raw) {
    res.status(400).json({ error: "Synthetic fixture bytes required." });
    return;
  }
  if (
    !verifyFixtureBytes(
      req.body.toString(),
      String(req.headers["x-fixture-signature"] ?? ""),
    )
  ) {
    res.status(401).json({ error: "signature mismatch" });
    return;
  }
  if (parsed.data === "evt_status") {
    res.status(503).json({ error: "receiver unavailable" });
    return;
  }
  // The original timeout fixture deliberately exceeds its 150ms sender budget.
  if (parsed.data === "evt_timeout")
    await new Promise((resolve) => setTimeout(resolve, 350));
  if (!res.destroyed) res.json({ accepted: true });
});
receiver.post("/receive", async (req, res) => {
  try {
    if (
      !Buffer.isBuffer(req.body) ||
      !verify(
        req.body.toString(),
        String(req.headers["x-clinic-signature"] ?? ""),
        key,
      )
    ) {
      res.status(401).json({ error: "Invalid demo signature." });
      return;
    }
    const parsed = z
      .object({
        replayId: z.string().uuid(),
        deliveryId: idSchema,
        event: z.string().max(80),
        payload: z.unknown(),
      })
      .strict()
      .parse(JSON.parse(req.body.toString()));
    const audit = await audits.findOne({
      replayId: parsed.replayId,
      deliveryId: parsed.deliveryId,
    });
    if (!audit) {
      res.status(403).json({ error: "Approval audit required." });
      return;
    }
    try {
      await receipts.insertOne({
        replayId: parsed.replayId,
        deliveryId: parsed.deliveryId,
        receivedAt: new Date().toISOString(),
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    // Test-only process configuration; never accepted from an API request.
    if (
      process.env.NODE_ENV === "test" &&
      process.env.CLINIC_TEST_RECEIVER_MODE === "timeout"
    )
      await new Promise((resolve) => setTimeout(resolve, 2000));
    if (
      process.env.NODE_ENV === "test" &&
      process.env.CLINIC_TEST_RECEIVER_MODE === "redirect"
    ) {
      res.redirect(302, `http://127.0.0.1:${receiverPort + 1}/forbidden`);
      return;
    }
    if (!res.destroyed) res.json({ accepted: true, replayId: parsed.replayId });
  } catch {
    res.status(400).json({ error: "Invalid synthetic delivery." });
  }
});
receiver.use(
  (
    _err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(400).json({ error: "Invalid receiver request." });
  },
);
const receiverServer = receiver.listen(receiverPort, "127.0.0.1", () =>
  console.log(`Controlled receiver: ${receiverBase}`),
);
await new Promise<void>((resolve, reject) => {
  receiverServer.once("listening", resolve);
  receiverServer.once("error", reject);
});
for (const id of fixtureIds) {
  if (!(await deliveries.findOne({ id }))) {
    const d = await captureFixture(id);
    await deliveries.updateOne({ id }, { $setOnInsert: d }, { upsert: true });
  }
}
receiverServer.requestTimeout = 5000;
receiverServer.headersTimeout = 5000;
const server = app.listen(apiPort, "127.0.0.1", () =>
  console.log(`Clinic API: ${apiBase} · UI origin ${uiOrigin}`),
);
server.requestTimeout = 5000;
server.headersTimeout = 5000;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    server.close();
    receiverServer.close();
    void Promise.all([mongo.close(), redis.quit()]).finally(() =>
      process.exit(0),
    );
  });
