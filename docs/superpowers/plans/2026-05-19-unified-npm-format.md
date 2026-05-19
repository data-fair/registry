# Unified npm format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse today's `npm` (multi-version, retention, resolver) and `branch` (single mutable tarball) artefact formats into one unified `npm` format where each ref (release major or dev branch) is its own artefact with one tarball per architecture.

**Architecture:** The artefact doc gains a `tarballs: { [arch]: { path, size, uploadedAt, uploadedBy } }` map; the `versions` Mongo collection, semver parser, version resolver, retention policy, and `branch` format are all removed. A single `POST /artefacts/npm/:id` upload route replaces both the old `/versions` and `/branch/:name` routes; a single `GET /artefacts/:id/tarball?architecture=` download route replaces both old downloads. The lib-node consumer drops its `version` parameter and re-fetches the artefact doc on each call, caching by `dataUpdatedAt`.

**Tech Stack:** Node.js, TypeScript, MongoDB, Express, Busboy, tar-stream, Playwright (test runner), Vue 3 (UI).

**Spec:** [`docs/superpowers/specs/2026-05-19-unified-npm-format-design.md`](../specs/2026-05-19-unified-npm-format-design.md)

**Deployment context:** the registry runs only on the staging environment today; existing data is wiped at roll-out time. No migration logic, no `410 Gone` deprecation window, no backward-compatibility shims.

---

## Conventions used in this plan

- Run a single test file: `npm run test tests/<file>.spec.ts`
- Run a single test by name: `npm run test tests/<file>.spec.ts -- -g "<test name>"`
- Run all quality checks: `npm run quality` (lint + types + tests)
- Type generation after schema edits: `npm run build-types`
- Commit messages: imperative, lowercase verb, no trailing period. Match the recent log style (`feat:`, `chore:`, `fix:`, `docs:`).

After every code change, run lint/typecheck before committing:

```bash
npm run lint-fix && npm run check-types
```

If you change a JSON Schema in `api/types/*/schema.js` or `api/doc/*/post-req/schema.js`, regenerate types **before** the typecheck:

```bash
npm run build-types && npm run check-types
```

---

## File structure

**Files modified (high-impact):**

- `api/types/artefact/schema.js` — drop `branch` from `format` enum, remove `branchName` / `latestMajor` / `architecture` / `filePath` from the `npm` shape, add `tarballs` map.
- `api/types/version/schema.js` — delete entirely (along with the folder).
- `api/src/mongo.ts` — remove `versions` collection accessor and its `artefact-version-arch` index.
- `api/src/artefacts/service-pure.ts` — keep `extractManifest`; drop `parseSemver`, `resolveVersionQuery`, `computePruneSet`, related types and consts.
- `api/src/artefacts/service.ts` — drop `pruneOldVersions`; trim re-exports.
- `api/src/artefacts/router.ts` — full rewrite of upload + download routes; delete `/versions/*` and `/branch/*`; simplify `GET /:id` and `DELETE /:id`.
- `api/src/access.ts` — drop the `viaReadKey` → `format: { $ne: 'branch' }` filter (federation no longer distinguishes by format).
- `api/src/remote-registries/sync.ts` — rewrite `syncNpmArtefact` to walk the new `tarballs` map instead of the `versions` collection.
- `api/src/api-keys/router.ts` — accept `allowedPackageName` on POST.
- `api/types/api-key/schema.js` — add `allowedPackageName`.
- `api/doc/api-keys/post-req/schema.js` — add `allowedPackageName`.
- `ui/src/pages/admin/artefacts/[id].vue` — drop the versions table; show `tarballs` rows from the artefact doc.
- `ui/src/pages/artefacts/[id].vue` — same, plus drop the "latest version" download header.
- `lib-node/index.ts` — drop `version` parameter on `ensureArtefact`, drop `ensureBranchArtefact`, fold both behaviours into a single doc-then-tarball flow keyed by `dataUpdatedAt`.
- `lib-node/package.json` — bump to `0.4.0`.

**Files deleted:**

- `api/types/version/` (entire folder).
- `tests/branches.api.spec.ts` (folded into `tests/artefacts.api.spec.ts`).

**Files heavily edited (test rewrites):**

- `tests/artefacts.api.spec.ts` — strip version-resolver / retention / multi-arch-by-version tests; add upload-via-npm-route, multi-arch slot, and download tests.
- `tests/artefacts-service.unit.spec.ts` — strip `parseSemver` / `resolveVersionQuery` / `computePruneSet` tests; keep `extractManifest`.
- `tests/lib-node.api.spec.ts` — rewrite around the no-version API.
- `tests/api-keys.api.spec.ts` — add `allowedPackageName` tests.
- `tests/remote-registries.api.spec.ts` — adjust npm sync expectations.

**Files updated (docs):**

- `docs/architecture.md`
- `docs/ci-integration.md`
- `docs/superpowers/specs/2026-05-19-branch-artefacts-design.md` (footer pointer only)

---

## Task ordering rationale

Schema and Mongo first (Tasks 1–3) so type errors point at the call sites that need updating. Service helpers next (Task 4) so unrelated code compiles. Access filter (Task 5) is one-liner. Router rewrite (Tasks 6–9) is the bulk of the change — done in TDD order: new upload first, new download next, then delete old routes. API keys (Task 10) and remote-registries sync (Task 11) round out the API. UI (Task 12) and lib-node (Task 13) follow. Final docs pass (Task 14).

---

### Task 1: Update artefact schema

**Files:**
- Modify: `api/types/artefact/schema.js`

- [ ] **Step 1: Rewrite the schema**

Replace the content of `api/types/artefact/schema.js`:

```javascript
/* eslint-disable no-template-curly-in-string */
export default {
  $id: 'https://github.com/data-fair/registry/artefact',
  'x-exports': ['types'],
  'x-vjsf': { xI18n: true },
  'x-vjsf-locales': ['en', 'fr'],
  title: 'Artefact',
  type: 'object',
  additionalProperties: false,
  layout: { title: null },
  required: ['_id', 'name', 'format', 'category', 'createdAt', 'updatedAt'],
  properties: {
    _id: { type: 'string', readOnly: true },
    name: { type: 'string', readOnly: true },
    format: { type: 'string', enum: ['npm', 'file'], readOnly: true },
    packageName: { type: 'string', readOnly: true },
    version: { type: 'string', readOnly: true },
    licence: { type: 'string', readOnly: true },
    category: {
      type: 'string',
      enum: ['processing', 'catalog', 'application', 'tileset', 'maplibre-style', 'other']
    },
    // Per-architecture tarball slots for npm artefacts. `noarch` is the valid
    // key for portable builds; arch keys mirror `process.arch` values.
    tarballs: {
      type: 'object',
      readOnly: true,
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'size', 'uploadedAt'],
        properties: {
          path: { type: 'string' },
          size: { type: 'integer' },
          uploadedAt: { type: 'string', format: 'date-time' },
          uploadedBy: {
            type: 'object',
            additionalProperties: false,
            properties: {
              apiKeyId: { type: 'string' },
              apiKeyName: { type: 'string' },
              shortId: { type: 'string' },
              internal: { type: 'boolean' }
            }
          }
        }
      }
    },
    title: {
      type: 'object',
      additionalProperties: false,
      properties: {
        en: { type: 'string', title: 'Title - English', 'x-i18n-title': { fr: 'Titre - Anglais' }, layout: { cols: { md: 6 } } },
        fr: { type: 'string', title: 'Title - French', 'x-i18n-title': { fr: 'Titre - Français' }, layout: { cols: { md: 6 } } }
      }
    },
    description: {
      type: 'object',
      additionalProperties: false,
      properties: {
        en: { type: 'string', title: 'Description - English', 'x-i18n-title': { fr: 'Description - Anglais' }, layout: { comp: 'textarea', props: { autoGrow: true, rows: 3 }, cols: { md: 6 } } },
        fr: { type: 'string', title: 'Description - French', 'x-i18n-title': { fr: 'Description - Français' }, layout: { comp: 'textarea', props: { autoGrow: true, rows: 3 }, cols: { md: 6 } } }
      }
    },
    group: {
      type: 'object',
      additionalProperties: false,
      properties: {
        en: { type: 'string', title: 'Group - English', 'x-i18n-title': { fr: 'Groupe - Anglais' }, layout: { cols: { md: 6 } } },
        fr: { type: 'string', title: 'Group - French', 'x-i18n-title': { fr: 'Groupe - Français' }, layout: { cols: { md: 6 } } }
      }
    },
    thumbnail: {
      type: 'object',
      readOnly: true,
      additionalProperties: false,
      required: ['id', 'width', 'height'],
      properties: {
        id: { type: 'string' },
        width: { type: 'integer' },
        height: { type: 'integer' }
      }
    },
    public: {
      type: 'boolean',
      title: 'Public',
      'x-i18n-title': { fr: 'Public' },
      layout: 'switch',
      default: false
    },
    privateAccess: {
      type: 'array',
      title: 'Private access',
      'x-i18n-title': { fr: 'Accès privés' },
      layout: { if: '!parent.data?.public' },
      items: {
        type: 'object',
        title: 'Account',
        'x-i18n-title': { fr: 'Compte' },
        additionalProperties: false,
        required: ['type', 'id', 'name'],
        properties: {
          type: { type: 'string', enum: ['user', 'organization'] },
          id: { type: 'string' },
          name: { type: 'string' }
        },
        layout: {
          getItems: {
            url: '/simple-directory/api/accounts?size=20',
            qSearchParam: 'q',
            itemsResults: 'data.results',
            itemTitle: '`${item.name} (${item.id})`',
            itemKey: '`${item.type}:${item.id}`',
            itemIcon: '`/simple-directory/api/avatars/${item.type}/${item.id}/avatar.png`'
          }
        }
      }
    },
    documentation: {
      type: 'string',
      format: 'uri',
      title: 'Documentation URL',
      'x-i18n-title': { fr: 'URL de documentation' }
    },
    origin: { type: 'string', readOnly: true },
    // `filePath`, `fileName` are only used by format=file.
    filePath: { type: 'string', readOnly: true },
    fileName: { type: 'string', readOnly: true },
    size: { type: 'integer', readOnly: true },
    // Top-level `uploadedBy` is only meaningful for file format (single
    // upload per artefact). npm format carries per-arch `uploadedBy` inside
    // `tarballs[arch]`.
    uploadedBy: {
      type: 'object',
      readOnly: true,
      additionalProperties: false,
      properties: {
        apiKeyId: { type: 'string' },
        apiKeyName: { type: 'string' },
        shortId: { type: 'string' },
        internal: { type: 'boolean' }
      }
    },
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
    updatedAt: { type: 'string', format: 'date-time', readOnly: true },
    dataUpdatedAt: { type: 'string', format: 'date-time', readOnly: true }
  }
}
```

Changes vs. the old schema:
- `format` enum is `['npm', 'file']` (no `branch`).
- Removed top-level: `branchName`, `architecture`, `latestMajor`.
- Added `tarballs` (open-key map of arch → tarball metadata).
- `filePath` / `fileName` kept for `file` format.

- [ ] **Step 2: Regenerate types**

Run: `npm run build-types`
Expected: succeeds; `api/types/artefact/.type/index.d.ts` updates.

- [ ] **Step 3: Typecheck (expect failures elsewhere — that's fine)**

Run: `npm run check-types`
Expected: errors referencing `Artefact['branchName']`, `Artefact['latestMajor']`, `Artefact['architecture']`, `format === 'branch'`, etc. These will be fixed by later tasks.

- [ ] **Step 4: Commit**

```bash
git add api/types/artefact/schema.js api/types/artefact/.type/
git commit -m "$(cat <<'EOF'
refactor: artefact schema with tarballs map, drop branch format

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Delete the version type

**Files:**
- Delete: `api/types/version/` (entire folder including generated subfolder)

- [ ] **Step 1: Remove the folder**

```bash
rm -rf api/types/version
```

- [ ] **Step 2: Typecheck (still has unrelated errors, but version errors should be additive)**

Run: `npm run check-types`
Expected: same errors as Task 1 plus errors at every `import ... from '#types/version/index.ts'`.

- [ ] **Step 3: Commit**

```bash
git add -A api/types/version
git commit -m "refactor: drop version type, no longer used

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Drop the versions Mongo collection and its remaining consumers

**Files:**
- Modify: `api/src/mongo.ts`
- Modify: `api/src/app.ts`
- Delete: `api/src/upgrades/backfill-size.ts`
- Delete: `api/src/upgrades/backfill-data-updated-at.ts`

The version collection has consumers beyond mongo.ts: two upgrade scripts (`backfill-size`, `backfill-data-updated-at`) and three dev-only test-env routes in `app.ts`. Both upgrade scripts existed to migrate from earlier shapes of the old version-row model — under the unified `npm` format they have nothing to operate on, and the deployment plan wipes the staging data anyway. Delete them outright.

- [ ] **Step 1: Edit `api/src/mongo.ts`**

Remove the `Version` type import:

```typescript
// Delete this line:
import type { Version } from '#types/version/index.ts'
```

Remove the `versions` getter on the `RegistryMongo` class:

```typescript
// Delete this getter:
get versions () {
  return mongoLib.db.collection<Version>('versions')
}
```

Remove the `versions` entry from the `mongoLib.configure({...})` call inside `init()`:

```typescript
// Delete this block:
versions: {
  'artefact-version-arch': [{ artefactId: 1, version: 1, architecture: 1 }, { unique: true }]
},
```

- [ ] **Step 2: Edit `api/src/app.ts`**

Remove the two upgrade imports near the top:

```typescript
// Delete these:
import { backfillSize } from './upgrades/backfill-size.ts'
import { backfillDataUpdatedAt } from './upgrades/backfill-data-updated-at.ts'
```

In the `/api/test-env` clean route, drop the `mongo.versions.deleteMany({})` line:

```typescript
// Before:
await mongo.artefacts.deleteMany({})
await mongo.versions.deleteMany({})
await mongo.apiKeys.deleteMany({})
// After:
await mongo.artefacts.deleteMany({})
await mongo.apiKeys.deleteMany({})
```

Delete all four `/api/test-env/backfill-*` routes (the two `backfill-size` ones and the two `backfill-data-updated-at` ones) — they're the `TODO: remove with backfill-* upgrade` comments. The dev environment doesn't need them anymore.

Confirm `backfillSize` / `backfillDataUpdatedAt` are no longer called anywhere else in `app.ts`; if a startup-time call exists, remove that too.

- [ ] **Step 3: Delete the upgrade scripts and their tests**

```bash
git rm api/src/upgrades/backfill-size.ts api/src/upgrades/backfill-data-updated-at.ts
```

Also delete the backfill test groups in `tests/artefacts-file.api.spec.ts`: the `test.describe('Size backfill', () => { ... })` block and the `'backfill restores dataUpdatedAt on artefacts missing it'` test (around lines 205 and 296 in the current file). Their `TODO: remove with backfill-* upgrade` comments are the locator.

Run: `ls api/src/upgrades/`
If the folder is now empty, run: `rmdir api/src/upgrades`

- [ ] **Step 4: Typecheck**

Run: `npm run check-types`
Expected: only errors that point at later-task fixups (router.ts, service.ts, sync.ts) — no fresh `mongo.versions` or `backfill*` references.

- [ ] **Step 5: Commit**

```bash
git add api/src/mongo.ts api/src/app.ts api/src/upgrades tests/artefacts-file.api.spec.ts
git commit -m "refactor: remove versions collection and obsolete upgrade scripts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Trim service helpers (drop semver/resolver/retention)

**Files:**
- Modify: `api/src/artefacts/service-pure.ts`
- Modify: `api/src/artefacts/service.ts`
- Modify: `tests/artefacts-service.unit.spec.ts`

- [ ] **Step 1: Rewrite `api/src/artefacts/service-pure.ts`**

Keep `extractManifest`, `Manifest`, `ExtractManifestOpts`, and the byte caps. Drop everything else. Final file:

```typescript
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { PassThrough, type Readable } from 'node:stream'
import * as tar from 'tar-stream'
import * as semver from 'semver'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

export interface Manifest {
  name: string
  version: string
  licence?: string
  category?: string
}

// Default caps protecting against tar bombs and malformed archives.
export const MAX_DECOMPRESSED_BYTES = 1024 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
export const MAX_TAR_ENTRIES = 100_000

class ManifestFoundError extends Error {}

const countingPassthrough = (limit: number, label: string) => {
  let seen = 0
  const pt = new PassThrough()
  pt.on('data', (chunk: Buffer) => {
    seen += chunk.length
    if (seen > limit) {
      pt.destroy(httpError(413, `${label} exceeds ${limit} bytes`))
    }
  })
  return pt
}

export interface ExtractManifestOpts {
  maxDecompressedBytes?: number
  maxTarEntries?: number
}

export const extractManifest = async (stream: Readable, opts: ExtractManifestOpts = {}): Promise<Manifest> => {
  const maxDecompressedBytes = opts.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES
  const maxTarEntries = opts.maxTarEntries ?? MAX_TAR_ENTRIES
  const extract = tar.extract()
  let manifest: Manifest | null = null
  let manifestError: Error | null = null
  let entryCount = 0

  extract.on('entry', (header, entryStream, next) => {
    entryCount++
    if (entryCount > maxTarEntries) {
      const err = httpError(413, `tarball exceeds ${maxTarEntries} entries`)
      entryStream.on('end', () => next(err))
      entryStream.resume()
      return
    }
    if (header.name === 'package/package.json') {
      if (header.size !== undefined && header.size > MAX_MANIFEST_BYTES) {
        next(httpError(413, `package.json exceeds ${MAX_MANIFEST_BYTES} bytes`))
        return
      }
      let size = 0
      const chunks: Buffer[] = []
      entryStream.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_MANIFEST_BYTES) {
          entryStream.destroy(httpError(413, `package.json exceeds ${MAX_MANIFEST_BYTES} bytes`))
          return
        }
        chunks.push(chunk)
      })
      entryStream.on('end', () => {
        try {
          const pkg = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          manifest = {
            name: pkg.name,
            version: pkg.version,
            licence: pkg.licence || pkg.license,
            category: pkg.registry?.category || 'other'
          }
          next(new ManifestFoundError())
        } catch (err) {
          manifestError = httpError(400, `invalid package.json: ${(err as Error).message}`)
          next(manifestError)
        }
      })
      entryStream.on('error', next)
    } else {
      entryStream.on('end', next)
      entryStream.resume()
    }
  })

  try {
    await pipeline(
      stream,
      countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
      createGunzip(),
      countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
      extract
    )
  } catch (err) {
    if (err instanceof ManifestFoundError) {
      // expected early-abort signal
    } else {
      if (manifestError) throw manifestError
      throw err
    }
  }

  if (!manifest) throw httpError(400, 'package.json not found in tarball')
  const result = manifest as Manifest
  if (!result.name) throw httpError(400, 'missing name in package.json')
  if (!result.version) throw httpError(400, 'missing version in package.json')
  if (!semver.valid(result.version)) throw httpError(400, `invalid semver: ${result.version}`)

  return result
}
```

- [ ] **Step 2: Rewrite `api/src/artefacts/service.ts`**

It becomes a small re-export shim (no Mongo logic remains since `pruneOldVersions` is gone):

```typescript
export type { Manifest, ExtractManifestOpts } from './service-pure.ts'
export {
  extractManifest,
  MAX_DECOMPRESSED_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_TAR_ENTRIES
} from './service-pure.ts'
```

- [ ] **Step 3: Trim `tests/artefacts-service.unit.spec.ts` to extractManifest only**

Remove the `parseSemver`, `resolveVersionQuery`, and `computePruneSet` test groups. Keep the gzip/tarball helpers and the `extractManifest` group. Update the import at the top to only pull `extractManifest` and `MAX_DECOMPRESSED_BYTES`:

```typescript
import { extractManifest, MAX_DECOMPRESSED_BYTES } from '../api/src/artefacts/service-pure.ts'
```

- [ ] **Step 4: Run the trimmed unit test**

Run: `npm run test tests/artefacts-service.unit.spec.ts`
Expected: PASS. Only `extractManifest` tests run.

- [ ] **Step 5: Commit**

```bash
git add api/src/artefacts/service-pure.ts api/src/artefacts/service.ts tests/artefacts-service.unit.spec.ts
git commit -m "refactor: drop semver, version resolver, retention helpers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Drop the federation filter on branch format

**Files:**
- Modify: `api/src/access.ts`

- [ ] **Step 1: Edit `api/src/access.ts`**

In `artefactAccessFilter`, replace the body:

```typescript
export const artefactAccessFilter = (caller: Caller): Filter<Artefact> => {
  if (caller.admin) return {}
  const orClauses: Filter<Artefact>[] = [{ public: true }]
  if (caller.account) {
    orClauses.push({
      privateAccess: { $elemMatch: { type: caller.account.type, id: caller.account.id } }
    })
  }
  return { $or: orClauses }
}
```

Also remove the now-stale `viaReadKey` documentation paragraph from the `Caller` type doc-comment (the bullet that says "Branch artefacts are hidden from these callers"). Keep the `viaReadKey` field itself — auth.ts still sets it — but its only remaining role is informational.

- [ ] **Step 2: Typecheck**

Run: `npm run check-types`
Expected: same errors as before — this change is independent.

- [ ] **Step 3: Commit**

```bash
git add api/src/access.ts
git commit -m "refactor: drop branch-format federation filter

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: New upload route — POST /artefacts/npm/:id (TDD)

**Files:**
- Modify: `tests/artefacts.api.spec.ts` (add test first; existing tests already broken by Task 1, that's fine for now)
- Modify: `api/src/artefacts/router.ts`

- [ ] **Step 1: Write the failing test**

At the top of `tests/artefacts.api.spec.ts`, just inside `test.describe('Artefacts', () => { ... })`, add a new sub-describe block (place it before existing blocks):

```typescript
test.describe('Unified npm upload', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
  })

  test('upload happy path creates an npm artefact with one tarball slot', async () => {
    const tarball = await createTestTarball({
      name: '@data-fair/processing-gpkg',
      version: '1.2.3',
      licence: 'MIT',
      category: 'processing'
    })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    form.append('architecture', 'x64')

    const ax = axiosWithApiKey(uploadApiKey)
    const res = await ax.post(
      '/api/v1/artefacts/npm/' + encodeURIComponent('@data-fair/processing-gpkg@1'),
      form,
      { headers: form.getHeaders() }
    )
    expect(res.status).toBe(201)
    expect(res.data.artefact._id).toBe('@data-fair/processing-gpkg@1')
    expect(res.data.artefact.format).toBe('npm')
    expect(res.data.artefact.packageName).toBe('@data-fair/processing-gpkg')
    expect(res.data.artefact.version).toBe('1.2.3')
    expect(res.data.artefact.category).toBe('processing')
    expect(res.data.artefact.tarballs).toBeTruthy()
    expect(res.data.artefact.tarballs.x64).toBeTruthy()
    expect(typeof res.data.artefact.tarballs.x64.size).toBe('number')
    expect(res.data.artefact.tarballs.x64.size).toBeGreaterThan(0)
    expect(res.data.artefact.tarballs.x64.uploadedBy.apiKeyName).toBe('test-upload')
  })

  test('upload without architecture form field defaults to noarch slot', async () => {
    const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

    const ax = axiosWithApiKey(uploadApiKey)
    const res = await ax.post(
      '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
      form,
      { headers: form.getHeaders() }
    )
    expect(res.status).toBe(201)
    expect(res.data.artefact.tarballs.noarch).toBeTruthy()
    expect(res.data.artefact.tarballs.x64).toBeUndefined()
  })

  test('per-arch upload updates only that slot', async () => {
    const ax = axiosWithApiKey(uploadApiKey)
    for (const arch of ['x64', 'arm64']) {
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      form.append('architecture', arch)
      await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form,
        { headers: form.getHeaders() }
      )
    }
    const admin = await superAdmin
    const detail = await admin.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'))
    expect(Object.keys(detail.data.tarballs).sort()).toEqual(['arm64', 'x64'])
  })

  test('re-upload to same arch swaps the tarball and bumps dataUpdatedAt', async () => {
    const ax = axiosWithApiKey(uploadApiKey)
    const form1 = new FormData()
    form1.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
    form1.append('architecture', 'x64')
    const first = await ax.post(
      '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
      form1,
      { headers: form1.getHeaders() }
    )
    const firstPath = first.data.artefact.tarballs.x64.path
    const firstDataAt = first.data.artefact.dataUpdatedAt

    await new Promise(r => setTimeout(r, 10))

    const form2 = new FormData()
    form2.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.1' }), { filename: 'p.tgz', contentType: 'application/gzip' })
    form2.append('architecture', 'x64')
    const second = await ax.post(
      '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
      form2,
      { headers: form2.getHeaders() }
    )
    expect(second.data.artefact.tarballs.x64.path).not.toBe(firstPath)
    expect(second.data.artefact.version).toBe('1.0.1')
    expect(second.data.artefact.dataUpdatedAt).not.toBe(firstDataAt)
  })

  test('re-upload with different manifest name on the same artefact id returns 409', async () => {
    const ax = axiosWithApiKey(uploadApiKey)
    const form1 = new FormData()
    form1.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
    await ax.post(
      '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
      form1,
      { headers: form1.getHeaders() }
    )

    const form2 = new FormData()
    form2.append('file', await createTestTarball({ name: '@other/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
    try {
      await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form2,
        { headers: form2.getHeaders() }
      )
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(409)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test tests/artefacts.api.spec.ts -- -g "Unified npm upload"`
Expected: FAIL (404 — route doesn't exist yet).

- [ ] **Step 3: Implement the new upload route**

Inside `api/src/artefacts/router.ts`, add a new route handler. Place it next to the existing `/file/:name` route. Below is the full implementation; it replaces the conceptual job of both the old `/versions` and `/branch/:name` routes.

```typescript
// Upload npm artefact (API key or internal secret auth, multipart).
// Each artefact id holds a `tarballs: { [arch]: ... }` map; per-arch upload
// updates one slot, leaves the others alone. `noarch` is the default arch
// for portable builds.
router.post('/npm/:id', async (req, res, next) => {
  const stagingPath = `_staging/${randomUUID()}.tgz`
  let stagingStored = false
  let newTarballPath: string | undefined
  let storedOk = false
  try {
    const isInternal = tryInternalSecret(req)
    let apiKey: Awaited<ReturnType<typeof authenticateApiKey>> | null = null
    if (!isInternal) {
      apiKey = await authenticateApiKey(req)
      if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload npm artefacts')
    }

    const id = safeDecode(req.params.id)
    if (apiKey?.allowedName && apiKey.allowedName !== id) {
      throw httpError(403, `this API key is not allowed to upload "${id}"`)
    }

    const existing = await mongo.artefacts.findOne({ _id: id })
    if (existing?.origin) {
      throw httpError(409, 'this artefact is managed by a remote registry')
    }
    if (existing && existing.format !== 'npm') {
      throw httpError(409, `this artefact already exists as a "${existing.format}" artefact`)
    }

    const { architecture, category: uploadCategory } = await streamTarballUpload(req, (stream) => writeFile(stream, stagingPath))
    stagingStored = true

    const { body: manifestStream } = await readFile(stagingPath)
    const manifest = await extractManifest(manifestStream, {
      maxDecompressedBytes: config.maxDecompressedBytes,
      maxTarEntries: config.maxTarEntries
    })

    if (existing?.packageName && existing.packageName !== manifest.name) {
      throw httpError(409, `package name mismatch: existing artefact tracks "${existing.packageName}", upload manifest says "${manifest.name}"`)
    }
    if (apiKey?.allowedPackageName && apiKey.allowedPackageName !== manifest.name) {
      throw httpError(403, `this API key is only allowed to upload package "${apiKey.allowedPackageName}"`)
    }

    const category = pickCategory(uploadCategory ?? manifest.category, npmCategories)
    if (apiKey?.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    const arch = architecture || 'noarch'
    const tarballPath = `npm/${id}/${arch}-${randomUUID()}.tgz`
    await moveFile(stagingPath, tarballPath)
    stagingStored = false
    newTarballPath = tarballPath
    const { size } = await fileStats(tarballPath)

    const now = new Date().toISOString()
    const tarballEntry = {
      path: tarballPath,
      size,
      uploadedAt: now,
      uploadedBy: apiKey
        ? { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId }
        : { internal: true }
    }

    await mongo.artefacts.updateOne(
      { _id: id },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          ...(manifest.licence ? { licence: manifest.licence } : {}),
          category,
          [`tarballs.${arch}`]: tarballEntry,
          size,
          updatedAt: now,
          dataUpdatedAt: now
        },
        $setOnInsert: {
          _id: id,
          name: id,
          format: 'npm' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )
    storedOk = true

    // Best-effort delete of the previous occupant of this arch slot.
    const previousPath = existing?.tarballs?.[arch]?.path
    if (previousPath && previousPath !== tarballPath) {
      await deleteFile(previousPath).catch(() => {})
    }

    const artefact = await mongo.artefacts.findOne({ _id: id })
    res.status(201).json({ artefact })
  } catch (err) {
    if (stagingStored) await deleteFile(stagingPath).catch(() => {})
    if (newTarballPath && !storedOk) await deleteFile(newTarballPath).catch(() => {})
    next(err)
  }
})
```

(The existing helper `streamTarballUpload` already reads `architecture` and `category` from the multipart form. No change to it needed.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test tests/artefacts.api.spec.ts -- -g "Unified npm upload"`
Expected: PASS on the new tests. (Other tests in the file are still red — handled in later tasks.)

- [ ] **Step 5: Commit**

```bash
git add api/src/artefacts/router.ts tests/artefacts.api.spec.ts
git commit -m "feat: POST /artefacts/npm/:id with per-arch tarball slots

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: New download route — GET /artefacts/:id/tarball (TDD)

**Files:**
- Modify: `tests/artefacts.api.spec.ts`
- Modify: `api/src/artefacts/router.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `Unified npm upload` describe (or in a new sibling describe `Unified npm download` — sibling is cleaner; place it right after `Unified npm upload`):

```typescript
test.describe('Unified npm download', () => {
  test.beforeEach(async () => {
    await clean()
    const admin = await superAdmin
    const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key

    // Two arch slots for @test/pkg@1
    const ax = axiosWithApiKey(uploadApiKey)
    for (const arch of ['x64', 'arm64']) {
      const form = new FormData()
      form.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      form.append('architecture', arch)
      await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form,
        { headers: form.getHeaders() }
      )
    }
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
  })

  test('download with explicit arch returns the matching slot', async () => {
    const admin = await superAdmin
    const res = await admin.get(
      '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/tarball?architecture=x64',
      { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
    )
    expect([200, 302]).toContain(res.status)
  })

  test('download with no arch on an arch-only artefact returns 404', async () => {
    const admin = await superAdmin
    try {
      await admin.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/tarball')
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  test('download falls back to noarch when arch slot is absent', async () => {
    // Upload a noarch tarball for a different id
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', await createTestTarball({ name: '@test/portable', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
    await ax.post(
      '/api/v1/artefacts/npm/' + encodeURIComponent('@test/portable@1'),
      form,
      { headers: form.getHeaders() }
    )
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/portable@1'), { public: true })

    const res = await admin.get(
      '/api/v1/artefacts/' + encodeURIComponent('@test/portable@1') + '/tarball?architecture=x64',
      { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
    )
    expect([200, 302]).toContain(res.status)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test tests/artefacts.api.spec.ts -- -g "Unified npm download"`
Expected: FAIL (route not present).

- [ ] **Step 3: Implement the download route**

Add to `api/src/artefacts/router.ts`, placed near the existing `/:id/download` (file) route:

```typescript
// Download npm artefact tarball. Optional ?architecture=<x64|arm64|...>
// resolves a specific slot; falls back to `noarch` if the requested arch is
// absent.
router.get('/:id/tarball', async (req, res, next) => {
  try {
    const caller = await resolveCaller(req)
    const filter = artefactAccessFilter(caller)
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
    if (!artefact) throw httpError(404, 'artefact not found')
    if (artefact.format !== 'npm') throw httpError(400, 'this artefact is not an npm-format artefact')
    await assertDownloadAccess(caller, artefact)

    const requestedArch = typeof req.query.architecture === 'string' ? req.query.architecture : undefined
    const tarballs = artefact.tarballs || {}
    const slot = (requestedArch && tarballs[requestedArch]) || tarballs.noarch
    if (!slot) throw httpError(404, 'no tarball for this architecture')

    const filename = `${artefact.name}-${artefact.version || 'tarball'}.tgz`
    const signedUrl = await getDownloadUrl(slot.path, { filename })
    if (signedUrl) {
      res.redirect(302, signedUrl)
      return
    }

    res.set('Content-Type', 'application/gzip')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    const { body, size, lastModified } = await readFile(slot.path, req.get('If-Modified-Since'))
    res.set('Last-Modified', lastModified.toUTCString())
    res.set('Content-Length', String(size))
    await pipeline(body, res).catch((err) => {
      if (!res.headersSent) next(err)
    })
  } catch (err) { next(err) }
})
```

- [ ] **Step 4: Run the tests**

Run: `npm run test tests/artefacts.api.spec.ts -- -g "Unified npm download"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/artefacts/router.ts tests/artefacts.api.spec.ts
git commit -m "feat: GET /artefacts/:id/tarball with arch resolution and noarch fallback

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Delete old npm version routes

**Files:**
- Modify: `api/src/artefacts/router.ts`
- Modify: `tests/artefacts.api.spec.ts`

- [ ] **Step 1: Delete the old routes from `api/src/artefacts/router.ts`**

Remove these entire handler blocks:
- `router.post('/:name/versions', ...)` (npm version upload)
- `router.get('/:id/versions/:version', ...)` (resolver)
- `router.get('/:id/versions/:version/tarball', ...)` (per-version download)

Also remove imports that become unused (e.g. the `Version` type import if any remains, and `parseSemver`, `resolveVersionQuery` from the service import — keep only `extractManifest`).

In the `GET /:id` handler (still present), simplify the npm branch — there's no `versions` sub-collection to fetch anymore:

```typescript
router.get('/:id', async (req, res, next) => {
  try {
    const filter = artefactAccessFilter(await resolveCaller(req))
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
    if (!artefact) throw httpError(404, 'artefact not found')
    res.json(artefact)
  } catch (err) { next(err) }
})
```

- [ ] **Step 2: Update tests/artefacts.api.spec.ts: delete obsolete tests**

Remove these `test.describe` blocks entirely from the file:
- `'Upload'` (the old `/versions` upload tests — they're superseded by `'Unified npm upload'`)
- `'List & Detail'` (sub-tests that assert `versions` arrays — those checks are gone)
- `'Version resolution'`
- `'Architecture-aware version resolution'`
- `'Architecture-aware noarch fallback'`
- `'Cross-major retention'`
- `'Tarball download'` (replaced by `'Unified npm download'`)

Keep `'PATCH & DELETE'` but adapt it to use the new upload route. Concretely, change the `beforeEach` of that block to:

```typescript
test.beforeEach(async () => {
  const ax = axiosWithApiKey(uploadApiKey)
  const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })
})
```

And update PATCH/DELETE URLs to use `@test/pkg@1` (the new id).

- [ ] **Step 3: Run the full artefacts spec**

Run: `npm run test tests/artefacts.api.spec.ts`
Expected: all remaining tests PASS.

- [ ] **Step 4: Commit**

```bash
git add api/src/artefacts/router.ts tests/artefacts.api.spec.ts
git commit -m "refactor: remove legacy npm /versions routes and tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: Delete old branch routes and branches test file

**Files:**
- Modify: `api/src/artefacts/router.ts`
- Delete: `tests/branches.api.spec.ts`

- [ ] **Step 1: Delete the branch routes from `api/src/artefacts/router.ts`**

Remove these handler blocks:
- `router.post('/branch/:name', ...)` (branch upload)
- `router.get('/:id/branch/tarball', ...)` (branch download)

Also clean up the `GET /` list handler. The current code allows `format=branch` in the format filter query:

```typescript
// In router.get('/', ...) — find this block and update:
if (req.query.format) {
  const allowedFormats = ['npm', 'file', 'branch']
  if (!allowedFormats.includes(req.query.format as string)) {
    throw httpError(400, `invalid format, must be one of: ${allowedFormats.join(', ')}`)
  }
  filter.format = req.query.format as Artefact['format']
}
```

becomes:

```typescript
if (req.query.format) {
  const allowedFormats = ['npm', 'file']
  if (!allowedFormats.includes(req.query.format as string)) {
    throw httpError(400, `invalid format, must be one of: ${allowedFormats.join(', ')}`)
  }
  filter.format = req.query.format as Artefact['format']
}
```

And in `DELETE /:id`, the branch-vs-file fast path is no longer needed since `file` is the only single-tarball-via-filePath shape left. Replace this block:

```typescript
if (artefact.format === 'file' || artefact.format === 'branch') {
  await mongo.artefacts.deleteOne({ _id: artefact._id })
  if (artefact.filePath) await deleteFile(artefact.filePath)
} else {
  const versions = await mongo.versions.find({ artefactId: artefact._id }).toArray()
  await mongo.versions.deleteMany({ artefactId: artefact._id })
  await mongo.artefacts.deleteOne({ _id: artefact._id })
  for (const version of versions) {
    await deleteFile(version.tarballPath)
  }
}
```

with:

```typescript
if (artefact.format === 'file') {
  await mongo.artefacts.deleteOne({ _id: artefact._id })
  if (artefact.filePath) await deleteFile(artefact.filePath)
} else {
  // npm: walk the tarballs map
  const paths = Object.values(artefact.tarballs ?? {}).map(t => t.path)
  await mongo.artefacts.deleteOne({ _id: artefact._id })
  for (const path of paths) {
    await deleteFile(path).catch(() => {})
  }
}
```

- [ ] **Step 2: Delete `tests/branches.api.spec.ts`**

```bash
git rm tests/branches.api.spec.ts
```

- [ ] **Step 3: Run quality on the api**

Run: `npm run test tests/artefacts.api.spec.ts tests/artefacts-file.api.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/src/artefacts/router.ts
git commit -m "refactor: remove legacy /branch routes and branches.api.spec

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: API key — add `allowedPackageName` (TDD)

**Files:**
- Modify: `tests/api-keys.api.spec.ts`
- Modify: `api/types/api-key/schema.js`
- Modify: `api/doc/api-keys/post-req/schema.js`
- Modify: `api/src/api-keys/router.ts`
- Modify: `api/src/artefacts/router.ts` (enforce — done in Task 6 already; this task adds the test coverage for it)

- [ ] **Step 1: Write the failing tests in `tests/api-keys.api.spec.ts`**

Append a new `test.describe` block:

```typescript
test.describe('allowedPackageName scoping', () => {
  test('creates a key with allowedPackageName', async () => {
    const ax = await superAdmin
    const res = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'pkg-scoped',
      allowedPackageName: '@data-fair/processing-gpkg'
    })
    expect(res.data.allowedPackageName).toBe('@data-fair/processing-gpkg')
  })

  test('rejects allowedPackageName on read keys', async () => {
    const ax = await superAdmin
    try {
      await ax.post('/api/v1/api-keys', {
        type: 'read',
        name: 'bad',
        owner: { type: 'organization', id: 'test1' },
        allowedPackageName: '@some/pkg'
      })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(400)
    }
  })

  test('upload rejected when manifest packageName mismatches allowedPackageName', async () => {
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'pkg-scoped',
      allowedPackageName: '@allowed/pkg'
    })
    const upload = axiosWithApiKey(keyRes.data.key)
    const tarball = await createTestTarball({ name: '@other/pkg', version: '1.0.0' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
    try {
      await upload.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@other/pkg@1'),
        form,
        { headers: form.getHeaders() }
      )
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(403)
    }
  })

  test('upload accepted when manifest packageName matches allowedPackageName', async () => {
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'pkg-scoped',
      allowedPackageName: '@allowed/pkg'
    })
    const upload = axiosWithApiKey(keyRes.data.key)
    const tarball = await createTestTarball({ name: '@allowed/pkg', version: '1.0.0' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
    const res = await upload.post(
      '/api/v1/artefacts/npm/' + encodeURIComponent('@allowed/pkg@1'),
      form,
      { headers: form.getHeaders() }
    )
    expect(res.status).toBe(201)
  })
})
```

If `tests/api-keys.api.spec.ts` doesn't already import `createTestTarball` and `axiosWithApiKey`, add them to the imports.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test tests/api-keys.api.spec.ts -- -g "allowedPackageName"`
Expected: FAIL (`allowedPackageName` not on the response; type validation rejects body).

- [ ] **Step 3: Add `allowedPackageName` to the ApiKey schema**

In `api/types/api-key/schema.js`, alongside `allowedName`:

```javascript
allowedPackageName: {
  type: 'string',
  description: 'Restricts an upload key to a single package (manifest name). Missing means unrestricted.',
  minLength: 1
}
```

- [ ] **Step 4: Add `allowedPackageName` to the POST request schema**

In `api/doc/api-keys/post-req/schema.js`, alongside `allowedName`:

```javascript
allowedPackageName: {
  type: 'string',
  description: 'Restricts an upload key to a single manifest package name. Only valid for upload keys.',
  minLength: 1
}
```

- [ ] **Step 5: Regenerate types**

Run: `npm run build-types`
Expected: succeeds.

- [ ] **Step 6: Update the router to reject the field on read keys and persist it on upload keys**

In `api/src/api-keys/router.ts`, in the POST handler:

```typescript
} else if (body.type === 'read') {
  if (body.allowedName) {
    throw httpError(400, 'allowedName is only valid for upload keys')
  }
  if (body.allowedCategory) {
    throw httpError(400, 'allowedCategory is only valid for upload keys')
  }
  if (body.allowedPackageName) {
    throw httpError(400, 'allowedPackageName is only valid for upload keys')
  }
  // …
}
```

And in the `apiKeyDoc` literal:

```typescript
...(body.allowedName ? { allowedName: body.allowedName } : {}),
...(body.allowedCategory ? { allowedCategory: body.allowedCategory } : {}),
...(body.allowedPackageName ? { allowedPackageName: body.allowedPackageName } : {}),
```

- [ ] **Step 7: Verify enforcement (already coded in Task 6 — sanity check)**

Open `api/src/artefacts/router.ts`. Confirm the `POST /npm/:id` handler contains this guard:

```typescript
if (apiKey?.allowedPackageName && apiKey.allowedPackageName !== manifest.name) {
  throw httpError(403, `this API key is only allowed to upload package "${apiKey.allowedPackageName}"`)
}
```

If it's missing (e.g. Task 6 was tweaked), add it after the `extractManifest` call and before `pickCategory`.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test tests/api-keys.api.spec.ts -- -g "allowedPackageName"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add api/types/api-key/ api/doc/api-keys/post-req/ api/src/api-keys/router.ts api/src/artefacts/router.ts tests/api-keys.api.spec.ts
git commit -m "feat: allowedPackageName scope on upload api keys

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: Remote-registries sync — adapt to new npm shape

**Files:**
- Modify: `api/src/remote-registries/sync.ts`
- Modify: `tests/remote-registries.api.spec.ts` (adapt to new shape)

- [ ] **Step 1: Rewrite `syncNpmArtefact`**

Open `api/src/remote-registries/sync.ts`. Replace the `syncNpmArtefact` function with:

```typescript
const syncNpmArtefact = async (ax: AxiosInstance, remoteUrl: string, artefactId: string) => {
  const encodedId = encodeURIComponent(artefactId)
  const remoteRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const remoteArtefact = remoteRes.data
  const remoteTarballs: Record<string, { path: string, size?: number, uploadedAt: string, uploadedBy?: unknown }> =
    remoteArtefact.tarballs || {}

  const local = await mongo.artefacts.findOne({ _id: artefactId })
  const localTarballs = local?.tarballs || {}

  const newTarballs: Record<string, { path: string, size: number, uploadedAt: string, uploadedBy?: unknown }> = {}
  for (const [arch, remoteSlot] of Object.entries(remoteTarballs)) {
    const localSlot = localTarballs[arch]
    if (localSlot && localSlot.uploadedAt === remoteSlot.uploadedAt) {
      newTarballs[arch] = localSlot
      continue
    }
    // Download the tarball for this arch slot — stream straight into storage.
    const dlRes = await ax.get(
      `/api/v1/artefacts/${encodedId}/tarball?architecture=${encodeURIComponent(arch)}`,
      { responseType: 'stream' }
    )
    await writeFile(dlRes.data, remoteSlot.path)
    newTarballs[arch] = {
      path: remoteSlot.path,
      size: remoteSlot.size ?? 0,
      uploadedAt: remoteSlot.uploadedAt,
      ...(remoteSlot.uploadedBy ? { uploadedBy: remoteSlot.uploadedBy } : {})
    } as typeof newTarballs[string]
  }

  // Delete local arch slots pruned upstream.
  for (const [arch, localSlot] of Object.entries(localTarballs)) {
    if (!(arch in remoteTarballs)) {
      await deleteFile(localSlot.path).catch(() => {})
    }
  }

  const now = new Date().toISOString()
  await mongo.artefacts.updateOne(
    { _id: artefactId },
    {
      $set: {
        packageName: remoteArtefact.packageName,
        version: remoteArtefact.version,
        licence: remoteArtefact.licence,
        category: remoteArtefact.category,
        ...(remoteArtefact.title ? { title: remoteArtefact.title } : {}),
        ...(remoteArtefact.description ? { description: remoteArtefact.description } : {}),
        ...(remoteArtefact.group ? { group: remoteArtefact.group } : {}),
        ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
        tarballs: newTarballs,
        origin: remoteUrl,
        updatedAt: now,
        dataUpdatedAt: remoteArtefact.dataUpdatedAt || remoteArtefact.updatedAt
      },
      $setOnInsert: {
        _id: artefactId,
        name: remoteArtefact.name,
        format: 'npm' as const,
        public: false,
        privateAccess: [],
        createdAt: now
      }
    },
    { upsert: true }
  )
}
```

The format-switching block in `syncRemoteRegistry` stays — it now branches between `'npm'` and `'file'` only (no `'branch'`).

- [ ] **Step 2: Update `tests/remote-registries.api.spec.ts`**

Wherever the test mocks a remote registry response, replace the `versions: [...]` array with a `tarballs: { ... }` map. Example transformation:

Before:
```typescript
{
  _id: '@test/pkg',
  name: '@test/pkg',
  format: 'npm',
  packageName: '@test/pkg',
  version: '1.0.0',
  versions: [{ version: '1.0.0', semverMajor: 1, semverMinor: 0, semverPatch: 0, tarballPath: '...', uploadedAt: '...' }]
}
```

After:
```typescript
{
  _id: '@test/pkg@1',
  name: '@test/pkg@1',
  format: 'npm',
  packageName: '@test/pkg',
  version: '1.0.0',
  tarballs: {
    noarch: { path: 'npm/@test/pkg@1/noarch-deadbeef.tgz', size: 100, uploadedAt: '2026-05-19T10:00:00Z' }
  }
}
```

Walk through every test in this file; assertions that check `mongo.versions` need to read `mongo.artefacts` and inspect `tarballs` instead.

- [ ] **Step 3: Run the test file**

Run: `npm run test tests/remote-registries.api.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/src/remote-registries/sync.ts tests/remote-registries.api.spec.ts
git commit -m "refactor: remote-registries sync walks tarballs map

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: UI — drop the versions table, render tarballs from the doc

**Files:**
- Modify: `ui/src/pages/admin/artefacts/[id].vue`
- Modify: `ui/src/pages/artefacts/[id].vue`

- [ ] **Step 1: Edit `ui/src/pages/admin/artefacts/[id].vue`**

Delete the `Version` type import and the `versions` ref:

```typescript
// Remove:
import type { Version } from '#types/version/index.ts'
const versions = ref<Version[]>([])
// And the line in onMounted/fetchArtefact that assigns versions:
versions.value = data.versions || []
```

Replace the versions-table `<template>` block (lines around 234–290 in the current file — look for the `{{ t('versions') }}` heading) with a tarballs panel:

```vue
<v-card-title class="text-h6">
  {{ t('tarballs') }}
  <span class="text-medium-emphasis text-body-2 ml-2">({{ Object.keys(artefact.tarballs ?? {}).length }})</span>
</v-card-title>
<v-card-text v-if="artefact.format === 'npm'">
  <v-table density="compact">
    <thead>
      <tr>
        <th>{{ t('architecture') }}</th>
        <th>{{ t('size') }}</th>
        <th>{{ t('uploadedAt') }}</th>
        <th>{{ t('uploadedBy') }}</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(slot, arch) in artefact.tarballs ?? {}" :key="arch">
        <td><code>{{ arch }}</code></td>
        <td>{{ formatBytes(slot.size) }}</td>
        <td>{{ slot.uploadedAt }}</td>
        <td>{{ slot.uploadedBy?.apiKeyName ?? (slot.uploadedBy?.internal ? 'internal' : '') }}</td>
        <td>
          <v-btn
            size="small"
            variant="text"
            :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/tarball?architecture=${arch}`"
          >
            {{ t('download') }}
          </v-btn>
        </td>
      </tr>
    </tbody>
  </v-table>
</v-card-text>
```

Update the `<i18n>` block (both `fr` and `en` locale objects in the file) to drop `versions` / `version` keys and add `tarballs`, `architecture`, `size`, `uploadedAt`, `uploadedBy`, `download` (if not already present). Keep the `confirmDeleteText` adjusted — "and all its versions" no longer applies; say "and its tarballs".

- [ ] **Step 2: Edit `ui/src/pages/artefacts/[id].vue`**

Apply the same versions → tarballs swap. Also remove the "download latest" header block at the top (the `<div v-if="hasGrant && artefact.format !== 'file' && versions.length > 0">` section). Read-only users see the same per-arch download buttons as admins.

- [ ] **Step 3: Quick smoke check**

The dev server is managed by the user (see AGENTS.md). Don't restart it. Check the build pipeline though:

Run: `npm run check-types`
Expected: PASS in ui workspace.

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/admin/artefacts/ ui/src/pages/artefacts/
git commit -m "feat(ui): show tarballs map on artefact detail, drop versions table

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: Lib-node — unified `ensureArtefact` (TDD)

**Files:**
- Modify: `tests/lib-node.api.spec.ts`
- Modify: `lib-node/index.ts`
- Modify: `lib-node/package.json`

- [ ] **Step 1: Rewrite `tests/lib-node.api.spec.ts`**

Replace its content with tests against the unified API:

```typescript
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'
import { ensureArtefact } from '../lib-node/index.ts'

const registryUrl = `http://localhost:${process.env.DEV_API_PORT}`
const secretKey = 'secret-internal'
let uploadApiKey: string
let cacheDir: string

const uploadNpm = async (id: string, manifest: { name: string, version: string }, architecture?: string) => {
  const ax = axiosWithApiKey(uploadApiKey)
  const tarball = await createTestTarball({ ...manifest, category: 'processing' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  if (architecture) form.append('architecture', architecture)
  return ax.post('/api/v1/artefacts/npm/' + encodeURIComponent(id), form, { headers: form.getHeaders() })
}

test.describe('lib-node-registry', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
    cacheDir = join(tmpdir(), `registry-test-cache-${Date.now()}`)
    await mkdir(cacheDir, { recursive: true })
  })

  test.afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  test('downloads and extracts on first call (noarch)', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/pkg@1',
      cacheDir,
      architecture: ''  // opt out, use noarch directly
    })
    expect(result.downloaded).toBe(true)
    expect(result.version).toBe('1.0.0')
    const pkg = JSON.parse(await readFile(join(result.path, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('@test/pkg')
  })

  test('returns cached result on second call', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', cacheDir, architecture: '' as const }

    const r1 = await ensureArtefact(opts)
    expect(r1.downloaded).toBe(true)
    const r2 = await ensureArtefact(opts)
    expect(r2.downloaded).toBe(false)
    expect(r2.path).toBe(r1.path)
  })

  test('re-downloads when dataUpdatedAt changes', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', cacheDir, architecture: '' as const }

    const r1 = await ensureArtefact(opts)
    expect(r1.version).toBe('1.0.0')

    await new Promise(r => setTimeout(r, 10))
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.1' })

    const r2 = await ensureArtefact(opts)
    expect(r2.downloaded).toBe(true)
    expect(r2.version).toBe('1.0.1')
  })

  test('serves arch-specific slot when requested', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' }, 'x64')
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/pkg@1',
      cacheDir,
      architecture: 'x64'
    })
    expect(result.downloaded).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test (should FAIL — the lib-node still calls /versions)**

Run: `npm run test tests/lib-node.api.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `lib-node/index.ts`**

Replace the `ensureArtefact` function and remove `ensureBranchArtefact`. The `ensureArtefactFile` function stays.

```typescript
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rm, rename, stat, utimes } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { arch as defaultArch } from 'node:process'
import * as tar from 'tar-stream'
import resolvePath from 'resolve-path'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import type { Readable } from 'node:stream'

export interface Account {
  type: 'user' | 'organization'
  id: string
  department?: string
}

export interface EnsureArtefactOpts {
  registryUrl: string
  secretKey: string
  artefactId: string
  cacheDir: string
  /**
   * Architecture to request. Defaults to the running Node process arch.
   * Pass an empty string to skip the arch query (registry returns the
   * `noarch` slot if present).
   */
  architecture?: string
  account?: Account
}

export interface EnsureArtefactResult {
  path: string
  /** Manifest-extracted version from the artefact doc; display-only. */
  version: string
  /** `dataUpdatedAt` of the artefact doc when this download happened. */
  dataUpdatedAt: string
  downloaded: boolean
}

interface CacheMeta {
  dataUpdatedAt: string
  architecture?: string
}

export async function ensureArtefact (opts: EnsureArtefactOpts): Promise<EnsureArtefactResult> {
  const architecture = opts.architecture === undefined ? defaultArch : (opts.architecture || undefined)
  const headers: Record<string, string> = { 'x-secret-key': opts.secretKey }
  if (opts.account) headers['x-account'] = JSON.stringify(opts.account)
  const ax = axiosBuilder({ baseURL: opts.registryUrl, headers })

  const encodedId = encodeURIComponent(opts.artefactId)
  const detailRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const artefact = detailRes.data
  if (artefact.format !== 'npm') {
    throw new Error(`artefact ${opts.artefactId} is not an npm artefact (format=${artefact.format})`)
  }
  const dataUpdatedAt: string = artefact.dataUpdatedAt || artefact.updatedAt
  const version: string = artefact.version

  const artefactDir = join(opts.cacheDir, opts.artefactId)
  const metaPath = join(artefactDir, '.current.json')
  const cacheKey = architecture ? `${architecture}` : 'noarch'
  const extractDir = join(artefactDir, cacheKey)

  try {
    const raw = await readFile(metaPath, 'utf-8')
    const meta: CacheMeta = JSON.parse(raw)
    if (meta.dataUpdatedAt === dataUpdatedAt && (meta.architecture ?? undefined) === architecture) {
      return { path: extractDir, version, dataUpdatedAt, downloaded: false }
    }
  } catch {
    // cold cache or invalid metadata
  }

  const params = architecture ? { architecture } : undefined
  const tarballRes = await ax.get(`/api/v1/artefacts/${encodedId}/tarball`, {
    responseType: 'stream',
    params
  })

  const tmpDir = `${extractDir}.tmp.${process.pid}`
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  try {
    await extractTarball(tarballRes.data as Readable, tmpDir)
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true })
    throw err
  }
  await rm(extractDir, { recursive: true, force: true })
  await rename(tmpDir, extractDir)

  const meta: CacheMeta = { dataUpdatedAt, ...(architecture ? { architecture } : {}) }
  await writeFile(metaPath, JSON.stringify(meta))

  return { path: extractDir, version, dataUpdatedAt, downloaded: true }
}

// ensureArtefactFile is unchanged from the previous version.
export interface EnsureArtefactFileOpts {
  registryUrl: string
  secretKey: string
  artefactId: string
  cacheDir: string
  fileName?: string
}

export interface EnsureArtefactFileResult {
  path: string
  downloaded: boolean
}

export async function ensureArtefactFile (opts: EnsureArtefactFileOpts): Promise<EnsureArtefactFileResult> {
  // (Body unchanged from previous version — copy from the existing file.)
  // … keep the existing implementation verbatim …
}

export async function extractTarball (stream: Readable, destDir: string): Promise<void> {
  // (Body unchanged — copy from the existing file.)
}
```

When you apply the edit, preserve the existing `ensureArtefactFile` and `extractTarball` bodies verbatim. The only thing being deleted is the `ensureBranchArtefact` function and its `EnsureBranchArtefactOpts` / `Result` / `BranchCacheMeta` interfaces.

- [ ] **Step 4: Bump version**

Edit `lib-node/package.json`: change `"version": "0.3.0"` to `"version": "0.4.0"`.

- [ ] **Step 5: Run the test**

Run: `npm run test tests/lib-node.api.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib-node/index.ts lib-node/package.json tests/lib-node.api.spec.ts
git commit -m "feat(lib-node): unify ensureArtefact, drop version param, bump 0.4.0

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: Final quality sweep + docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/ci-integration.md`
- Modify: `docs/superpowers/specs/2026-05-19-branch-artefacts-design.md`
- Possibly modify: any remaining call sites that still reference removed types.

- [ ] **Step 1: Run the full quality suite**

Run: `npm run quality`
Expected: all tests pass, lint clean, types clean.

If anything fails, fix the underlying call site. Common stragglers to check:
- `api/src/artefacts/router.ts` — confirm no lingering `parseSemver`, `resolveVersionQuery`, `pruneOldVersions`, `mongo.versions`, `format === 'branch'` references.
- `api/src/auth.ts` — `viaReadKey` flag stays; the field on `Caller` is still set, just no longer affects the access filter.

- [ ] **Step 2: Rewrite `docs/architecture.md`**

Replace the "Artefact formats" section:

```markdown
## Artefact formats

### npm artefacts

Plugins are packaged as npm tarballs. Each artefact identifies a single
*ref* (a release major or a dev branch), holding one mutable tarball per
architecture under `tarballs: { [arch]: { path, size, uploadedAt, uploadedBy } }`.
The convention for the artefact id is `<packageName>@<ref>` — for example
`@data-fair/processing-gpkg@1` for the 1.x release line and
`@data-fair/processing-gpkg@main` for a rolling dev build. The registry
treats the id as opaque; the recommended convention is enforced only at
the operator level.

Each upload replaces the tarball in the named arch slot. Other arch slots
are untouched. The artefact doc's `version` mirrors the manifest's
`package.json#version` for display only — there is no semver parsing,
resolver, or retention policy.

### File artefacts

Raw files (e.g. `.mbtiles` tilesets) are uploaded directly. They have no
versioning — each upload replaces the previous file. The artefact id is
simply the name.
```

Replace the "Plugin consumption by services" section's code sample:

```typescript
import { ensureArtefact } from '@data-fair/lib-node-registry'

const { path, version, dataUpdatedAt, downloaded } = await ensureArtefact({
  registryUrl: 'https://registry.example.com',
  secretKey: process.env.REGISTRY_SECRET,
  artefactId: '@scope/plugin@1',  // ref id
  architecture: process.arch,
  cacheDir: '/data/plugins'
})
```

And replace the flow:

```markdown
1. Fetch `GET /api/v1/artefacts/<id>` to read the artefact doc.
2. Compare `dataUpdatedAt` against the local cache. If unchanged, return
   the cached extraction.
3. Otherwise download `GET /api/v1/artefacts/<id>/tarball?architecture=<arch>`
   (with noarch fallback) and extract to the cache.
```

Delete the entire "Version resolution" table at the end of the file.

In "Remote registries → Sync behavior", update the npm bullet:

> **npm artefacts** — Each `tarballs[arch]` slot is compared by `uploadedAt`. New/changed slots are downloaded; slots pruned upstream are deleted locally.

- [ ] **Step 3: Rewrite `docs/ci-integration.md`**

Update the tag-flow upload step:

```bash
PACKAGE_NAME=$(node -p "require('./package.json').name")
PACKAGE_MAJOR=$(node -p "require('./package.json').version.split('.')[0]")
ENCODED_ID=$(node -p "encodeURIComponent('${PACKAGE_NAME}@${PACKAGE_MAJOR}')")
curl -f -X POST \
  "${REGISTRY_URL}/api/v1/artefacts/npm/${ENCODED_ID}" \
  -H "x-api-key: ${REGISTRY_API_KEY}" \
  -F "architecture=x64" \
  -F "file=@with-deps.tgz"
```

Update the API-key recommendation: "Allowed package name: the `package.json#name` (e.g. `@data-fair/processing-gpkg`) — covers `@1`, `@2`, `@main`, etc."

Rewrite the branch flow upload step to target `${PACKAGE_NAME}@main` (not `${PACKAGE_NAME}-main`). Drop the `branchName` form field. Drop the convention note saying "the branch artefact's `_id`, not the package name" — both flows now use the same id shape.

Drop the "Allowed name" guidance pointing at branch-specific ids — `allowedPackageName=<package>` covers both flows.

- [ ] **Step 4: Add a footer to the branch-artefacts spec**

Append to `docs/superpowers/specs/2026-05-19-branch-artefacts-design.md`:

```markdown

---

## Superseded

The `branch` format described above was absorbed into a unified `npm`
format on 2026-05-19. See
[`2026-05-19-unified-npm-format-design.md`](2026-05-19-unified-npm-format-design.md).
This spec is kept as historical context.
```

- [ ] **Step 5: Final quality run**

Run: `npm run quality`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture.md docs/ci-integration.md docs/superpowers/specs/2026-05-19-branch-artefacts-design.md
git commit -m "docs: align architecture and ci-integration with unified npm format

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Acceptance criteria

After all tasks complete:

- `npm run quality` passes (lint, types, all tests).
- The `artefacts` collection is the only artefact storage; `versions` collection is no longer referenced anywhere.
- `POST /api/v1/artefacts/npm/:id` and `GET /api/v1/artefacts/:id/tarball` are the only npm I/O endpoints. The five legacy routes (`POST /:name/versions`, `GET /:id/versions/:v`, `GET /:id/versions/:v/tarball`, `POST /branch/:name`, `GET /:id/branch/tarball`) are gone.
- `format` enum on the artefact doc is exactly `['npm', 'file']`.
- API keys accept and enforce `allowedPackageName`.
- `lib-node-registry` exports `ensureArtefact` (no `version` param) and `ensureArtefactFile` only. No `ensureBranchArtefact`.
- `lib-node/package.json` reads `"version": "0.4.0"`.
- UI artefact detail pages show a tarballs table instead of a versions table; no `versions.length > 0` or "latest version" UI elements remain.
- `docs/architecture.md` and `docs/ci-integration.md` describe the new model; the old branch-artefacts spec has a "Superseded" footer.

## Deployment runbook (out of plan scope, here for reference)

When the user is ready to roll out on the staging registry:

1. Stop the API + UI processes.
2. Drop the four affected Mongo collections (`artefacts`, `versions`, `thumbnails`, `access-grants`) and clear the tarball storage volume (or S3 prefix).
3. Deploy the new code.
4. Restart the services.
5. Re-publish from CI workflows (after the CI YAMLs in each consumer repo have been updated per the new doc).
6. Update consumer services to `@data-fair/lib-node-registry@0.4.0`.

No migration code, no `410 Gone` window, no compatibility shims.
