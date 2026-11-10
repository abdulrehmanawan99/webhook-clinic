# Local threat model

Scope: one trusted OS user running one installation on loopback with synthetic fixtures. This summarizes controls already described in [architecture](architecture.md) and the [release review](release-review.md). It is not a hosted-deployment approval or a security certification.

## Assets

- Immutable, redacted delivery evidence; retained diagnoses, investigations, replay audits and receiver receipts in MongoDB.
- The demo HMAC signing key (`DEMO_SIGNING_KEY`, synthetic by design) and the optional `GEMINI_API_KEY`.
- Replay integrity: at most one approved delivery per fixture, only to the bundled receiver.

## Trust boundaries

| Boundary | Controls | Residual risk |
|---|---|---|
| Browser to API | Loopback listeners; exact `Host` check; mutations require the exact UI `Origin` (follows `CLINIC_UI_PORT`); no CORS; 16 KiB bodies; strict schemas reject extra fields; 5 s server header/request bounds | Not authentication. Any local process or user with loopback or database access is trusted |
| Replay to controlled receiver | Requires a retained diagnosis and the exact approval literal; a durable audit is written before network work; destination is `127.0.0.1:<receiver port>/receive`, never request input; redirects and automatic retries disabled; 1.5 s deadline; Redis lock plus MongoDB unique indexes on audit and receipt | No distributed exactly-once promise. A crash or timeout leaves a pending/uncertain audit that is shown, not retried |
| HMAC secrets | Signatures verified over private exact bytes before redaction; only result, byte count and body hash persisted; authorization, cookie, signature, token, secret, password and email keys redacted; keys never sent to the browser, logs or MongoDB | The redactor is tailored to the known fixtures and is not a safe pipeline for arbitrary data |
| Untrusted payloads in model prompts | Gemini receives only the three retained synthetic diagnostic findings, never raw payloads or secrets; fixed endpoint, no tools, no SDK; strict JSON schema, allowlisted check IDs and exact citation matching; refusal, truncation, malformed or oversized (32 KiB) output fails closed; 10 s deadline; one durable attempt per delivery and mode | Prompt-injection resistance is checked with mocked rejection tests only; live behavior is verified on three synthetic cases |
| Coordination stores | Redis and MongoDB published only on loopback; Redis calls bounded at 1 s with a 128-command queue; Redis failure makes new replays fail closed | Redis has no password; anyone with local database access can alter records. Audits are not tamper-evident |

## Threats and mitigations

- **Cross-site request from another website** — rejected by the exact Origin/Host checks and missing CORS headers.
- **Replay to an attacker-chosen destination (SSRF)** — no destination, URL or header is accepted from requests; client-supplied destinations are rejected and redirects produce zero requests (scenario test).
- **Duplicate or concurrent replay** — the audit-first design plus unique indexes return the existing audit (integration test with concurrent approvals).
- **Secret disclosure** — synthetic keys only; `.env` is ignored by git; `npm run check:secrets` scans tracked text and the frontend bundle for common key patterns.
- **Model fabricates evidence or attempts actions** — the model can only select allowlisted checks with exact quotes; all prose comes from deterministic rules; it cannot replay or choose a destination.
- **Resource exhaustion** — bounded bodies, pagination limits, request and network deadlines, and a single provider attempt per delivery and mode.

## Residual risks

Trusted-machine scope only: no accounts, no TLS and no protection against local malware or database administrators. The Vite development server must stay on loopback. Gemini billing, quota and data use are governed by the key owner's Google project. Dependency audits and secret scans are point-in-time checks. Public hosting would need authentication, network policy, secret management and a new review.
