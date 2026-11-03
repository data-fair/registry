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

The dev environment is the shared one of the data-fair services (`@data-fair/lib-dev`, the
`data-fair-service` skill of data-fair/lib): one zellij session per checkout, readable by humans,
operated by agents only through `df-dev`. `dev/dev.json` declares what is specific to this repo (drawn
ports, panes and their readiness URLs, optional containers), `.zellij.kdl` the panes: `status`
(containers), `ui`, `api` (the registry), `api-upstream` (a second registry used as a federation mirror
source, port `DEV_UPSTREAM_API_PORT`), and a free shell.

The user starts the session (`npm run dev-zellij`). An agent never starts or kills it.

| Need | Command |
|---|---|
| What runs, what is broken | `npx --no df-dev status` (containers, panes running / exited / **not ready**, memory) |
| A process's output | `npx --no df-dev logs <pane> -n 100` (`api`, `api-upstream`, `ui`) |
| Restart one process | `npx --no df-dev restart <pane>`: Ctrl+C, rerun, waits for the pane's readiness URL |
| An optional container | `npx --no df-dev up events` / `down events`, then `restart api` so the config sees it |

- Read the logs before restarting: nodemon and vite already reload on file changes.
- "not ready" from `restart` → report to the user with the logs, never retry in a loop.
- Never `docker compose restart`, `kill`, `zellij action`, nor `npm ci` / `npm install` while the env runs
  (watchers restart on half-installed modules).
- Always `npx --no`: a bare `npx df-dev` downloads an unrelated public package when the dependency is
  missing (dependency confusion). Scripts and CI call `./node_modules/.bin/df-dev`.

Containers: nginx, simple-directory and mongo are the core; `events` is optional (compose profile
`events`, started with `npm run dev-zellij -- --services events` or `df-dev up events`). While it does not
run, the api panes start with `privateEventsUrl` unset (`df-dev absent-config`, dev/dev.json "optional").
CI starts every profile.

The UI and simple-directory are served on `http://$DEV_HOST:$NGINX_PORT` (`<branch>.localhost`, so the
session cookies of two worktrees never mix); the APIs answer directly on `localhost:<port>` too.

Worktrees, from the main checkout: `npx --no df-worktree <branch>` / `npx --no df-worktree-delete <branch>`
(branch names: letters, digits, `.`, `_`, `-`, no `/`, and `registry_<branch>` at most 60 characters).

Ports are drawn per checkout into `.env` (`npx --no df-dev init-env`). Do not modify them.

If a service is down, do not try to fix the infrastructure: run `npx --no df-dev status`, read the pane's
logs (`npx --no df-dev logs <pane>`, or `docker compose logs <service>` for a container), and report the
problem to the user with the relevant lines.

### Vulnerability scanner (osv-scanner)

Dev config enables npm vulnerability scanning (`api/config/development.js`), which shells out to the **osv-scanner v2** binary. Install it once so it's on your PATH (Linux x86_64):

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

Test users are defined in @dev/resources/users.json and organizations in @dev/resources/organizations.json.

### Exercising federation sync

Sync mirrors artefacts *from* an upstream registry, so it needs two registries. `api-upstream` is a second registry process (same code, `PORT`/`MONGO_URL`/`DATA_DIR` overridden). Pointing a registry at itself cannot work: selecting an artefact that already exists locally without an `origin` returns 409.

`npm run dev:fixtures` seeds the upstream, mints a read key owned by org `test1`, registers the mirror and selects two artefacts. Selecting an artefact queues a background sync of that artefact alone (`pendingSync` on the registry doc, drained under the sync lock), so the mirrors land without clicking **Sync now** — that button runs a full sync. Sync progress is published on the registry's ws channel; the admin table gets each row's local state from `GET …/remote-artefacts` and loads upstream thumbnails through `GET …/remote-thumbnails/:id/data` (the browser cannot reach the upstream directly).

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
