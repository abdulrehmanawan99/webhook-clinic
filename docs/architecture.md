# Architecture and threat boundaries

One Express process owns the Clinic API and a second, bundled receiver listener. Vite serves React and proxies `/api` locally. MongoDB persists sanitized deliveries, retained diagnoses, approval/replay audits, and receiver receipts. Redis supplies a 10-second, owner-checked replay lock. No queue, inference SDK or generic provider abstraction is needed for this slice.

## Data flow

1. Known synthetic fixtures are recursively redacted before insert. Authorization, cookies, signatures, token/secret/password/email keys are replaced; raw synthetic secret values are not persisted. This redactor is tailored to these known fixtures and is not a safe arbitrary-data ingestion pipeline.
2. Delivery snapshots have no update API. Diagnostics run exactly three rules, retain evidence and are uniquely keyed by delivery ID. These fixture rules are a small explicit reasoning boundary; no live AI result is claimed.
3. A POST with the exact approval literal creates a durable audit before network work. MongoDB uniqueness fences races even after Redis expiry/restart. The audit correlation UUID accompanies the new signed request.
4. Receiver validates HMAC over exact bytes, fixture ID and pre-existing approval audit; its unique correlation receipt prevents duplicate processing. It does not store incoming payload or headers. The sender records status and bounded generic result, not arbitrary response bodies.

## Controls and limits

- API/UI/database/cache listeners use loopback. API mutation requires the exact UI Origin and API Host is checked. No CORS enablement. This is not authentication; trusted local processes and people with database access remain privileged.
- API request bodies and receiver payloads are capped at 16 KiB. Fixed fixture IDs and strict approval/pagination schemas reject extra fields; list limits are 1–20 and pages 1–100. HTTP server header/request bounds are 5 seconds. Replay network deadline is 1.5 seconds; redirect following is forbidden.
- Replay destination is a code constant, not request input or an environment setting. No user-provided URLs, headers, secrets, or production data are accepted. The demo HMAC key is intentionally synthetic and not a production credential.
- If Redis fails, a new replay fails closed. MongoDB unique indexes preserve deduplication. After uncertain delivery or a crash, pending/uncertain audit is retained with no automatic retry. The system does not promise distributed exactly-once delivery.
- Redaction, constraints and immutable snapshots protect this small fixed fixture workflow. This does not provide tamper-evident auditing against a database administrator or secure untrusted deployment.

Remaining scope is intentionally small: no arbitrary ingestion, auth, cloud, live provider, production replay or manual retry/reset UI. Bindings must remain local.
