# Unified npm format: one mutable artefact per ref

- **Date:** 2026-05-19
- **Branch:** feat-processings-integration
- **Status:** approved
- **Supersedes parts of:** [`2026-05-19-branch-artefacts-design.md`](2026-05-19-branch-artefacts-design.md)
  (the `branch` format introduced there is absorbed into the new `npm`
  format; the historical spec stays in place for context)

## Goal

Today's `npm` format stores many tarballs per artefact (a `versions`
sub-collection, semver parsing, version resolver, retention policy) even
though every real consumer pulls by a sliding flag — `/versions/1`
resolves to "latest in major 1". The `branch` format added recently
already encodes "one mutable tarball per ref" cleanly. This change
collapses both into a single `npm`-shape: one artefact per ref
(release major *or* dev branch), one tarball per arch slot, no resolver,
no retention.

After the change, "version" stops being a resolvable selector at the
registry boundary. The ref id *is* the flag.

## Scope

**In:**

- One unified `npm` format. The `branch` format is removed.
- Each release major and each dev branch is its own artefact, identified
  by an operator-chosen `_id`. Recommended convention `<packageName>@<ref>`,
  not enforced by the registry.
- Multi-arch storage as a `tarballs: { [arch]: ... }` map on the artefact
  doc. `noarch` is a valid key for portable builds.
- New routes `POST /artefacts/npm/:id` (upload) and
  `GET /artefacts/:id/tarball` (download). Old `/versions/*` and `/branch/*`
  routes are deleted outright.
- New `allowedPackageName` field on upload API keys, matched against
  manifest `package.json#name`.
- `@data-fair/lib-node-registry@0.4.0` with a single `ensureArtefact`
  function and no version selector.

**Out:**

- Data migration. The registry is staging-only; the deployment plan is
  wipe + redeploy + re-publish (see "Deployment" below).
- Legacy `410 Gone` deprecation window. Old routes are removed in the
  same change that introduces the new ones.
- Federation distinction by format/ref. Every artefact federates the
  same way (today's `npm` rule extends to everything).
- Exact-version pinning. Consumers can only address the ref; rollback =
  re-publish from CI.

## Data model

```
Artefact (format=npm)
  _id              # operator-chosen, convention <packageName>@<ref>
                   #   e.g. "@data-fair/processing-gpkg@1"
                   #        "@data-fair/processing-gpkg@main"
  format           # "npm"
  packageName      # from manifest, used by UI to read "which package"
  version          # from manifest, display-only
  licence          # from manifest, optional
  category         # from manifest or upload form override
  tarballs         # { [arch]: { path, size, uploadedAt, uploadedBy } }
                   #   "noarch" is a valid key
  size             # convenience: size of the most-recently-uploaded arch
  public, privateAccess, title, description, origin
  createdAt, updatedAt, dataUpdatedAt
```

`file` artefact doc: unchanged.

Removed compared to today:

- The `versions` sub-collection (entire collection dropped from the schema).
- `latestMajor`, `semverMajor`, `semverMinor`, `semverPatch`, `semverPrerelease`.
- `branchName` (the ref is the id; no parallel field).
- The notion of `format: 'branch'` (now a synonym for `npm`).

Per-arch audit info (`uploadedAt`, `uploadedBy`) lives inside each
`tarballs[arch]` entry so "who pushed the x64 variant, when" survives.
The doc-level `updatedAt`/`dataUpdatedAt` reflect the last arch touched.

## Endpoints

**Removed entirely (no deprecation window):**

- `POST /api/v1/artefacts/:name/versions`
- `GET /api/v1/artefacts/:id/versions/:selector`
- `GET /api/v1/artefacts/:id/versions/:version/tarball`
- `POST /api/v1/artefacts/branch/:name`
- `GET /api/v1/artefacts/:id/branch/tarball`

**Added:**

- `POST /api/v1/artefacts/npm/:id` — multipart upload. Form fields:
  - `file` — the tarball (required).
  - `architecture` — optional, the arch slot key (defaults to `noarch`).
  - `category` — optional, overrides manifest `package.json#registry.category`.
  - `title`, `description` — optional, JSON-encoded localized strings
    (same schema and validation as the file flow).
  Auth: upload API key (`type=upload`) or internal secret. `allowedName`
  matches the URL id; `allowedPackageName` matches the manifest name (see
  API keys below); `allowedCategory` unchanged.

  Flow:
  1. Staging-path upload (`_staging/<uuid>.tgz`).
  2. `extractManifest` on the staged object.
  3. Manifest `package.json#name` must equal `packageName` on the existing
     artefact doc, if any. Mismatch → `409` (prevents accidentally
     pointing one artefact at two different packages).
  4. **Origin check.** If the artefact exists with an `origin` (mirrored),
     return `409` — same rule as today.
  5. Move staging → final path `npm/<id>/<arch>-<uuid>.tgz`. Random suffix
     so a failed delete of the previous tarball in this slot can't clobber
     the new one. Other arch slots are untouched.
  6. Upsert the doc: set `tarballs[<arch>] = { path, size, uploadedAt, uploadedBy }`,
     refresh doc-level `version/licence/category/size/updatedAt/dataUpdatedAt`.
  7. Best-effort `deleteFile` on the previous occupant of that arch slot.
  8. Return `201 { artefact }`.

  Errors clean up the staging object and the new final object (same
  pattern as today's routes).

- `GET /api/v1/artefacts/:id/tarball` — download. Optional `?architecture=x64`
  query. Resolution: `tarballs[<arch>]` → fall back to `tarballs.noarch` →
  `404`. Same access-grant rules as today's npm tarball endpoint. Returns
  302 to a signed URL if the backend supports it, otherwise streams.

**Unchanged:**

- `GET /api/v1/artefacts` — flat list, access-filtered, paginated.
- `GET /api/v1/artefacts/:id` — detail. Returns the doc, no `versions` array.
- `PATCH /api/v1/artefacts/:id` — editable metadata, unchanged.
- `DELETE /api/v1/artefacts/:id` — superadmin delete. Walks every entry in
  `tarballs[*].path` plus thumbnails. No `versions` to clean.
- `POST /api/v1/artefacts/file/:name`, `GET /api/v1/artefacts/:id/download` —
  file format, untouched.

## Consumer (`@data-fair/lib-node-registry`)

Released as `0.4.0`. Breaking change; nothing outside the data-fair stack
consumes the library.

```ts
const { path, version, downloaded } = await ensureArtefact({
  registryUrl,
  secretKey,
  artefactId: '@data-fair/processing-gpkg@1',
  architecture: process.arch,  // default
  cacheDir
})
```

- The `version` parameter is **removed**. Passing it throws — the
  ref id has no other selector to express.
- Flow on every call:
  1. `GET /api/v1/artefacts/:id` — read the artefact doc.
  2. Cache key = `(artefactId, architecture, dataUpdatedAt)`. If the
     cache holds an extraction at that key, return its path.
  3. Otherwise `GET /api/v1/artefacts/:id/tarball?architecture=<arch>`
     (302-aware), extract to cache, return.
- Return value: `version` is the manifest-extracted display version on
  the doc (useful for logs/telemetry, not for resolution).
  `downloaded: boolean` keeps its meaning.

`ensureBranchArtefact` (introduced in 0.3.0) is removed in the same
release.

## API key model

Add one optional field to upload keys: `allowedPackageName`.

- Matched against the manifest's `package.json#name` on every upload.
- If set, the upload is rejected unless the tarball's manifest name
  equals `allowedPackageName`.
- If `allowedName` is also set, **both** must match (AND).
- Only meaningful for npm uploads. Ignored on the file upload path
  (no manifest).

`allowedName` and `allowedCategory`: unchanged.

Operator mapping:

| Goal | Key config |
|---|---|
| Push to one specific ref | `allowedName=@plugin@1` |
| Push to any ref of one plugin (across majors and branches) | `allowedPackageName=@plugin` |
| Push to any tileset | `allowedCategory=tileset` |

The recommended CI default becomes `allowedPackageName=<package>` so a
single key per (plugin, registry environment) covers `@1`, `@2`, `@main`,
etc.

## Federation

No per-format or per-ref distinction. Every artefact federates the same
way today's `npm` and `file` formats do. The sender-side branch-format
filter from the previous spec is dropped along with the `branch` format
itself.

## UI

- **Admin artefact list:** stays flat — one row per artefact. `@plugin@1`,
  `@plugin@2`, `@plugin@main` appear as three rows with the same
  `packageName` cell. Minor visual repetition is accepted; no client-side
  grouping layer.
- **Artefact detail page:** unchanged from today, minus the `versions`
  table (which is gone).
- **Processings plugin picker (separate codebase, flagged):** flat list
  of ref ids. Operator picks the exact ref. The processing doc stores
  `artefactId = "<package>@<ref>"`; the previous `version` field is dropped.

## CI workflow updates

The build pipeline (npm pack → extract → npm ci in the Alpine image →
repack) is unchanged. Only the upload URL and form fields change.

**Tag flow (`publish.yml`):**

```bash
PACKAGE_NAME=$(node -p "require('./package.json').name")
PACKAGE_MAJOR=$(node -p "require('./package.json').version.split('.')[0]")
ENCODED_ID=$(node -p "encodeURIComponent('${PACKAGE_NAME}@${PACKAGE_MAJOR}')")
curl -f -X POST "${REGISTRY_URL}/api/v1/artefacts/npm/${ENCODED_ID}" \
  -H "x-api-key: ${REGISTRY_API_KEY}" \
  -F "architecture=x64" \
  -F "file=@with-deps.tgz"
```

The existing tag-vs-`package.json` version check stays as-is. Recommended
API key scope: `allowedPackageName=<package-name>` so the same key covers
`@1`, `@2`, etc.

**Branch flow (`publish-main.yml`):**

```bash
ENCODED_ID=$(node -p "encodeURIComponent('${PACKAGE_NAME}@main')")
curl -f -X POST "${REGISTRY_URL}/api/v1/artefacts/npm/${ENCODED_ID}" \
  -H "x-api-key: ${REGISTRY_API_KEY}" \
  -F "architecture=x64" \
  -F "file=@with-deps.tgz"
```

No `branchName` form field — the ref `@main` *is* the branch name.
Convention naming shifts from `<package>-<branch>` (today's branch flow)
to `<package>@<branch>`.

Staging-only key per environment is still the recommended split for
security; one key with `allowedPackageName` would also be technically
sufficient.

## Doc updates

- **`docs/architecture.md`** — rewrite "Artefact formats" to describe
  two formats (`npm`, `file`) with `npm` as mutable-tarball-per-id +
  optional arch variants. Delete the "Version resolution" section
  entirely. Rewrite "Plugin consumption by services" around
  `ensureArtefact({ artefactId: "...@1" })`.
- **`docs/ci-integration.md`** — both workflow recipes updated as above.
  The "Publishing a branch build to staging" section title stays; its
  body collapses to "use a different ref id and a staging-scoped key".
  Convention naming changed throughout from `<package>-<branch>` to
  `<package>@<branch>`.
- **`docs/superpowers/specs/2026-05-19-branch-artefacts-design.md`** —
  add a footer note pointing at this new spec. The branch-artefacts spec
  is left in place as historical context for the briefly-shipped
  intermediate format.

## Deployment

The registry runs only on the staging environment today; its data is
disposable. The roll-out is:

1. Drop the `artefacts`, `versions`, `thumbnails`, `access-grants`
   collections and the tarball storage volume.
2. Roll out the new registry code.
3. Re-publish all artefacts from CI under the new ref-id convention.
4. Roll out `lib-node-registry@0.4.0` to consumer services.
5. Recreate any processings that pointed at the old ids.

No migration script, no idempotent ordering logic, no deprecation window.

## Open calls (locked for this iteration)

- One unified `npm` format. `branch` format removed.
- Operator-chosen `_id`, convention `<packageName>@<ref>`, registry
  never parses it.
- `tarballs: { [arch]: ... }` map; `noarch` is a valid arch key. Per-arch
  atomic swap; other arch slots untouched on a per-arch upload.
- Doc-level `size` mirrors the most-recently-uploaded arch's size. Per-arch
  size lives in `tarballs[arch].size`.
- Manifest `package.json#name` cross-checked against the doc's
  `packageName` on each upload; mismatch → 409.
- Every artefact federates uniformly. No per-ref opt-out.
- Flat UI list; minor visual repetition accepted; no `?packageName=` API
  filter.
- No data migration; staging is wiped on roll-out.

## Risk notes

- **Mutable tarball + caching.** Consumers must invalidate on
  `dataUpdatedAt` change. Already the rule for the existing branch
  format; the unified consumer keeps it as the only cache key.
- **ID typo.** A CI workflow with a wrong `${ENCODED_ID}` creates a new
  artefact instead of overwriting the intended one. Mitigation:
  `allowedName` or `allowedPackageName` on the upload key catches mass
  typos; a "no artefact at this id yet" UI hint on the admin list
  surfaces stray creations.
- **Concurrent per-arch uploads.** Two CI jobs pushing different arches
  to the same id race on the doc upsert. Each writes only its own
  `tarballs[<arch>]` slot via `$set` on a sub-path, so they don't
  collide; if both also refresh doc-level `size`/`version`, last writer
  wins on those scalars but per-arch data is intact.
- **Concurrent same-arch upload.** Two pushes to the same arch slot:
  last writer wins, the earlier tarball is orphaned. Same property as
  today's branch flow.
- **Rollback story.** Re-tag + re-publish from CI is the only path.
  Document it in `ci-integration.md` so on-call doesn't reach for a
  registry-side rollback that doesn't exist.
