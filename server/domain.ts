import { createHmac, timingSafeEqual } from "node:crypto";
export const destination = "http://127.0.0.1:9011/receive";
export const fixtureIds = [
  "evt_signature",
  "evt_status",
  "evt_timeout",
] as const;
export type Finding = {
  code: string;
  level: "fail" | "pass" | "warn";
  title: string;
  evidence: string;
  action: string;
};
export type Delivery = {
  id: string;
  event: string;
  createdAt: string;
  durationMs: number;
  budgetMs: number;
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
  signatureValid: boolean;
  fixture: true;
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
export function fixtures(): Delivery[] {
  return fixtureIds.map((id, i) => ({
    id,
    event: ["invoice.created", "order.updated", "shipment.created"][i],
    createdAt: new Date(Date.UTC(2026, 10, 5, 10, 42 - i * 7)).toISOString(),
    durationMs: [142, 318, 5000][i],
    budgetMs: 5000,
    request: {
      method: "POST",
      path: "/hooks/commerce",
      headers: redact({
        "content-type": "application/json",
        "x-webhook-signature": "synthetic-invalid",
        authorization: "synthetic-only",
      }) as Record<string, string>,
      body: redact({
        id: `sample_${i + 1}`,
        type: ["invoice.created", "order.updated", "shipment.created"][i],
        customer: { email: "synthetic@example.invalid" },
        amount: 4800,
        currency: "USD",
      }),
    },
    response: {
      status: [401, 503, null][i],
      headers: { "content-type": "application/json" },
      body: [
        '{"error":"signature mismatch"}',
        '{"error":"receiver unavailable"}',
        "No response before deadline",
      ][i],
    },
    signatureValid: i !== 0,
    fixture: true,
  }));
}
export function diagnose(d: Delivery): Finding[] {
  return [
    {
      code: "signature",
      level: d.signatureValid ? "pass" : "fail",
      title: d.signatureValid
        ? "Signature fixture matched"
        : "Signature fixture mismatch",
      evidence: `Fixture verification flag: ${d.signatureValid}; response status: ${d.response.status ?? "none"}. Stored signature is redacted.`,
      action: d.signatureValid
        ? "No signature adjustment indicated."
        : "Check signing secret and exact raw payload bytes. This demo re-signs its synthetic payload for the bundled receiver.",
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
      level: d.durationMs >= d.budgetMs ? "fail" : "pass",
      title:
        d.durationMs >= d.budgetMs
          ? "Delivery deadline reached"
          : "Within delivery budget",
      evidence: `durationMs = ${d.durationMs}; budgetMs = ${d.budgetMs}.`,
      action:
        d.durationMs >= d.budgetMs
          ? "Keep receiver processing bounded; acknowledge promptly."
          : "No timeout adjustment indicated.",
    },
  ];
}
export function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("hex");
}
export function verify(body: string, signature: string, key: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(sign(body, key), "hex"),
    Buffer.from(signature, "hex"),
  );
}
