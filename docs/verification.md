# Verification record

Verified locally on 2026-11-05 with Node 22.11.0 and Docker Compose 5.2.0.

- `docker compose up -d --wait`: MongoDB 7 and Redis 7 became healthy, using only this project's containers/volume and loopback ports 27018/6381.
- `npm run build`: strict TypeScript check and Vite production build passed.
- `npm test`: 3 domain tests passed: recursive fixture redaction; evidence-backed signature/status/deadline diagnostics with unchanged inputs; exact-byte HMAC validation and malformed signature rejection.
- `npm run test:integration`: passed against the running Express API, real MongoDB/Redis, and bundled receiver. Checked bounded pagination, unknown fixture rejection, foreign-origin mutation rejection, exact approval and extra-destination rejection, diagnostics prerequisite, retained three-check analysis, five concurrent replay approvals, duplicate approval result, successful HTTP 200 acknowledgement, unchanged original evidence, unsigned receiver rejection, exactly one durable audit and exactly one receiver receipt.
- Stopped and restarted only this project's app; repeated integration passed with the retained audit/receipt and without another delivery.
- `npm audit`: zero known vulnerabilities reported after upgrading Zod to the patched version. This is a point-in-time package audit, not a security certification.
- UI dev-server HTTP response passed. `git diff --check` passed.

Browser screenshot and interactive visual/keyboard verification were attempted through the available computer-use tool, but it returned **“The browser access host is unavailable.”** No screenshots or browser acceptance are claimed. Responsive CSS, native controls, visible focus, loading/error/empty feedback, and arrow-key evidence-tab switching are implemented; manual visual confirmation remains pending.

Not exercised: forced receiver timeout, MongoDB/Redis outage or crash timing between audit insert and acknowledgement. Those paths retain failure/uncertain/pending states without automatic replay; they should be tested before expanding this into an operational tool. No live inference, real provider credentials, production webhook or cloud deployment was used.
