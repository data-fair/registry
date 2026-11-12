# Contributing

## Prerequisites

- Node.js, the version of `.nvmrc` (start zellij from a shell on it: the panes inherit its PATH)
- Docker and Docker Compose v2
- zellij >= 0.44

## Setup

The dev environment is the shared one of the data-fair services (`@data-fair/lib-dev`): a zellij
session per checkout, described by `.zellij.kdl` and `dev/dev.json`.

1. Install dependencies, then write `.env` (free ports drawn for this checkout), build the types and the UI:
   ```bash
   npm ci
   npx --no df-dev setup
   ```

2. Start the session (containers, API, upstream API, UI):
   ```bash
   npm run dev-zellij
   ```
   The footer pane prints the URL. `npx --no df-dev status` shows what runs, `npx --no df-dev logs <pane>`
   prints a pane's output.

3. A new branch in its own worktree, from the main checkout:
   ```bash
   npx --no df-worktree <branch>          # creates ../registry_<branch>, npm ci + setup
   npx --no df-worktree-delete <branch>   # removes it with its containers and zellij session
   ```
   Branch names: letters, digits, `.`, `_`, `-`, no `/`, and `registry_<branch>` at most 60 characters.

## Workspaces

| Workspace | Path | Description |
|-----------|------|-------------|
| api | `api/` | Express API server |
| ui | `ui/` | Vue 3 frontend |
| shared | `shared/` | Shared types and config schemas |
| lib-node | `lib-node/` | Node.js client library for consuming artefacts |

## Scripts

```bash
npm run dev-zellij    # Start the dev environment
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
