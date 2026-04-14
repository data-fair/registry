# Data-Fair Registry

A simple registry for the [data-fair](https://github.com/data-fair) stack. It stores plugin definitions and hosts archives of plugin versions.

Services in the data-fair ecosystem use the registry to discover, download and cache plugins (processings, catalogs, applications) and file artefacts (tilesets) at runtime.

See [docs/architecture.md](docs/architecture.md) for a detailed overview of how the registry fits into the stack.

See [docs/ci-integration.md](docs/ci-integration.md) for recommendations on how to push to the registry from CI workflows.

## Tech stack

Monorepo with 4 workspaces:

| Workspace | Stack |
|-----------|-------|
| **api** | Express 5, MongoDB |
| **ui** | Vue 3, Vuetify 4, Vite |
| **shared** | Shared types and config |
| **lib-node** | Node.js client library (`ensureArtefact()`) |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE)
