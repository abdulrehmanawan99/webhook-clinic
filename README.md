# Webhook Clinic

A local inspection desk for failed webhook deliveries. React + Vite/TypeScript, Express/TypeScript, MongoDB and Redis. Three synthetic failures cover an invalid signature, HTTP 503 and a delivery timeout. All analysis is **deterministic fixture reasoning**; no model or production provider is connected.

## Run locally

Requires Node 22+ and Docker Compose. Use these dedicated loopback ports: UI **5174**, API **8011**, controlled receiver **9011**, MongoDB **27018**, Redis **6381**. Check that they are free first; do not stop unrelated applications.

```sh
npm ci
docker compose up -d --wait
npm run dev
```

Open **http://127.0.0.1:5174** (use this exact host; mutation origin checks intentionally reject other origins). Select a fixture, inspect request/response snapshots, run diagnostics, review their source evidence, check the explicit approval box, then replay. A retained audit replaces the approval control. Other fixtures remain available to exercise the flow.

Defaults work without an env file. `.env.example` documents optional overrides. To use one, copy it to `.env` and export its variables in your shell before starting; the app does not automatically load it. Only synthetic signing material belongs here.

```sh
npm run build             # strict type check + UI bundle
npm test                  # domain and signing checks, no services required
npm run test:integration  # running app + local MongoDB required; retains audit
npm audit
```

`npm start` runs the API and bundled receiver only. `npm run dev` also runs Vite. Ctrl-C stops the application. `docker compose stop` preserves MongoDB data. No reset or deletion is needed; seed insertion uses `$setOnInsert` and repeated approvals return the existing audit.

## Workflow and boundaries

- Sanitized fixtures are inserted once and served as immutable request/response evidence. There is no ingestion or edit endpoint.
- Three fixed diagnostic checks retain a finding timeline with exact source fields. Signature validity is an explicit fixture flag, **not live verification of the original delivery**.
- Replay requires a retained diagnosis plus explicit approval. The server signs a new synthetic payload and sends it only to the compiled-in `127.0.0.1:9011/receive` destination. Client-supplied destinations are rejected. Redirects and automatic retries are disabled.
- Redis holds a short replay coordination lock. MongoDB unique indexes enforce one audit per delivery and one receiver receipt per correlation ID. Redis is coordination, never the durable source of truth.
- Each fixture allows one retained attempt, including failure or uncertain acknowledgement. This deliberate limit avoids accidental duplicate delivery. A process crash after approval can leave a pending audit; inspect it rather than replaying automatically.

See [architecture and threat boundaries](docs/architecture.md) and [actual verification](docs/verification.md). This is a trusted-machine portfolio demo, with no accounts, production credentials, external destinations, background workers, or live inference.
