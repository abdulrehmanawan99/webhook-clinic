# Verification record

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

Not exercised: forced receiver timeout, MongoDB/Redis outage or crash timing between audit insert and acknowledgement. Those paths retain failure/uncertain/pending states without automatic replay; they should be tested before expanding this into an operational tool. No live inference, real provider credentials, production webhook or cloud deployment was used.
