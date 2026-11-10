# Frozen development quality gates

`webhook-quality-v1` was frozen on 2026-11-06 **after** observing the three-case
Gemini baseline. It is a development regression gate for the bundled fixtures,
not an independent held-out estimate. The [labels](../evaluation/webhook-quality-v1.json)
state expected primary causes and preserve seven previously validated cited source
strings. The [baseline export](../evaluation/gemini-baseline-2026-11-06.json)
contains sanitized persisted app selections, observed latency and token usage.
No new live calls were made to create these files. Labels preserve the cited
subset, not a complete export of all three diagnostics for every delivery.

Run from the repository root:

```sh
npm run evaluate
npm run evaluate -- path/to/sanitized-results.json
npm test
```

The evaluator reads files only. It does not import the provider adapter, read
credentials, call the API, replay, or alter persisted data. Custom result files
must follow the committed export schema and include exactly the three case IDs.
Malformed/missing/duplicate cases, unknown fields (including execution fields),
unsupported models, duplicate checks and a primary absent from its selection are
rejected with exit status 1. Incorrect expected causes or nonexact quotes fail
the gates with exit status 1. Raw input content is never printed on rejection.

## Numeric gates and observed result

- All three expected primary causes must match: **3/3 (100%)**.
- Every returned evidence quote must match its reviewed code/source string:
  **100%**, observed **7/7** in the retained baseline.
- Exactly **3** successful, schema-valid, grounded results; zero missing cases,
  duplicate cases/checks, unsupported selections or execution fields accepted.
- Consequential actions remain separately gated: **zero** unapproved replays,
  forbidden-destination hits or duplicate receipts in deterministic integration/
  scenario checks. The file scorer does not measure actual network effects.

`npm run evaluate` passes these numeric development gates on the committed
baseline. Thirteen offline tests pass, including two scorer tests: baseline
scoring and negative mutations (missing/duplicate case, extra destination,
fabricated quote, wrong cause and duplicate check). Existing provider-contract
checks separately reject unknown tools, replay fields, refusal, truncation,
oversize output and injected citations. Those negative cases are constructed
regressions, **not additional live model failures**.

## Variability and remaining coverage

One live observation per fixture does not estimate run-to-run variability or
confidence intervals. Selected secondary checks can vary; primary correctness
and exact source grounding are the gates, not identical wording or token counts.
Visible summaries/actions come from deterministic rules, so this evaluation does
not assess free-form diagnosis quality. The committed quote subset deliberately
restricts accepted selections; a broader dataset must retain its complete source
snapshot and receive a new version rather than silently changing these labels.

Live invalid-output behavior was not observed; rejection safety has mocked tests.
The baseline predates the deadline-evidence correction and retains its original
quotes. It does not prove a subsequent prompt/evidence version against live Gemini.
Broader or unseen-case model quality remains unverified, and only
`gemini-3.5-flash-lite` is supported. No latency percentile, throughput,
resource, queue-capacity or general performance claim is made from three calls.
