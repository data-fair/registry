# Agents

## Project overview

Registry is a simple registry for the data-fair stack. It stores plugin definitions and hosts archives of plugin versions. It is built as a monorepo with 4 workspaces: api (Express + MongoDB), ui (Vue 3 + Vuetify), shared, and lib-node.

## Typing

Types are managed from JSON schemas (e.g., @api/config/type/index.ts). Run `npm run build-types` after modifying a schema to regenerate types.

## Quality checks

  - linter: `npm run lint-fix`
  - type checking: `npm run check-types`
  - tests: `npm run test`
  - all at once: `npm run quality`

## Dev environment

Docker runs the containers (nginx, simple-directory, mongo); the api, the upstream api and the ui run as node
processes. registry sends no events, so the dev env has no events service.

- `npm run dev` — the containers (`npm run dev-deps`), then the api, the upstream api and the ui in the terminal
  (Ctrl+C stops them), at `http://localhost:5850/registry/`. Their logs are in `dev/logs/` (`DEV_LOG_DIR`,
  `DEV_LOG_PREFIX`); `npm run dev` accepts docker compose arguments.
- `npm run dev-deps` — the containers only, plus `npm run dev-setup`.
- `npm run dev-setup` — idempotent builds (types, ui), no container.
- `npm run dev:api`, `dev:api-upstream`, `dev:ui` — one process each, with the variables of `.env` exported.
  `api-upstream` is a second registry used as a federation mirror source (port `DEV_UPSTREAM_API_PORT`).
- `npm run stop-dev-deps` — stops the containers.

Default ports (5850-5857) are in `dev/default.env`, copied to `.env` the first time: `.env` overrides it and is
never overwritten. Production names (`MONGO_URL`, `PRIVATE_DIRECTORY_URL`, `SECRET_INTERNAL_SERVICES`,
`SCANNING_ENABLED`...) override `api/config/development.js`. The upstream api takes its database from
`DEV_UPSTREAM_MONGO_URL` when set (default `data-fair-registry-upstream` on `MONGO_PORT`).

The UI and simple-directory are served on `http://$DEV_HOST:$NGINX_PORT`; the APIs answer directly on
`localhost:<port>` too.

- Read the logs before restarting: nodemon (api) and vite (ui) already reload on file changes.
- Do not start, stop or restart the dev processes or containers of the user: ask.
- Never `npm ci` / `npm install` while the env runs.
- If a service is down, do not try to fix the infrastructure: read its logs (`dev/logs/`, or
  `docker compose logs <service>` for a container) and report the problem to the user with the relevant lines.

### Vulnerability scanner (osv-scanner)

Dev config enables npm vulnerability scanning (`api/config/development.js`), but `dev/default.env` turns it off (`SCANNING_ENABLED=false`): set it to `true` in `.env` to work on it. It shells out to the **osv-scanner v2** binary. Install it once so it's on your PATH (Linux x86_64):

    OSV_VERSION=v2.7.0
    sudo curl -sSfL -o /usr/local/bin/osv-scanner \
      "https://github.com/google/osv-scanner/releases/download/${OSV_VERSION}/osv-scanner_linux_amd64"
    sudo chmod +x /usr/local/bin/osv-scanner
    osv-scanner --version

(Any directory on PATH works; drop `sudo` if you install into a user-writable dir.) The offline OSV database (~200 MB) downloads on first scan into `./data/osv-db` and is refreshed by the periodic rescan; extracted artefacts are cached under `./data/tmp/scan-cache`. If osv-scanner is not installed, scans fail gracefully (`scan.status: "error"`) and the rest of the app keeps working.

## Testing

Tests use Playwright as a test runner with 3 project types: unit (*.unit.spec.ts), api (*.api.spec.ts), and e2e (*.e2e.spec.ts). A state setup runs before api and e2e tests; if it reports the API unavailable, see "Dev environment" above.

Run all tests:

    npm run test

Run a specific test file, or a single test. Note `npm run test` is a compound `a && b && c` script, so appending a file to it only filters the *last* project (e2e) and runs the others in full — use the per-project scripts:

    npm run test-api -- tests/artefacts.api.spec.ts
    npm run test-api -- tests/artefacts.api.spec.ts -g "upload happy path"
    npm run test-unit -- tests/artefacts-operations.unit.spec.ts

Test sub-space: the tests own the simple-directory accounts whose ids start with `test_registry_`
(@tests/support/sd-fixtures.ts, password `passwd`, email `<id>@test.com`), seeded through simple-directory's
test API by `tests/global-setup.ts` and, under a lock against a second concurrent run, by `tests/state-setup.ts`.
`DELETE /api/test-env?prefix=test_<suite>_` cleans one sub-space only (400 without a valid prefix):

- the artefacts whose id starts with the prefix, optionally after an `@` (`@test_registry_/pkg@1`,
  `test_registry_terrain`), with their tarballs, thumbnails, scans and scan locks: an artefact a test creates
  carries the prefix in its id, or no clean removes it;
- the api keys created by or owned by the prefix's accounts, and their access grants;
- the remote registries whose name starts with the prefix, with their sync locks.

Several suites can share one registry: the clean of one prefix never touches another prefix nor unprefixed
artefacts. `tests/test-env.api.spec.ts` checks it. The dev world `test_demo_` (`npm run dev-world`,
@dev/resources/demo-world.json, login `test_demo_dev@example.org` / `passwd`, a simple-directory admin) is never
cleaned by the tests; `npm run dev:fixtures` seeds its artefacts as that account.

### Exercising federation sync

Sync mirrors artefacts *from* an upstream registry, so it needs two registries. `api-upstream` is a second registry process (same code, `PORT`/`MONGO_URL`/`DATA_DIR` overridden). Pointing a registry at itself cannot work: selecting an artefact that already exists locally without an `origin` returns 409.

`npm run dev:fixtures` seeds the upstream, mints a read key owned by org `test_demo_org`, registers the mirror and selects two artefacts. Selecting an artefact queues a background sync of that artefact alone (`pendingSync` on the registry doc, drained under the sync lock), so the mirrors land without clicking **Sync now** — that button runs a full sync. Sync progress is published on the registry's ws channel; the admin table gets each row's local state from `GET …/remote-artefacts` and loads upstream thumbnails through `GET …/remote-thumbnails/:id/data` (the browser cannot reach the upstream directly).

Unselecting keeps the local copy but unlocks it (drops `origin`); it then blocks re-mirroring of that id (409) until it is deleted. Deleting a registry unlocks all its mirrors the same way.

`tests/remote-registries-sync.api.spec.ts` covers the mirror path end to end against the same upstream.

## Vulnerability scanning

Advisory, admin-only vulnerability scanning of `npm` artefacts (bundled `node_modules` tarballs) via the bundled **osv-scanner v2** binary. It never blocks uploads or downloads, and scan data is stripped from responses for non-admin callers.

- Controlled by the `scanning.*` config block (`api/config/type/schema.json`); **off by default** (`scanning.enabled`).
- osv-scanner runs in **offline local-DB mode** (`scanning.dbDir`), refreshed on the rescan interval. Bundled, lockfile-less `node_modules` are detected via the `--experimental-plugins javascript/packagejson` extractor on `osv-scanner scan source`.
- Scans run on three triggers: after an npm upload (async, non-blocking), on a periodic interval (`scanning.rescanIntervalHours`, also refreshes the DB), and on-demand via `POST /api/v1/artefacts/:id/scan` (admin).
- A summary lives on the artefact `scan` field (admin-only); full findings are stored in the `artefact-scans` Mongo collection and served by `GET /api/v1/artefacts/:id/scan` (admin).
- Module: `api/src/scanning/` (`operations.ts` pure mapping, `extract.ts` tarball extraction, `runner.ts` osv-scanner subprocess, `service.ts` orchestration, `router.ts` endpoints).
- The osv-scanner binary is bundled in the Docker image (see `Dockerfile`). The mapper's test fixture is `tests/resources/osv-sample-output.json`.
- Extracted artefacts are cached as a mirror under `<tmpDir>/scan-cache/` (config `tmpDir`, env `TMP_DIR`; mount as a k8s `emptyDir`). A scan reuses the cached extraction when the artefact's bytes are unchanged (keyed on `artefact.path`); `rescanAll` prunes slots for deleted artefacts.

## API doc and scopes

`GET /api/v1/api-docs.json` (`api/contract/api-docs.ts`, fr/en from `Accept-Language`) is the OpenAPI
document data-fair fetches over a private URL and merges into its platform document; `@data-fair/openapi-mcp`
turns its `x-agent` annotations into agent tools (`search_artefacts`, `get_artefact`). Design:
`docs/superpowers/specs/2026-11-03-api-doc-scopes-design.md`.

- The session is scope-aware. `api/src/scopes.ts` declares the `registry` scope family (read tier only) and
  the `scopedOperations` table: only those routes (`requireOperationScope`) accept scope-restricted
  sessions, every other route refuses them (lib-express). A scoped session is never admin. A new route that
  scoped tokens should reach goes in the table and in the doc.
- Keep the doc mergeable: the `sdCookie` and `oauth2` schemes keep their exact definitions, registry's own
  `x-api-key` stays under `registryApiKey` (never `apiKey`), `x-agent` uses only openapi-mcp's keys.
- `tests/api-docs.api.spec.ts` pins the agent surface in `tests/fixtures/agent-surface.json`: regenerate
  with `UPDATE_GOLDEN=1 npm run test-api -- tests/api-docs.api.spec.ts` when a change is intended.
- `tests/scopes.api.spec.ts` mints scoped sessions with the test non-human identity `test_registry_org1_scope_nhi`
  (`tests/support/sd-fixtures.ts`, keys in `tests/resources/nhi/`, `tests/support/nhi.ts`); simple-directory
  runs with `MANAGE_NHIS` for it. Bearer tokens are tested through nginx: their audience is the site.

## Logging

Server code logs through `import log from '@data-fair/lib-node/log.js'` (pino: JSON on stdout in
production, pretty in dev); the full API is in the "Logging" section of the `@data-fair/lib-node` README.
eslint `no-console` applies to `api/src/**` and `api/index.ts`.

- `log.info|warn|alert|error(msg, { code?, err?, ...fields })`: `code` is a **static string**, ids go in
  their own fields (`artefactId`, `remoteRegistryId`), the error in `err`, never in the message.
- `error` is for internal failures only (counted in `df_logs`, alerting); client errors, upstream
  failures and expected situations are `warn`.
- The actor (ip, host, user, account) is never passed by hand: `session.middleware()` opens the request
  log context, and background work started from a request inherits it.
- `debug` call sites are unchanged; their output is redirected into the logger.

## Code patterns

  - API route: @api/src/artefacts/router.ts
  - API service: @api/src/artefacts/service.ts
  - API test: @tests/artefacts.api.spec.ts
