# CI recipe: publish plugin tarball with bundled deps (tag flow)

- **Date:** 2026-05-19
- **Branch:** feat-processings-integration
- **Status:** approved, in implementation

## Goal

Make adding registry CI to a `@data-fair/*` plugin (processing / catalog /
application) a copy-paste exercise: one API key, one GitHub environment, one
workflow file. The artefact uploaded is one tarball that combines `npm pack`
output with a production `node_modules` tree installed inside the same Alpine
image that consumer services run on. This iteration covers **tag-based
publishing only** (`push: tags: ['v*']` → production registry). The
`main`-branch / staging flow is a separate, later topic.

## Scope

**In:**

- Rewrite of the GitHub Actions section in `docs/ci-integration.md` so it
  reads as a step-by-step ("API key → environment secret → workflow YAML").
- Bundled-deps build step using `docker run node:24.11.1-alpine3.22 npm ci`.
- Architecture tag `x64` on upload (matches `process.arch` consumer default
  in `lib-node/index.ts`).
- One worked example: `.github/workflows/publish.yml` committed to
  `data-fair/processing-gpkg`, pushing to `https://koumoul.com/registry`.

**Out (deferred to a later iteration):**

- `main` → staging publishing flow (needs a version-uniqueness scheme).
- Multi-arch matrix (arm64).
- Composite actions / reusable workflows.
- GitLab CI updates (the existing examples stay as-is).

## Tarball assembly

```
npm pack                                                  # ./<name>-<version>.tgz
mkdir staging
tar xzf <name>-<version>.tgz -C staging                   # ./staging/package/...
cp package-lock.json staging/package/
docker run --rm -v "$PWD/staging/package:/work" -w /work \
  node:24.11.1-alpine3.22 \
  npm ci --omit=dev --omit=optional --no-audit --no-fund
tar czf with-deps.tgz -C staging package
```

Properties:

- Output preserves the `package/` top-level prefix produced by `npm pack`, so
  `extractManifest` in `api/src/artefacts/service-pure.ts` (which only accepts
  `package/package.json`) keeps working.
- `npm pack` excludes `package-lock.json`; we copy it in before `npm ci` so
  the install is fully reproducible (no resolver round-trips).
- `npm pack` *also* excludes `node_modules` even when it appears in `files`,
  which is why we repack after install rather than declaring `node_modules`
  in `package.json#files`.
- Build runs as root inside the container — fine for ephemeral CI;
  `--rm` discards the container after.
- The Alpine image must match the consumer's base image — currently
  `node:24.11.1-alpine3.22` (see `processings/Dockerfile`). When the
  processings base image rolls forward, this recipe needs to roll with it.

## Upload

```
curl -f -X POST "$REGISTRY_URL/api/v1/artefacts/$ENCODED_NAME/versions" \
  -H "x-api-key: $REGISTRY_API_KEY" \
  -F "architecture=x64" \
  -F "file=@with-deps.tgz"
```

The registry treats `architecture` as opaque (see `Version.architecture` in
`api/src/artefacts/router.ts:259` and `:304`). Consumer-side
`ensureArtefact` (`lib-node/index.ts:56`) defaults to `process.arch`, so the
tag `x64` is what a Node process on x86_64 will request with zero
configuration.

## API key model

One key per plugin per registry. Scoped via `allowedName=<package.json#name>`
(enforced in `api/src/artefacts/router.ts:215`). Created by a superadmin in
the registry UI ("Admin → API keys") — operators can also `POST
/api/v1/api-keys` from a superadmin session, but UI is the documented happy
path.

The raw key is shown once at creation and only the SHA-512 is stored, so the
"copy now and put it in the CI secret" step happens together.

## GitHub setup

- Environment named `production`, with a required reviewer and (optionally)
  restricted to `v*` tags via the environment's "deployment branches" rule.
- Environment secret `REGISTRY_API_KEY`.
- Workflow trigger: `push: tags: ['v*']`.
- Pre-upload sanity check: the tag's version must equal `package.json#version`,
  else the job fails fast — guards against mismatched releases.

## Worked example: `processing-gpkg`

One file: `.github/workflows/publish.yml`.

- Hardcoded `REGISTRY_URL: https://koumoul.com/registry`.
- Hardcoded `ALPINE_NODE_IMAGE: node:24.11.1-alpine3.22`.
- Package name `@data-fair/processing-gpkg` derived at runtime from
  `package.json`.
- `actions/checkout@v4` and `actions/setup-node@v4` pinned by major (the
  existing recipe's security section recommends SHA pinning; we leave that
  upgrade for a follow-up to keep the example readable).

## Out-of-scope deferrals

- **Staging from `main`.** Separate topic. Open question: a unique version
  per push (prerelease suffix) vs. a "latest" pointer the registry doesn't
  currently model. Will revisit after this iteration ships.
- **arm64.** Build the same way on an arm64 runner with `architecture=arm64`.
  Recipe documented as "future work" rather than scaffolded today.

## Risk notes

- **Docker pin.** Recipe uses the Alpine *tag* (`node:24.11.1-alpine3.22`)
  rather than a digest, matching the project's `Dockerfile`. Pinning by
  digest is mentioned as a hardening upgrade but not made the default — a
  digest in the example would rot.
- **Docker on the runner.** Default `ubuntu-latest` runners have Docker.
  Self-hosted or container-mode runners may not.
- **Native modules on glibc consumers.** A future glibc-based consumer would
  crash on Alpine-built native binaries. Not a concern today since every
  consumer is Alpine.
