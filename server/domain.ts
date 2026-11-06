import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const destination = "http://127.0.0.1:9011/receive";
export const fixtureIds = [
  "evt_signature",
  "evt_status",
  "evt_timeout",
] as const;
export type FixtureId = (typeof fixtureIds)[number];
export type Finding = {
  code: "signature" | "status" | "timeout";
  level: "fail" | "pass" | "warn";
  title: string;
  evidence: string;
  action: string;
};
export type Delivery = {
  id: FixtureId;
  event: string;
  createdAt: string;
  durationMs: number;
  budgetMs: number;
  // Optional for older immutable captures, which predate explicit timeout evidence.
  deadlineReached?: boolean;
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
  };
  response: {
    status: number | null;
    headers: Record<string, string>;
    body: string;
  };
  signatureVerification: {
    algorithm: "HMAC-SHA256";
    valid: boolean;
    bodySha256: string;
    byteLength: number;
    source: "private synthetic exact bytes";
  };
  fixture: true;
  captureVersion: "receiver-v2";
};
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /authorization|cookie|token|secret|signature|password|email/i.test(key)
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  return value;
}
export function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("hex");
}
export function verify(body: string, signature: string, key: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(
      Buffer.from(sign(body, key), "hex"),
      Buffer.from(signature, "hex"),
    )
  );
}
// Server-only synthetic source. Neither exact bytes, signature nor signing key is persisted or returned.
const originalFixtureKey = "clinic-original-synthetic-key-v2";
export function privateFixture(id: FixtureId) {
  const i = fixtureIds.indexOf(id);
  const event = ["invoice.created", "order.updated", "shipment.created"][i];
  const raw = JSON.stringify({
    id: `sample_${i + 1}`,
    type: event,
    customer: { email: "synthetic@example.invalid" },
    amount: 4800,
    currency: "USD",
  });
  const correct = sign(raw, originalFixtureKey);
  const signature =
    id === "evt_signature"
      ? (correct[0] === "a" ? "b" : "a") + correct.slice(1)
      : correct;
  return { raw, signature, event, budgetMs: id === "evt_timeout" ? 150 : 1500 };
}
export function verifyFixtureBytes(raw: string, signature: string) {
  return verify(raw, signature, originalFixtureKey);
}
export async function captureFixture(id: FixtureId): Promise<Delivery> {
  const source = privateFixture(id);
  const start = performance.now();
  const deadline = AbortSignal.timeout(source.budgetMs);
  let deadlineReached = false;
  let response: Delivery["response"] = {
    status: null,
    headers: {},
    body: "No response before deadline",
  };
  try {
    const r = await fetch(`http://127.0.0.1:9011/fixtures/${id}`, {
      method: "POST",
      redirect: "error",
      signal: deadline,
      headers: {
        "content-type": "application/json",
        "x-fixture-signature": source.signature,
      },
      body: source.raw,
    });
    // Bundled receiver always returns a fixed, small JSON object. No imported body is ever echoed.
    const text = await r.text();
    if (Buffer.byteLength(text) > 2048)
      throw new Error("Receiver response too large");
    response = {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "" },
      body: text,
    };
  } catch {
    deadlineReached = deadline.aborted;
    /* Retain the observed missing acknowledgement, never retry automatically. */
  }
  return {
    ...fixtureSnapshot(id, response, Math.round(performance.now() - start)),
    deadlineReached,
  };
}
export function fixtureSnapshot(
  id: FixtureId,
  response: Delivery["response"],
  durationMs: number,
): Delivery {
  const source = privateFixture(id);
  return {
    id,
    event: source.event,
    createdAt: new Date().toISOString(),
    durationMs,
    budgetMs: source.budgetMs,
    request: {
      method: "POST",
      path: `/fixtures/${id}`,
      headers: {
        "content-type": "application/json",
        "x-fixture-signature": "[REDACTED]",
      },
      body: redact(JSON.parse(source.raw)),
    },
    response,
    signatureVerification: {
      algorithm: "HMAC-SHA256",
      valid: verifyFixtureBytes(source.raw, source.signature),
      bodySha256: createHash("sha256").update(source.raw).digest("hex"),
      byteLength: Buffer.byteLength(source.raw),
      source: "private synthetic exact bytes",
    },
    fixture: true,
    captureVersion: "receiver-v2",
  };
}
export function diagnose(d: Delivery): Finding[] {
  return [
    {
      code: "signature",
      level: d.signatureVerification.valid ? "pass" : "fail",
      title: d.signatureVerification.valid
        ? "Exact-byte HMAC matched"
        : "Exact-byte HMAC mismatch",
      evidence: `HMAC-SHA256 verification = ${d.signatureVerification.valid}; ${d.signatureVerification.byteLength} private synthetic bytes; SHA-256 ${d.signatureVerification.bodySha256}. Signature and source bytes are withheld.`,
      action: d.signatureVerification.valid
        ? "No signature adjustment indicated."
        : "Check signing secret and exact raw payload bytes. This demo re-signs its sanitized synthetic replay for the bundled receiver.",
    },
    {
      code: "status",
      level:
        d.response.status === null
          ? "warn"
          : d.response.status >= 400
            ? "fail"
            : "pass",
      title:
        d.response.status === null
          ? "No HTTP response"
          : `Receiver returned HTTP ${d.response.status}`,
      evidence: `response.status = ${d.response.status ?? "null"}; response.body = ${d.response.body}`,
      action:
        d.response.status === 503
          ? "Check receiver availability before a controlled retry."
          : "Inspect the stored response and receiver contract.",
    },
    {
      code: "timeout",
      level:
        d.response.status === null &&
        (d.deadlineReached ?? d.durationMs >= d.budgetMs)
          ? "fail"
          : "pass",
      title:
        d.response.status === null &&
        (d.deadlineReached ?? d.durationMs >= d.budgetMs)
          ? "Delivery deadline reached"
          : "Within delivery budget",
      evidence: `durationMs = ${d.durationMs}; budgetMs = ${d.budgetMs}; response.status = ${d.response.status ?? "null"}.${d.deadlineReached === undefined ? "" : ` deadlineReached = ${d.deadlineReached}.`}`,
      action:
        d.response.status === null
          ? "Keep receiver processing bounded; acknowledge promptly."
          : "No timeout adjustment indicated.",
    },
  ];
}
