import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
const code = z.enum(["signature", "status", "timeout"]);
const labelsSchema = z
  .object({
    version: z.literal("webhook-quality-v1"),
    frozenAt: z.string(),
    basis: z.string(),
    gates: z
      .object({
        primaryAccuracy: z.literal(1),
        citationValidity: z.literal(1),
        validResults: z.literal(3),
      })
      .strict(),
    cases: z
      .array(
        z
          .object({
            id: z.string(),
            expectedPrimary: code,
            sourceEvidence: z
              .array(z.object({ code, quote: z.string() }).strict())
              .min(1),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();
const resultSchema = z
  .object({
    datasetVersion: z.literal("webhook-quality-v1"),
    model: z.literal("gemini-3.5-flash-lite"),
    provenance: z.string(),
    results: z
      .array(
        z
          .object({
            id: z.string(),
            state: z.literal("succeeded"),
            selection: z
              .object({
                primary: code,
                checks: z
                  .array(
                    z
                      .object({
                        code,
                        evidenceQuote: z.string().min(5).max(700),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(3),
              })
              .strict(),
            latencySeconds: z.number().nonnegative(),
            usage: z
              .object({
                inputTokens: z.number().int().nonnegative(),
                outputTokens: z.number().int().nonnegative(),
              })
              .strict(),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();
export function score(labelsInput: unknown, resultsInput: unknown) {
  const labels = labelsSchema.parse(labelsInput);
  const run = resultSchema.parse(resultsInput);
  const expectedIds = new Set(labels.cases.map((c) => c.id));
  if (
    expectedIds.size !== labels.cases.length ||
    new Set(run.results.map((r) => r.id)).size !== expectedIds.size ||
    run.results.some((r) => !expectedIds.has(r.id))
  )
    throw new Error("Missing, duplicate or unexpected case ID");
  let primaryCorrect = 0,
    citationCorrect = 0,
    citations = 0,
    validResults = 0;
  for (const result of run.results) {
    const label = labels.cases.find((c) => c.id === result.id)!;
    const selected = new Set(result.selection.checks.map((c) => c.code));
    if (
      selected.size !== result.selection.checks.length ||
      !selected.has(result.selection.primary)
    )
      throw new Error("Duplicate check or primary absent from selection");
    let grounded = true;
    for (const check of result.selection.checks) {
      citations++;
      const valid = label.sourceEvidence.some(
        (source) =>
          source.code === check.code && source.quote === check.evidenceQuote,
      );
      if (valid) citationCorrect++;
      else grounded = false;
    }
    if (result.selection.primary === label.expectedPrimary) primaryCorrect++;
    if (grounded) validResults++;
  }
  const primaryAccuracy = primaryCorrect / labels.cases.length;
  const citationValidity = citationCorrect / citations;
  return {
    datasetVersion: labels.version,
    primaryCorrect,
    caseCount: labels.cases.length,
    primaryAccuracy,
    citationCorrect,
    citations,
    citationValidity,
    validResults,
    passed:
      primaryAccuracy >= labels.gates.primaryAccuracy &&
      citationValidity >= labels.gates.citationValidity &&
      validResults >= labels.gates.validResults,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const labels = JSON.parse(
      readFileSync(
        new URL("../evaluation/webhook-quality-v1.json", import.meta.url),
        "utf8",
      ),
    );
    const results = JSON.parse(
      readFileSync(
        process.argv[2] ??
          new URL(
            "../evaluation/gemini-baseline-2026-11-06.json",
            import.meta.url,
          ),
        "utf8",
      ),
    );
    const result = score(labels, results);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch {
    console.error(
      "Evaluation rejected: malformed, missing, duplicate or unsupported results. No input content printed.",
    );
    process.exitCode = 1;
  }
}
