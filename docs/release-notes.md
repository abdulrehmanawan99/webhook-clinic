# Release notes

## 11 November 2026: documentation

- Added an architecture decisions table to the [architecture](architecture.md) page.

## v1 (10 November 2026): ready for outside readers

- The README is rewritten for people cloning the repo. It covers the fixture quick start,
  using your own Gemini key, port overrides, limitations and troubleshooting.
- Added a written [threat model](threat-model.md) and refreshed the screenshots.
- `.env` is loaded automatically, ports are validated, and the Gemini gate now needs only a key.

## Validation follow-up

- **Bug fix:** timeout evidence is now classified correctly. Genuine deadline aborts are
  recognized even when the rounded duration is below the nominal budget.
- Recorded the live Gemini baseline: 3 synthetic cases with `gemini-3.5-flash-lite`. See
  [live validation](live-validation.md).
- Froze the offline quality gates and added reproducible scoring, license and secret checks.
  See [release review](release-review.md).

## First local release

- Three seeded synthetic failures are reproduced against a bundled receiver: invalid HMAC,
  receiver unavailable, and a missed deadline.
- Request and response snapshots are immutable and redacted.
- Three deterministic diagnostics, each citing its evidence.
- An optional investigation step uses either the fixture selector or Gemini.
- Approved replay goes only to the fixed local receiver, with durable audits.
- The API now stays up when Redis coordination is unavailable; new replays fail closed.
- The browser workflow, accessibility and domain rules are checked in CI.
