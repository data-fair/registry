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

Four dev processes run under zellij: `api` (the registry, port `DEV_API_PORT`), `api-upstream` (a second registry used as a federation mirror source, port `DEV_UPSTREAM_API_PORT`), `ui`, and `deps` (docker compose).

Log files are in `dev/logs/` (dev-api.log, dev-api-upstream.log, dev-ui.log, docker-compose.log).

## Testing

Tests use Playwright as a test runner with 3 project types: unit (*.unit.spec.ts), api (*.api.spec.ts), and e2e (*.e2e.spec.ts). State setup/teardown fixtures run before api and e2e tests.

Run all tests:

    npm run test

Run a specific test file, or a single test. Note `npm run test` is a compound `a && b && c` script, so appending a file to it only filters the *last* project (e2e) and runs the others in full — use the per-project scripts:

    npm run test-api -- tests/artefacts.api.spec.ts
    npm run test-api -- tests/artefacts.api.spec.ts -g "upload happy path"
    npm run test-unit -- tests/artefacts-operations.unit.spec.ts

Test users are defined in @dev/resources/users.json and organizations in @dev/resources/organizations.json.

### Exercising federation sync

Sync mirrors artefacts *from* an upstream registry, so it needs two registries. `api-upstream` is a second registry process (same code, `PORT`/`MONGO_URL`/`DATA_DIR` overridden). Pointing a registry at itself cannot work: selecting an artefact that already exists locally without an `origin` returns 409.

`npm run dev:fixtures` seeds the upstream, mints a read key owned by org `test1`, registers the mirror and selects two artefacts. It stops short of syncing — click **Sync now** in the admin UI.

`tests/remote-registries-sync.api.spec.ts` covers the mirror path end to end against the same upstream.

## Code patterns

  - API route: @api/src/artefacts/router.ts
  - API service: @api/src/artefacts/service.ts
  - API test: @tests/artefacts.api.spec.ts
