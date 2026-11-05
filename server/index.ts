import express from "express";
import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  destination,
  fixtureIds,
  fixtures,
  diagnose,
  sign,
  verify,
} from "./domain.js";
import type { Delivery } from "./domain.js";
const mongo = new MongoClient(
  process.env.MONGO_URL ?? "mongodb://127.0.0.1:27018",
  { serverSelectionTimeoutMS: 3000 },
);
const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://127.0.0.1:6381",
  socket: { connectTimeout: 3000, reconnectStrategy: false },
});
redis.on("error", () =>
  console.error("Redis unavailable; replay coordination fails closed."),
);
await mongo.connect();
await redis.connect();
const db = mongo.db("webhook_clinic");
const deliveries = db.collection<Delivery>("deliveries");
const audits = db.collection("replay_audits");
const receipts = db.collection("receiver_receipts");
await Promise.all([
  deliveries.createIndex({ id: 1 }, { unique: true }),
  db.collection("diagnoses").createIndex({ deliveryId: 1 }, { unique: true }),
  audits.createIndex({ deliveryId: 1 }, { unique: true }),
  audits.createIndex({ replayId: 1 }, { unique: true }),
  receipts.createIndex({ replayId: 1 }, { unique: true }),
]);
for (const d of fixtures())
  await deliveries.updateOne(
    { id: d.id },
    { $setOnInsert: d },
    { upsert: true },
  );
const key = process.env.DEMO_SIGNING_KEY ?? "clinic-synthetic-local-only";
const idSchema = z.enum(fixtureIds);
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (!["127.0.0.1:8011", "localhost:8011"].includes(req.headers.host ?? "")) {
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
  if (req.method !== "GET" && req.headers.origin !== "http://127.0.0.1:5174") {
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
    await redis.ping();
    res.json({ status: "ready", mode: "deterministic fixture" });
  } catch (e) {
    next(e);
  }
});
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
    const delivery = await deliveries.findOne({ id });
    if (!delivery) {
      res.status(404).json({ error: "Delivery not found." });
      return;
    }
    const result = {
      deliveryId: id,
      engine: "deterministic-fixture-v1",
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
    if (!(await redis.set(lockKey, owner, { NX: true, PX: 10000 }))) {
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
      await redis
        .eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          { keys: [lockKey], arguments: [owner] },
        )
        .catch(() => {});
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
    res.json({ accepted: true, replayId: parsed.replayId });
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
const receiverServer = receiver.listen(9011, "127.0.0.1", () =>
  console.log("Controlled receiver: http://127.0.0.1:9011"),
);
receiverServer.requestTimeout = 5000;
receiverServer.headersTimeout = 5000;
const server = app.listen(8011, "127.0.0.1", () =>
  console.log("Clinic API: http://127.0.0.1:8011 · fixture mode"),
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
