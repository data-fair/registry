# Drop per-arch tarballs, add consumer-side native rebuild

**Status:** Approved, ready for plan
**Date:** 2026-05-26
**Author:** brainstormed with Alban

## Problem

The registry models native-module compatibility by storing one tarball slot per `process.arch` value on each npm artefact (`tarballs: { x64?: slot, arm64?: slot, noarch?: slot }`). The slot key only captures CPU architecture. It does not capture libc variant (glibc vs musl), Node.js ABI version, or OS, so a downloaded tarball whose `arch` matches the consumer can still fail at runtime — a glibc-built `node_modules` will not load on Alpine, and a Node 22 build won't work on Node 24. Uploaders work around this today by running `npm ci` inside an alpine docker image during CI, which is brittle and duplicates per-repo.

There are no npm artefacts in production yet, so we can change the model without a data migration. File-format artefacts do exist in production and need a trivial rename. Spa-format artefacts have no production usage and stay untouched in this change.

## High-level approach

- Store a single tarball per npm artefact, not a per-arch map.
- Detect at upload time whether the tarball contains native modules; persist a boolean.
- Have the consumer (via `registry/lib-node`) run `npm rebuild` after extraction when the artefact is flagged, against the consumer's own runtime — letting libc/ABI/OS issues resolve where they actually matter.
- Ship a reusable composite CI action so plugin repos drop their inline build shell.

## Schema changes

### npm artefact

Remove `tarballs: { [arch]: slot }`. Hoist the slot's fields to the artefact root:

```js
path: string                // primary blob (npm tarball)
size: integer
uploadedBy: { ... }
dataUpdatedAt: string
hasNativeModules: boolean   // NEW, detected at upload, read-only
```

No data migration: production has no npm artefacts yet.

### file artefact

Rename `filePath` → `path` for symmetry with npm. `fileName` (the user-facing original filename) stays.

This needs a one-time idempotent boot-time rename in mongo:

```js
// In api/index.ts boot path, before HTTP server accepts connections.
// TODO(0.5.0): remove this once all environments are past 0.4.0.
await db.collection('artefacts').updateMany(
  { filePath: { $exists: true } },
  { $rename: { filePath: 'path' } }
)
```

No upgrade-scripts infrastructure — the operation is two-line idempotent mongo. The TODO comment is the removal handle.

### spa artefact

Unchanged. Keeps `tarballPath` and `extractedPath`. Spa has no production usage; the schema-level heterogeneity is accepted for now.

## Native-module detection

### Where it runs

Same pass that already extracts the npm manifest from the staged tarball: `extractManifest` in `api/src/artefacts/operations.ts`. Extend its return type to `{ manifest, hasNativeModules }` so the tarball is streamed once.

### Detection signals

`hasNativeModules` is true if **any** of these matches at least one tarball entry:

1. Entry path matches `package/node_modules/**/*.node` — a compiled binary is shipped.
2. Entry path matches `package/node_modules/**/binding.gyp` — node-gyp build expected.
3. Any subpackage `package.json` whose `scripts.install`, `scripts.preinstall`, or `scripts.postinstall` references `node-gyp`, `prebuild-install`, `node-gyp-build`, or `node-pre-gyp`.
4. Entry path contains `package/node_modules/**/prebuilds/` — the package ships per-platform prebuilds via `prebuild-install`/`node-gyp-build`.

### Wired into

- `commitNpmUpload` in `api/src/artefacts/service.ts` — writes the boolean alongside the other artefact fields.
- `api/src/remote-registries/sync.ts` mirror path — the boolean is part of the upstream artefact doc and is copied across verbatim, no re-detection on the mirror.

### Schema exposure

`hasNativeModules: { type: 'boolean', readOnly: true }` on the npm artefact, optional (absent treated as false defensively, though detection always sets it).

### Testing

`api/src/artefacts/operations.unit.spec.ts`: hand-built tarballs that exercise each signal in isolation plus a pure-JS tarball that must come back false. `tests/support/test-tarball.ts` is extended to inject the relevant entries.

## lib-node `build` option

### API

```ts
export interface EnsureArtefactOpts {
  registryUrl: string
  secretKey: string
  artefactId: string
  cacheDir: string
  account?: Account
  /**
   * When true, run `npm rebuild` against the extracted node_modules
   * iff the artefact has hasNativeModules=true. No-op otherwise.
   * The cache key incorporates node major + libc, so a Node/libc
   * upgrade forces a fresh extract + rebuild.
   */
  build?: boolean
  // REMOVED: architecture
}
```

### Cache key

```ts
const buildTuple = opts.build ? `${nodeMajor()}-${detectLibc()}` : 'js'
const extractDir = join(artefactDir, buildTuple)
```

- `nodeMajor()` reads `process.versions.node` and parses the major.
- `detectLibc()` reads `process.report.getReport().header.glibcVersionRuntime` — non-empty on glibc, empty/absent on musl.
- A consumer that does not opt into building shares a single `js` slot.

### Build step

After the tarball is extracted to `tmpDir` and `.meta.json` is written, but **before** the rename to `extractDir`:

```ts
if (opts.build && artefact.hasNativeModules) {
  await rebuildNativeModules(tmpDir)
}
```

`rebuildNativeModules(dir)` spawns `npm rebuild` with `cwd: dir`, `stdio: 'pipe'`, and an env locked down for offline use: `npm_config_offline=true`, `npm_config_audit=false`, `npm_config_fund=false`, no `NODE_AUTH_TOKEN`, no proxy. On non-zero exit the staged `tmpDir` is removed and `ensureArtefact` rejects with stderr wrapped — the previously-good cache survives the failure.

### Testing

- Unit: a fake artefact with `hasNativeModules: true` and a tiny `node_modules/<pkg>/package.json` whose `postinstall` writes a sentinel file. After `ensureArtefact({ build: true })`, assert the sentinel exists. With `build: false` or `hasNativeModules: false`, assert it doesn't.
- Negative: a postinstall that exits 1 must cause `ensureArtefact` to reject and the prior cache to survive.
- Cache reuse: two calls back-to-back; second call's `downloaded: false` and no rebuild runs.

## Reusable composite CI action

### Location

`.github/actions/publish-plugin/action.yml` in `data-fair/registry`. Referenced from plugin repos as `uses: data-fair/registry/.github/actions/publish-plugin@<tag>`.

### Inputs

```yaml
inputs:
  registry-url:
    description: "Base URL of the registry"
    required: true
  category:
    description: "Artefact category (processing, catalog, application, ...)"
    required: true
  artefact-id:
    description: "Override the computed artefact id"
    required: false
  ref-suffix:
    description: "Suffix appended to artefact id. Default: major version on tag pushes, branch name on branch pushes"
    required: false
  api-key:
    description: "Registry upload API key"
    required: true
```

### Steps

1. `actions/setup-node@v4` using the caller's `.nvmrc`.
2. `npm ci --omit=dev --omit=optional --no-audit --no-fund` on the runner (glibc x64). No `docker run` — the consumer will rebuild natively.
3. Compute artefact id from `package.json` name + ref (tag → major, branch → branch name), or use the input override. On tag pushes, assert tag matches `package.json` version.
4. Repack `package/` with `node_modules` into `with-deps.tgz`.
5. `curl -sS --fail-with-body -X POST $registry-url/api/v1/artefacts/npm/$encoded-id -H "x-api-key: $api-key" -F category=$category -F file=@with-deps.tgz`. No `architecture` field.

### Caller workflow

A plugin repo's workflow shrinks to roughly:

```yaml
name: Publish main to Staging
on: { push: { branches: [main] } }
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: data-fair/registry/.github/actions/publish-plugin@v0.4.0
        with:
          registry-url: https://staging-koumoul.com/registry
          category: processing
          api-key: ${{ secrets.REGISTRY_API_KEY }}
```

### Pinning

Plugin repos pin to a registry tag (`@v0.4.0`) in production; `@main` is acceptable for staging-only flows.

## processing-gpkg changes

Both workflows (`publish-main.yml`, `publish.yml`) shrink to ~15 lines each, delegating to the composite action. Removed: `ALPINE_NODE_IMAGE` env, inline `docker run`, `architecture` form field, all repacking shell. Kept: tag-matches-version assertion (moves into the action), `package.json#files`, `package-lock.json`, `.nvmrc`. No changes to the plugin's own source.

## processings consumer changes

### Plugin-install call site

The worker code that calls `ensureArtefact` passes `build: true` unconditionally instead of `architecture: hostArch`. `build: true` is a no-op when `hasNativeModules` is false, so pure-JS plugins pay nothing.

### v5.2.0 migration script

`processings/upgrade/5.2.0/01-publish-plugins-to-registry.ts` stays in place because v5 deployments may still upgrade to v6 in production. Adapted:

- Probe becomes `probe.data?.path` (was `probe.data?.tarballs?.[hostArch]`).
- Upload drops the `form.append('architecture', hostArch)` line.

The probe is now "is the artefact already published" rather than "is this arch already published"; idempotency still holds because the script only uploads if `path` is absent.

### Worker Dockerfile

Add a build toolchain so `npm rebuild` works on packages that compile from source:

```dockerfile
# alpine base
RUN apk add --no-cache python3 make g++

# OR debian-slim base
RUN apt-get update && apt-get install -y python3 build-essential && rm -rf /var/lib/apt/lists/*
```

Most plugins ship prebuilds for linux-x64-musl, so rebuilds will be near-instant in practice; the toolchain covers the long tail.

### Cache invalidation on worker upgrade

Free from the lib-node cache-key change: a Node/libc upgrade in the worker's base image invalidates the extract dir naturally on next plugin load. No manual cache-purge step.

### Testing

- Worker integration test that loads a plugin marked `hasNativeModules: true` and asserts the rebuild ran (sentinel-file approach).
- Migration regression: re-run the 5.2.0 script against a seeded mongo + volume and assert resulting artefact docs have `path` rather than `tarballs`.

## Registry-side adaptation outside the artefact router

- `api/src/remote-registries/sync.ts`: drop the `?architecture=` query from the tarball URL; read `path` instead of iterating `tarballs`; write into the flat shape.
- `ui/`: replace reads of `artefact.tarballs`, `artefact.filePath`, `artefact.tarballPath` with `artefact.path`. Surface `hasNativeModules` as a small badge on npm artefact detail.
- `tests/artefacts.api.spec.ts`: rewrite assertions over `res.data.artefact.tarballs.x64.size` to the new shape; collapse "per-arch" tests that no longer have meaning; keep the "happy path upload" and "re-upload swaps tarball" tests.

## Deploy order

1. **Registry 0.4.0** ships with: new npm schema, `filePath → path` boot-time rename, native-module detection, new lib-node API, composite action.
2. **processings**: bump to new lib-node, drop `architecture` from the v5.2.0 migration, add toolchain to worker Dockerfile.
3. **processing-gpkg** (and future plugin repos): switch to the composite action.

Step 1 must land first. Steps 2 and 3 are independent.

## Risks and rollback

- The schema change is hard-cutover. Rollback after deployment would require re-introducing the per-arch shape and a corresponding inverse migration. Since the change ships before any npm artefacts exist in production, the practical rollback path is simply rolling back the registry image.
- `npm rebuild` on the consumer can fail if a package needs to compile from source and the toolchain is missing. Mitigation: the processings Dockerfile change in §"Worker Dockerfile" adds the toolchain. Failures surface as `ensureArtefact` rejecting with stderr, and the prior cache survives.
- A plugin that ships prebuilds only for a different libc/arch combination will fall back to source build. If the source isn't shipped (rare but possible with `node-pre-gyp` packages that exclude `src/` from `files`), the rebuild fails with a clear stderr. Operator response: ship the plugin's `node_modules` from a build environment closer to the consumer, or include the source in the plugin tarball.

## Testing strategy (overall)

- **Unit**: native-module detection (4 signal cases + negative), lib-node build option (positive + negative + cache-reuse).
- **API**: replace per-arch tests with single-tarball tests; assert `hasNativeModules` round-trips correctly through upload + download.
- **Integration** (processings worker): plugin with native modules round-trip — upload → ensureArtefact({build:true}) → sentinel verifies rebuild ran.
- **Manual smoke**: deploy the composite action to a sandbox plugin repo, verify upload succeeds against a staging registry.
