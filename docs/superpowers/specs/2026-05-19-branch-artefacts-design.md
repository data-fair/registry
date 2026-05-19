# Branch artefacts: rolling tarballs for non-release builds

- **Date:** 2026-05-19
- **Branch:** feat-processings-integration
- **Status:** approved, in implementation

## Goal

Publish builds from `main` (or any non-release branch) to a registry without
multiplying tarballs via semver prerelease suffixes. Model the result the way
docker tags model branch images: one mutable "tag" per branch, replaced
in place on every push.

Operationally: the staging registry holds production releases (mirrored via
federation, read-only locally) *and* its own branch builds (managed locally).
The production registry holds releases only. Branch builds never federate
outward.

## Scope

**In:**

- A third artefact format, `branch`, alongside the existing `npm` and `file`.
- Upload route `POST /api/v1/artefacts/branch/<name>` mirroring the auth and
  scoping of the existing `/versions` and `/file/:name` routes.
- Manifest extraction on upload (same `extractManifest` used for npm).
- Atomic swap of the single stored tarball (same overwrite pattern the `file`
  format already uses).
- Federation filter: branch artefacts are excluded from the outgoing
  federation feed.
- Consumer-side support in `@data-fair/lib-node-registry`'s `ensureArtefact`.
- A second GitHub Actions workflow (`publish-main.yml`) wired to the staging
  registry, alongside the existing tag-publish workflow.

**Out (deferred):**

- Per-branch architecture matrix (single arch like today's tag flow).
- Receiver-side federation filtering (only sender-side for now).
- Auto-prune of stale branch artefacts (e.g. when upstream git branch is
  deleted). Manual delete via UI.
- "Promote a branch build to a release" workflow.
- Surfacing a structural `parentArtefact` link in the registry data model.
  Convention only (`<package-name>-<branch>`), no enforcement.

## Data model

```
Artefact (format=branch)
  _id              # operator-chosen, e.g. "@data-fair/processing-gpkg-main"
  format           # "branch"
  packageName      # from manifest, e.g. "@data-fair/processing-gpkg"
  version          # from manifest, display-only
  branchName?      # optional metadata from upload form field
  licence
  category         # from manifest or form field, same allowed values as npm
  tarballPath      # single path, random-suffixed, replaced on each upload
  size
  architecture?    # optional, single value (no variants)
  public, privateAccess, title, description
  uploadedAt, uploadedBy, createdAt, updatedAt, dataUpdatedAt
```

No `versions` sub-documents. No `latestMajor`. No retention bookkeeping.

`_id` is operator-chosen and intentionally distinct from the source package
name — that's the whole point of approach A. Convention: `<package-name>-<branch>`.

## Upload endpoint

```
POST /api/v1/artefacts/branch/:name
```

- Multipart body, same `MAX_UPLOAD_BYTES` limit, same `busboy` shape as
  `/versions`.
- Form fields:
  - `file` — the tarball (required).
  - `branchName` — optional, stored as metadata.
  - `architecture` — optional, single value.
  - `category` — optional, overrides `package.json#registry.category`. Same
    allowed values as the npm flow (`processing`, `catalog`, `application`,
    `other`).
  - `title`, `description` — optional, JSON-encoded localized strings (same
    schema and validation as the file flow).
- Auth: upload API key (`type=upload`) or internal secret. `allowedName`
  scopes to this `_id`. `allowedCategory` scopes by category.
- Flow:
  1. Staging-path upload (`_staging/<uuid>.tgz`), same as `/versions`.
  2. `extractManifest` on the staged object.
  3. **Format check.** If an artefact with this `_id` exists in a non-branch
     format, return `409`. Prevents clobbering a release artefact.
  4. **Origin check.** If the artefact exists with an `origin` (mirrored),
     return `409` — same rule as today.
  5. Move staging → final path `branch/<id>/<uuid>-<basename>.tgz`. Random
     suffix in the path so a failed delete of the previous tarball can't
     clobber the new one.
  6. Upsert artefact doc with `format: 'branch'`, the manifest-derived
     metadata, and the new `tarballPath`.
  7. Delete the previous `tarballPath` (best-effort).
  8. Return `201 { artefact }`.
- Errors clean up the staged object and the new final object (same pattern as
  the existing routes).

## Read endpoints

- `GET /api/v1/artefacts/:id` — returns the artefact doc. For
  `format=branch`, no `versions` are attached.
- `GET /api/v1/artefacts/:id/branch/tarball` — symmetric to the existing
  `/download` (file artefacts) and `/versions/:v/tarball` (npm). Same
  access-grant rules. Returns a 302 to a signed URL if the storage backend
  supports it; otherwise streams.
- `GET /api/v1/artefacts/:id/versions/:selector` — for `format=branch`,
  returns `404`. Branch artefacts don't expose a version resolver.

`assertDownloadAccess` and `artefactAccessFilter` apply unchanged.

## Delete endpoint

`DELETE /api/v1/artefacts/:id` — already exists, superadmin-only. Add a
branch of the conditional: if `format === 'branch'`, delete the artefact doc
and best-effort `deleteFile(tarballPath)`. No `versions` to clean.

## Federation

The federation system mirrors artefacts from a source registry to a target
registry, marking copies with `origin`. The mirroring read side reads from a
source endpoint (the source registry's list/detail routes).

- **Sender-side filter.** When the source registry serves its federation
  feed, exclude `format=branch` from the list. A target registry physically
  can't see branch artefacts on the source.
- Rationale: branch builds are local-only by intent; never imply a "remote
  branch artefact" model on the wire.
- Receiving registries are unchanged.

(If you later want a per-target opt-in, that's a follow-up — for MVP, branch
artefacts simply don't federate.)

## Consumer (`@data-fair/lib-node-registry`)

`ensureArtefact(name, selector?)` currently always resolves through
`/api/v1/artefacts/<name>/versions/<selector>` and caches by `(name,
resolved-version)`. For branch artefacts:

1. First call `GET /api/v1/artefacts/<name>` to discover the format.
2. If `format === 'branch'`:
   - Cache key includes `artefact.dataUpdatedAt` (or `updatedAt`) so a new
     upload invalidates the cache.
   - Download from `/api/v1/artefacts/<name>/branch/tarball`.
   - Always re-fetch the artefact doc on each `ensureArtefact` call (cheap)
     to detect updates. Re-extract only when the cache key changes.
3. If `format === 'npm'`: keep today's `/versions/<selector>` path.
4. If `format === 'file'`: behavior unchanged (lib-node may or may not
   support it today; out of scope).

The `architecture` query param applies the same way for branch artefacts:
caller passes their `process.arch`, registry returns the artefact only if its
stored `architecture` matches or is absent.

## Processings impact

- Plugin picker UI: branch artefacts appear in the same list, with a "dev
  build" visual marker (e.g. a chip). Operator picks one like any other
  artefact.
- Processing doc stores `{ artefactId, version? }`. For branch artefacts
  `version` is omitted. Worker resolution skips version lookup when the
  picked artefact is `format=branch`.
- Worker cache: see lib-node changes above. Branch tarballs may change
  between scheduled runs; re-extraction on `dataUpdatedAt` change is enough.

No changes required to the worker's plugin loader (it still
`import(pluginDir + '/index.js')` after extraction).

## CI workflow

Extend the worked example in `processing-gpkg` with a second workflow:

```yaml
# .github/workflows/publish-main.yml
name: Publish main to Staging Registry
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: staging
    env:
      REGISTRY_URL: https://staging-koumoul.com/registry
      ALPINE_NODE_IMAGE: node:24.11.1-alpine3.22
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - name: Build artefact with bundled node_modules
        # ... same npm pack / extract / npm ci / repack pipeline as publish.yml
      - name: Upload branch build to staging
        env:
          REGISTRY_API_KEY: ${{ secrets.REGISTRY_API_KEY }}
        run: |
          set -euo pipefail
          PACKAGE_NAME=$(node -p "require('./package.json').name")
          BRANCH_ARTEFACT_NAME="${PACKAGE_NAME}-main"
          ENCODED_NAME=$(node -p "encodeURIComponent('${BRANCH_ARTEFACT_NAME}')")
          curl -f -X POST \
            "${REGISTRY_URL}/api/v1/artefacts/branch/${ENCODED_NAME}" \
            -H "x-api-key: ${REGISTRY_API_KEY}" \
            -F "branchName=main" \
            -F "architecture=x64" \
            -F "file=@with-deps.tgz"
```

- New GitHub environment `staging`, separate secret `REGISTRY_API_KEY`
  scoped to the staging registry (one staging upload key with
  `allowedName=@data-fair/processing-gpkg-main`).
- No tag/version sanity check (there's no tag).
- Production env and `publish.yml` untouched.

The shared "build with bundled deps" body is identical between the two
workflows. We don't extract it into a reusable workflow yet — keep the
recipe copy-pasteable until we have more than two consumers.

## Doc updates

`docs/ci-integration.md` gains a new top-level section "Publishing a branch
build to staging" placed after the tag-flow section. It walks through:

1. Create a staging upload API key with `allowedName=<package>-main`.
2. Create the GitHub `staging` environment and store the key.
3. Drop the `publish-main.yml` workflow.

The existing tag-flow doc is unchanged.

## API key model

No changes. The same `type=upload` key with the same `allowedName` and
`allowedCategory` shape covers branch uploads — `allowedName` is matched
against the URL `<name>`, which for branch uploads is the operator-chosen
branch artefact id (e.g. `@data-fair/processing-gpkg-main`).

Practical guidance (doc-only): one upload key per (plugin, environment). A
plugin needs two keys total — one production key for tag pushes, one staging
key for main pushes.

## Open calls (locked in for this iteration)

- New format `branch` (not a flag on `npm`).
- Federation excludes branch artefacts sender-side; receivers unchanged.
- Single tarball per branch artefact, no architecture matrix yet.
- No structural `parentArtefact` link — convention-based naming only.
- Format conflict on `_id` collision returns `409`.
- `version` field on the artefact doc comes from the manifest and is
  display-only; it has no semver semantics for branch artefacts (no parsing,
  no sorting, no resolution).

## Risk notes

- **Mutable tarball + caching.** Consumers must invalidate on
  `dataUpdatedAt` change. If a consumer caches by name only, it will serve a
  stale plugin. The lib-node change above is what makes this work; consumer
  services that don't go through `lib-node-registry` need to honor the same
  rule.
- **Format conflict timing.** Between the format check and the upsert, a
  race could allow a concurrent npm upload to land first. Acceptable for
  MVP — both endpoints are admin-style and never run concurrently on the
  same `_id` in practice. If it becomes a problem, add a filter on the
  upsert that requires `format: 'branch'` or absence.
- **Federation leak.** If the sender-side filter is bypassed (e.g. a future
  refactor exposes the raw artefacts collection over the federation feed),
  branch tarballs could mirror outward. Add a test that exercises the
  federation feed and asserts no `format=branch` entries appear.
- **Operator confusion about naming.** Nothing stops an operator from
  naming a branch artefact something unrelated to the package name (e.g.
  `gpkg-dev`). UI grouping by `packageName` (from manifest) is the
  mitigation; documenting the convention is the other.
