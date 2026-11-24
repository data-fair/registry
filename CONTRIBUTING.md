# Contributing

## Prerequisites

- Node.js, the version of `.nvmrc`
- Docker and Docker Compose v2

## Setup

```bash
npm ci
npm run dev
```

`npm run dev` copies `dev/default.env` to `.env` the first time (fixed ports 5850-5857; `.env` overrides
them and is never overwritten), builds the types and the UI once, starts the containers (nginx,
simple-directory, mongo), then the API, the upstream API and the UI in the terminal. Ctrl+C stops them.
The UI is at `http://localhost:5850/registry/`, the process logs in `dev/logs/`.

`npm run dev-deps` starts only the containers; `npm run dev:api`, `dev:api-upstream` and `dev:ui` run one
process each, with the variables of `.env` exported.

## Workspaces

| Workspace | Path | Description |
|-----------|------|-------------|
| api | `api/` | Express API server |
| ui | `ui/` | Vue 3 frontend |
| shared | `shared/` | Shared types and config schemas |
| lib-node | `lib-node/` | Node.js client library for consuming artefacts |

## Scripts

```bash
npm run dev           # Start the dev environment
npm run dev:fixtures  # Seed the dev environment (upstream registry, mirror, artefacts)

npm run test          # Run all tests (unit, api, e2e)
npm run test-api -- tests/artefacts.api.spec.ts  # Run a specific test file

npm run lint-fix      # Fix linting issues
npm run check-types   # TypeScript type checking
npm run build-types   # Regenerate types from JSON schemas
npm run quality       # All checks at once (lint + types + tests)
```

## Types

Types are generated from JSON schemas in `api/config/type/`. After modifying a schema, run:

```bash
npm run build-types
```

## Testing

Tests use [Playwright](https://playwright.dev/) as a test runner with 3 project types:

- **unit** (`*.unit.spec.ts`) -- Pure logic tests
- **api** (`*.api.spec.ts`) -- API integration tests against a running dev environment
- **e2e** (`*.e2e.spec.ts`) -- Browser-based end-to-end tests

A state setup runs automatically before api and e2e tests. Test users are defined in `dev/resources/users.json`.

## Commits

This project uses [conventional commits](https://www.conventionalcommits.org/). A commitlint hook validates commit messages.
