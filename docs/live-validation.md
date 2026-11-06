# Live development validation — 2026-11-06

Three explicit app investigations succeeded using `gemini-3.5-flash-lite` via
`generateContent` with the existing structured-output schema. Inputs were the
retained diagnostics for the bundled synthetic receiver fixtures. Each result
was persisted by the app with provider/model, diagnosis version
`deterministic-receiver-v2`, timestamps and token usage. No replay was triggered.
This record summarizes the existing ignored `.local/live-api-validation.json`;
no additional inference was performed for this documentation.

- `evt_signature`: expected/returned primary `signature`; 2 exact evidence quotes;
  app latency 1.607 s; 313 input / 171 output tokens.
- `evt_status`: expected/returned primary `status`; 2 exact evidence quotes;
  app latency 0.940 s; 298 input / 69 output tokens.
- `evt_timeout`: expected/returned primary `timeout`; 3 exact evidence quotes;
  app latency 1.881 s; 284 input / 208 output tokens.

Across these three development cases, all expected primary checks matched and
all seven returned quotes exactly matched retained diagnostic evidence. Totals:
895 input / 448 output tokens. These are individual request observations, not
latency percentiles or performance guarantees. The report contains no key and
this document omits original payloads, signatures and private key material.

## Acceptance boundaries

This is a small synthetic compatibility baseline, not held-out or general model
quality acceptance. The model selected evidence already computed by deterministic
rules; it did not independently verify signatures or execute replay tools.
Offline mocked rejection tests are separate from these successful live calls.

The canonical PRD Webhook Clinic acceptance requires local failure reproduction,
a validated cause, retained replay audit evidence and restricted-destination
rejection. Existing integration/browser/scenario checks exercise that bounded
workflow; see [verification](verification.md). Live model output alone does not
establish those safety properties.

The [frozen development evaluation](evaluation.md) now provides versioned labels,
numeric gates and a reproducible offline scoring command for these retained
results. Broader/unseen-case quality remains unverified. A second provider
configuration is unverified and cannot be tested under the current exact-model-only
authorization. No second provider, arbitrary-log diagnosis, production replay, or
general AI acceptance is claimed. There is no need to repeat these successful calls.
