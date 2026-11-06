# Third-party review and attribution — 2026-11-06

This private repository has no owner-selected open-source license. Its original
code is not granted a new public license by this document. Dependency licenses
remain their authors' licenses; preserve their notices when redistributing them.
All demo events, payloads and screenshots are authored synthetic project data.
No imported production logs, external artwork, fonts or sample collections are
bundled.

## Reproduce the offline inventory

```sh
npm ci
npm run --silent licenses > dependency-license-review.json
```

The command reads the locked dependency graph and installed package metadata,
compares installed versions with the lock, and lists each package's version,
license, development/optional flag, upstream reference and installed notice paths.
It exits nonzero for missing license declarations or version drift. It neither
fetches license data nor decides licensing compatibility automatically.

Actual local review: **286 locked entries**, **211 installed entries** on macOS
(the lock also includes optional platform binaries). All locked entries declare
licenses: MIT 257; ISC 12; Apache-2.0 10; MPL-2.0 2; BSD-3-Clause 2; BSD-2-Clause 1;
0BSD 1; CC-BY-4.0 1. Entries count installation paths, so a duplicate dependency
can appear twice. There are no unknown license declarations in this snapshot.
This is an npm-metadata/notice review, not a review of every upstream source file.

## Principal components and notices

Runtime dependencies: Express (MIT), MongoDB Node driver (Apache-2.0), React and
React DOM (MIT), Redis Node client (MIT), Zod (MIT). Build/test dependencies
include Vite/Rollup (MIT), TypeScript and Playwright (Apache-2.0), tsx (MIT),
concurrently (MIT), Prettier (MIT), and DefinitelyTyped type packages (MIT).
The inventory provides exact resolved versions and upstream references; their
installed `LICENSE`, `NOTICE` and related paths retain author copyright notices.

Two packages need explicit attention outside the common permissive notices:

- `@axe-core/playwright` 4.14.0 and `axe-core` 4.14.0 use MPL-2.0. They are
  development accessibility tools and were not modified. Preserve their license;
  any redistribution/modification of their covered files needs the corresponding
  source/notice handling. `node_modules/axe-core/LICENSE-3RD-PARTY.txt` separately
  lists bundled third-party authors and licenses and must accompany that tool
  when redistributed.
- `caniuse-lite` 1.0.30001822 uses CC-BY-4.0. Its upstream attribution is the
  Browserslist/caniuse-lite project and its contributors; retain the installed
  `LICENSE`, attribution and upstream reference when distributing that data.
  The package/data was not modified.

Ten unique installed package names lack a top-level matching notice file:
`@esbuild/darwin-x64`, the six `@redis/*` packages (bloom, client, graph, json,
search, time-series), `@rollup/rollup-darwin-x64`, `cookie-signature` and
`generic-pool`. A duplicate installation path accounts for eleven inventory
entries. Their license declarations exist;
this review does not manufacture missing notices. The complete installed notice
set remains in `node_modules`; a distributable vendor/binary bundle would need
notice collection beyond this private source repository.

MongoDB 7 and Redis 7 are external local-service container images, not vendored
npm dependencies. Their upstream image/source terms are separate from the npm
client licenses. Image tags are not a source-license inventory or immutable image
pin. No container image redistribution or cloud deployment was performed.
