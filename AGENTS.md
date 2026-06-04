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

The development processes are managed by the user using zellij and docker compose. An agent should never start/stop/restart processes in the dev environment.

Check if services are running: `bash dev/status.sh`

Log files are in `dev/logs/` (dev-api.log, dev-ui.log, docker-compose.log).

## Testing

Tests use Playwright as a test runner with 3 project types: unit (*.unit.spec.ts), api (*.api.spec.ts), and e2e (*.e2e.spec.ts). State setup/teardown fixtures run before api and e2e tests.

Run all tests:

    npm run test

Run a specific test file:

    npm run test tests/artefacts.api.spec.ts

Test users are defined in @dev/resources/users.json and organizations in @dev/resources/organizations.json.

## Vulnerability scanning

Advisory, admin-only vulnerability scanning of `npm` artefacts (bundled `node_modules` tarballs) via the bundled **osv-scanner v2** binary. It never blocks uploads or downloads, and scan data is stripped from responses for non-admin callers.

- Controlled by the `scanning.*` config block (`api/config/type/schema.json`); **off by default** (`scanning.enabled`).
- osv-scanner runs in **offline local-DB mode** (`scanning.dbDir`), refreshed on the rescan interval. Bundled, lockfile-less `node_modules` are detected via the `--experimental-plugins javascript/packagejson` extractor on `osv-scanner scan source`.
- Scans run on three triggers: after an npm upload (async, non-blocking), on a periodic interval (`scanning.rescanIntervalHours`, also refreshes the DB), and on-demand via `POST /api/v1/artefacts/:id/scan` (admin).
- A summary lives on the artefact `scan` field (admin-only); full findings are stored in the `artefact-scans` Mongo collection and served by `GET /api/v1/artefacts/:id/scan` (admin).
- Module: `api/src/scanning/` (`operations.ts` pure mapping, `extract.ts` tarball extraction, `runner.ts` osv-scanner subprocess, `service.ts` orchestration, `router.ts` endpoints).
- The osv-scanner binary is bundled in the Docker image (see `Dockerfile`). The mapper's test fixture is `tests/resources/osv-sample-output.json`.

## Code patterns

  - API route: @api/src/artefacts/router.ts
  - API service: @api/src/artefacts/service.ts
  - API test: @tests/artefacts.api.spec.ts
