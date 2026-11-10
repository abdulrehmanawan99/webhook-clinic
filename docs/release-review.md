# Local release review — 2026-11-06

This is a private, trusted-machine portfolio demo with the complete three-fixture
workflow. The following evidence supports that narrow release scope; it does not
claim arbitrary-log diagnosis, multiuser security, provider portability, cloud
readiness or general AI acceptance.

## Engineering acceptance

[CI run 42264877794](https://github.com/abdulrehmanawan99/webhook-clinic/actions/runs/42264877794)
passed on a fresh Linux checkout/install at `2eb7ba2`: locked `npm ci`, eleven
offline tests, TypeScript/Vite build, dependency audit, real MongoDB/Redis workflow,
desktop/mobile browser checks (zero runtime errors/axe violations), and timeout,
outage/recovery, redirect and retained-checkpoint scenarios. This verifies fresh
fixture setup on that runner; it does not restore historical local data. The new
evaluation/release scripts were subsequently checked locally with thirteen tests,
production build and the offline scorer. CI now also runs the scorer and bounded
secret-pattern check. See the [current PR checks](https://github.com/abdulrehmanawan99/webhook-clinic/pull/2/checks) for the latest commit result.

The [verification record](verification.md) documents reproducible Redis and
rounded-timer findings, fixes and regressions. [Architecture](architecture.md)
records local privilege assumptions, network limits, immutable data, approval,
deduplication and residual crash uncertainty. A retained checkpoint test is a
simulated interruption, not a genuine process-kill race. No unresolved high or
critical issue was identified in these bounded checks; this is not a comprehensive
security assessment.

## Checks performed for the release documentation

- `npm run evaluate`: passes frozen `webhook-quality-v1` development gates,
  primary 3/3, exact citations 7/7. Reads committed sanitized results only.
- `npm test`: thirteen offline tests pass, including negative scorer mutations.
- `npm run build`: strict TypeScript static checking and production UI build pass.
- `npm audit --audit-level=high`: zero known vulnerabilities reported on 2026-11-06.
- `npm run licenses`: all 286 locked entries declare licenses; 211 installed
  entries match locked versions. [Attribution review](third-party.md) records
  MPL/CC attribution and missing notice-file limitations.
- `npm run check:secrets`: scans tracked working-tree text and generated frontend
  JS/CSS for private-key delimiters and common Google/GitHub/AWS key formats.
  No matches found across 37 text files. It reports filenames/counts only, never matched content.
  History, ignored private runtime files, binary screenshots/OCR and arbitrary
  credential formats are outside this pattern scan. It is not proof that every
  possible secret format is absent; no credential files were read for this review.
- Read-only `docker top` observed existing `mongod` and `redis-server` processes
  running as UID 999. Official image startup drops service privilege; Compose does
  not specify a user override. No container/process restart or volume change was
  performed. No application container is introduced.
- `git diff --check`: passes.

## Limits and remaining decisions

Versioned labels, gates, result export, scoring/failure examples and model
variability limits are in [evaluation](evaluation.md). The three prior live calls
are a synthetic development compatibility baseline. Broader/unseen-case quality
and a second provider remain unverified. Only one provider (Gemini) is implemented.
Resource/queue measurements and latency percentiles are not established; no such
performance claims are made.

Private source ownership is preserved: the owner has not chosen a public license.
Dependency notice assembly for redistributed binaries, complete container source
license review, image digest pinning and hosted deployment hardening are outside
this local source/demo release. Public redistribution or deployment requires a
separate review of those assumptions.

## Troubleshooting and release notes

Use the exact `127.0.0.1` UI origin. Other origins are deliberately rejected.
If the app cannot start, inspect the dedicated ports in README and check MongoDB/
Redis health; do not stop unknown processes or delete volumes. The server loads
`.env` if present; exported variables take precedence. Fixture mode needs no provider key. A failed or
pending provider/replay attempt remains retained without an automatic retry;
refreshing does not reset it. Never reuse imported live credentials.

This follow-up preserves existing snapshots and adds explicit deadline evidence
for new captures, so genuine timer aborts are classified correctly even when
rounded duration is below the nominal budget. It also records prior live results,
freezes development quality gates, and adds reproducible scoring/license/secret
checks. No inference was repeated and no existing data was rewritten.
