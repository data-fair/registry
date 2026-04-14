# Contributing

## Prerequisites

- Node.js 24
- Docker & Docker Compose

## Setup

```bash
# Install dependencies
npm install

# Initialize .env with default ports
./dev/init-env.sh

# Start API and UI dev servers (uses zellij)
npm run dev-zellij
```

Check if services are running:

```bash
./dev/status.sh
```

Dev logs are written to `dev/logs/`.

## Workspaces

| Workspace | Path | Description |
|-----------|------|-------------|
| api | `api/` | Express API server |
| ui | `ui/` | Vue 3 frontend |
| shared | `shared/` | Shared types and config schemas |
| lib-node | `lib-node/` | Node.js client library for consuming artefacts |

## Scripts

```bash
npm run dev-api       # Start API with nodemon
npm run dev-ui        # Start UI with Vite HMR

npm run test          # Run all tests (unit, api, e2e)
npm run test tests/artefacts.api.spec.ts  # Run a specific test file

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

State setup/teardown fixtures run automatically before api and e2e tests. Test users are defined in `dev/resources/users.json`.

## Commits

This project uses [conventional commits](https://www.conventionalcommits.org/). A commitlint hook validates commit messages.
