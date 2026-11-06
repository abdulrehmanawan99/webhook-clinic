# Provider and evaluation boundaries

The no-key fixture selector and optional Gemini adapter return the same small investigation result: primary check, selected evidence, supported summary, provider/model and usage. Inputs are the three retained diagnostic findings, never imported secrets or raw original payloads. Allowed check IDs are signature, status and timeout. Exact evidence quotes must match the retained source; duplicate IDs, unknown fields, unsupported quotes and replay/destination fields are rejected. Deterministic code owns all verification and replay authorization.

## Optional Gemini configuration

Leave `GEMINI_API_KEY` empty and `GEMINI_FREE_TIER_CONFIRMED=false` for all offline checks. The server does not load `.env` automatically. Only independently confirmed billing-disabled free-tier use is eligible; the flag is an operator assertion, not a billing API check. There are no paid/live calls in the recorded verification.

The fixed model is `gemini-3.5-flash-lite`, using `generateContent` with JSON-schema output, no tools and no SDK. Official [model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) and [structured-output contract](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) informed this implementation; model availability, quota and this exact schema have not been exercised live. The key is sent only in the server request header. It is never returned to the browser, stored in MongoDB or included in application logs.

One durable attempt per delivery/mode prevents repeated quota use after refresh, concurrent requests or a crash. Failed/pending attempts stay visible without retry. HTTP refusal, truncated completion, malformed/oversized output and unsupported citations fail closed. No fallback or replay occurs. Requests have a 10-second bound, 1,800 output tokens and 32 KiB response limit.

## Actual evaluation and remaining acceptance

`npm test` includes a three-case fixture evaluation: expected primary checks are signature for invalid HMAC, status for HTTP 503, and timeout for the exceeded deadline. It checks exact evidence citation grounding. This is a tiny deterministic regression set, not measured live model quality. Mock HTTP contract tests check headers, limits, structured output and no execution tools; rejection tests cover injection-like fabricated citations, unknown fields, duplicate checks, refusal, truncation and oversize output. These tests do not establish provider compatibility.

Live acceptance is pending a key and free-tier capability confirmation. For each of the three cases, record actual provider/model, schema acceptance, expected-primary accuracy, citation validity, latency, token usage and failure state; require all citations to resolve and zero unauthorized effects. Run the same set with a second available provider configuration before claiming portability acceptance. No second provider adapter or result is claimed today. The implementation deliberately limits AI to evidence selection and supported summaries; it does not diagnose arbitrary production logs.
