# Verification record

## Current implementation — 2026-11-06

Verified locally with Node 24.22.1:

- `npm test`: nine tests passed, including original exact-byte HMAC verification; all three fixture primary-cause/citation regressions; and mocked Gemini request/response, refusal, truncation, oversize and unsupported-output rejection. No inference calls were made.
- `npm run build`: TypeScript and Vite production build passed.
- `npm audit --audit-level=low`: zero known vulnerabilities at this time.
- `git diff --check`: passed.

Real-service checks now pass locally against project-only MongoDB 7/Redis 7 containers after Docker was repaired:

- `npm run test:integration`: passed using a fresh, uniquely named test database; actual 401/503/deadline captures and reproductions, evidence selection, malformed/oversized inputs, host/origin restrictions, fixed destination, concurrent replay dedupe and retained immutable evidence were checked.
- `npm run test:scenarios`: passed actual replay timeout with one receipt and dedupe; Redis outage returns 503 in under three seconds before creating an audit; Redis recovery; Mongo outage returns 503 and recovers; redirects produce zero requests at a forbidden-destination trap; and a simulated post-approval checkpoint survives app restart. The checkpoint is deliberately inserted, not an actual process-kill race test. Only this invocation's unique test database is deleted; existing evidence and audits are preserved.
- CI run `42222395575` passed the real integration and revised desktop/mobile browser workflow with zero browser errors and zero axe violations. That run exposed the Redis outage crash described below, which was subsequently reproduced and fixed locally. The current PR checks track Linux confirmation of the corrected implementation.

The refreshed `docs/screenshots/desktop.png` and `mobile.png` are actual captures from that revised-interface CI browser run and were visually inspected. The browser check covers retained reproduction, fixture investigation, disabled unconfigured Gemini selection, explicit replay approval/persistence and keyboard tabs on desktop/mobile. It does not claim live-provider or full accessibility acceptance.

The outage failure was reproduced locally with child stdout/stderr enabled. Redis 4.7.1 keeps command abort listeners after successful completion; delayed `AbortSignal.timeout` callbacks can corrupt its queue, causing `flushAll` to throw on disconnect and terminate the API. Redis calls now use cleared application deadline timers without passing abort signals to that driver. The queue is capped at 128 commands and offline queueing remains disabled. A timed-out lock request cannot reach audit creation or replay; any late lock expires after ten seconds, and release remains owner-checked. The same outage assertions pass unchanged. Scenario logs now identify each stage and child exit.

The GitHub Actions workflow starts this project's real MongoDB/Redis on a fresh Linux runner, owns its API/receiver lifecycle, runs integration and browser checks, stops the owned app process, then runs failure scenarios. Gemini credentials are explicitly disabled and cleanup affects only this Compose project.

Three authorized synthetic Gemini app investigations subsequently succeeded; see the separate [live validation record](live-validation.md). Broader quality and two-provider acceptance remain unverified.

## Post-merge deadline correction — 2026-11-06

Main CI run `42264213004` failed the integration assertion that measured elapsed
time must be at least the 150 ms timeout budget. An abort timer can fire before
the rounded monotonic measurement reaches that value. The same elapsed-time
comparison also classified a real deadline abort as passing the timeout check.
New captures retain the actual deadline signal outcome separately from elapsed
time; diagnostics use that outcome, with the previous comparison retained only
for older immutable captures. No persisted records are rewritten. Integration
still requires an actual abort and an elapsed time below the 1.5 s bound.

`npm test`: eleven offline tests passed on Node 22.11.0, including a controlled
149 ms observation with an actual deadline signal and a separate transport error.
`npm run build`: TypeScript and Vite passed. Real integration and scenario checks
will run on a fresh CI runner; local instances and their data were left running.

## Earlier fixture milestone — 2026-11-05

Verified locally on 2026-11-05 with Node 22.11.0 and Docker Compose 5.2.0.

A minimal GitHub Actions workflow runs domain tests, the production build, and dependency audit on pull requests and pushes to main. Remote results are reported separately from the local checks below.

- `docker compose up -d --wait`: MongoDB 7 and Redis 7 became healthy, using only this project's containers/volume and loopback ports 27018/6381.
- `npm run build`: strict TypeScript check and Vite production build passed.
- `npm test`: 3 domain tests passed: recursive fixture redaction; evidence-backed signature/status/deadline diagnostics with unchanged inputs; exact-byte HMAC validation and malformed signature rejection.
- `npm run test:integration`: passed against the running Express API, real MongoDB/Redis, and bundled receiver. Checked bounded pagination, unknown fixture rejection, foreign-origin mutation rejection, exact approval and extra-destination rejection, diagnostics prerequisite, retained three-check analysis, five concurrent replay approvals, duplicate approval result, successful HTTP 200 acknowledgement, unchanged original evidence, unsigned receiver rejection, exactly one durable audit and exactly one receiver receipt.
- Stopped and restarted only this project's app; repeated integration passed with the retained audit/receipt and without another delivery.
- `npm audit`: zero known vulnerabilities reported after upgrading Zod to the patched version. This is a point-in-time package audit, not a security certification.
- UI dev-server HTTP response passed. `git diff --check` passed.

The computer-use browser host was unavailable, so browser verification subsequently used Chromium in the existing Playwright 1.64.1 Docker image with an internal TCP proxy preserving the real local UI origin. The shipment timeout fixture's diagnosis, explicit approval, successful receiver acknowledgement, retained audit after reload, response inspector, and arrow-key tab focus all passed. No browser runtime errors occurred. A representative desktop axe WCAG 2 A/AA and 2.1 AA scan reported zero violations after correcting text contrast. A 390px mobile viewport had no document overflow. Actual [desktop](screenshots/desktop.png) and [mobile](screenshots/mobile.png) captures were visually inspected. These are bounded workflow/accessibility checks, not comprehensive certification.

Not exercised in this earlier run: forced receiver timeout, MongoDB/Redis outage or crash timing between audit insert and acknowledgement. Those paths retain failure/uncertain/pending states without automatic replay; they should be tested before expanding this into an operational tool. No live inference, real provider credentials, production webhook or cloud deployment was used.
