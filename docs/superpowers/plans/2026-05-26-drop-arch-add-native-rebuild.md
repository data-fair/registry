# Drop per-arch tarballs, add native rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the registry's per-arch tarball model with a single tarball per npm artefact, detect native modules at upload, and have the consumer-side lib-node rebuild them after extraction. Plus: reusable composite CI action for plugin uploads, processing-gpkg/processings adaptations.

**Architecture:** npm artefacts get a flat `path` + `hasNativeModules` shape on the artefact doc, mirroring how `file` format already lays out its blob. lib-node gains a `build: true` option that runs `npm rebuild` (offline) iff `hasNativeModules` is true, with the cache key keyed by `<nodeMajor>-<libc>` so a runtime upgrade invalidates naturally. A boot-time idempotent mongo `$rename` migrates the existing `file` format docs' `filePath → path`. SPA format is untouched.

**Tech Stack:** Node.js (Express, MongoDB), TypeScript, tar-stream, Vue 3 / Vuetify, Playwright test runner, GitHub Actions composite action.

**Spec:** `docs/superpowers/specs/2026-05-26-drop-arch-add-native-rebuild-design.md`

**Affected repos:**
- `data-fair/registry` (this repo) — schema, detection, lib-node, composite action, UI
- `data-fair/processing-gpkg` — switch workflows to composite action
- `data-fair/processings` — drop architecture from v5.2.0 migration, pass build:true, add Dockerfile toolchain

---

## File Structure

**Registry (this repo):**
- Modify: `api/types/artefact/schema.js` — drop `tarballs`, hoist `path`, add `hasNativeModules`, rename `filePath → path`
- Regenerate: `api/types/artefact/.type/index.d.ts` (via `npm run build-types`)
- Modify: `api/src/artefacts/operations.ts` — extend `extractManifest` to return `hasNativeModules`
- Modify: `api/src/artefacts/service.ts` — flat-shape `commitNpmUpload` + `commitFileUpload` + `deleteArtefact`
- Modify: `api/src/artefacts/router.ts` — drop `architecture` form/query, simplify single-tarball download path
- Modify: `api/src/remote-registries/sync.ts` — flat shape; drop `?architecture=`
- Modify: `api/src/server.ts` — call boot-time rename
- Create: `api/src/boot-rename-file-path.ts` — single idempotent `$rename` with removal comment
- Modify: `lib-node/index.ts` — drop `architecture`, add `build`, change cache key, add `rebuildNativeModules`
- Modify: `tests/support/test-tarball.ts` — extend to inject native-module signals
- Modify: `tests/artefacts-operations.unit.spec.ts` — detection unit tests
- Modify: `tests/artefacts.api.spec.ts` — rewrite per-arch tests to flat shape
- Modify: `tests/lib-node.api.spec.ts` — drop architecture, add build tests
- Modify: `ui/src/pages/artefacts/[id].vue` — read `path` not `tarballs`/`filePath`; show `hasNativeModules` badge
- Create: `.github/actions/publish-plugin/action.yml` — reusable composite action

**processing-gpkg:**
- Modify: `.github/workflows/publish.yml` — delegate to composite action
- Modify: `.github/workflows/publish-main.yml` — delegate to composite action

**processings:**
- Modify: `upgrade/5.2.0/01-publish-plugins-to-registry.ts` — drop `architecture` form field, probe via `path`
- Modify: `worker/src/task/task.ts` — pass `build: true` to `ensureArtefact`
- Modify: `api/src/processings/router.ts` — pass `build: true` to `ensureArtefact`
- Modify: `Dockerfile` — add `python3 make g++` to runtime stage

---

## Task 1 — Update artefact JSON schema

**Files:**
- Modify: `api/types/artefact/schema.js`
- Regenerate: `api/types/artefact/.type/index.d.ts` via `npm run build-types`

- [ ] **Step 1: Replace the `tarballs` block, hoist `path`, add `hasNativeModules`, drop `filePath`**

Edit `api/types/artefact/schema.js`:

Remove the entire `tarballs:` property block (lines ~23-48 in current file — the block starting `// Per-architecture tarball slots ...` through its closing `}`).

Remove the `filePath: { type: 'string', readOnly: true },` line (currently around line 162).

Add at the artefact root, alongside `size`:

```js
    // Path to the artefact's primary blob in files-storage. For npm, the
    // tarball; for file, the uploaded file; for spa, currently still
    // tarballPath (spa is unchanged in this revision). Renamed from
    // filePath for npm/file symmetry.
    path: { type: 'string', readOnly: true },
    // True iff the npm tarball contains compiled .node binaries, a
    // binding.gyp, a prebuilds/ directory, or an install/preinstall/
    // postinstall script that references node-gyp / prebuild-install /
    // node-gyp-build / node-pre-gyp. Set at upload time; consumers
    // (lib-node) use it to decide whether to run `npm rebuild` after
    // extraction.
    hasNativeModules: { type: 'boolean', readOnly: true },
```

- [ ] **Step 2: Regenerate types**

Run from registry root:
```bash
npm run build-types
```

Expected: regenerates `api/types/artefact/.type/index.d.ts` with `path?: string`, `hasNativeModules?: boolean`, and no `tarballs` / `filePath`.

- [ ] **Step 3: Touch api/index.ts to force nodemon reload**

```bash
touch api/index.ts
```

(Known nodemon/build-types race per CLAUDE.md memory.)

- [ ] **Step 4: Commit**

```bash
git add api/types/artefact/schema.js api/types/artefact/.type/
git commit -m "feat(schema): flatten artefact tarball/file path to single 'path' field

- npm: drop per-arch 'tarballs' map; add top-level 'path' + 'hasNativeModules'
- file: rename 'filePath' to 'path'
- spa: untouched in this revision"
```

---

## Task 2 — Native-module detection in extractManifest

**Files:**
- Modify: `api/src/artefacts/operations.ts`
- Modify: `tests/support/test-tarball.ts` — add optional entries
- Modify: `tests/artefacts-operations.unit.spec.ts` — new tests

- [ ] **Step 1: Extend the test tarball helper to accept extra entries**

Edit `tests/support/test-tarball.ts`:

```typescript
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
import * as tar from 'tar-stream'

export interface TarballEntry {
  /** Full tar path including the `package/` prefix, e.g. `package/node_modules/foo/binding.gyp` */
  name: string
  content: string | Buffer
}

export interface TarballOptions {
  name: string
  version: string
  licence?: string
  /** Additional entries appended after package/package.json. Useful for native-module signal tests. */
  extraEntries?: TarballEntry[]
}

export const createTestTarball = async (options: TarballOptions): Promise<Buffer> => {
  const pack = tar.pack()
  const pkg = {
    name: options.name,
    version: options.version,
    ...(options.licence ? { licence: options.licence } : {})
  }
  pack.entry({ name: 'package/package.json' }, JSON.stringify(pkg, null, 2))
  for (const entry of options.extraEntries ?? []) {
    pack.entry({ name: entry.name }, entry.content)
  }
  pack.finalize()

  const chunks: Buffer[] = []
  const gzip = createGzip()
  await pipeline(
    pack,
    gzip,
    new Writable({
      write (chunk, _encoding, callback) {
        chunks.push(chunk as Buffer)
        callback()
      }
    })
  )
  return Buffer.concat(chunks)
}
```

- [ ] **Step 2: Write the failing detection tests**

Append to `tests/artefacts-operations.unit.spec.ts` (or create the test.describe block if it doesn't exist):

```typescript
import { test, expect } from '@playwright/test'
import { Readable } from 'node:stream'
import { extractManifest } from '../api/src/artefacts/operations.ts'
import { createTestTarball } from './support/test-tarball.ts'

const streamBuffer = (buf: Buffer): Readable => Readable.from(buf)

test.describe('extractManifest hasNativeModules detection', () => {
  test('pure JS package returns hasNativeModules=false', async () => {
    const tarball = await createTestTarball({ name: '@test/pure', version: '1.0.0' })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.manifest.name).toBe('@test/pure')
    expect(result.hasNativeModules).toBe(false)
  })

  test('package with a .node binary in node_modules returns true', async () => {
    const tarball = await createTestTarball({
      name: '@test/native', version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/build/Release/foo.node', content: 'BINARY' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('package with binding.gyp in node_modules returns true', async () => {
    const tarball = await createTestTarball({
      name: '@test/gyp', version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/binding.gyp', content: '{}' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('subpackage with node-gyp postinstall returns true', async () => {
    const subPkg = JSON.stringify({ name: 'foo', version: '1.0.0', scripts: { postinstall: 'node-gyp rebuild' } })
    const tarball = await createTestTarball({
      name: '@test/postinstall', version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/package.json', content: subPkg }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('subpackage with prebuild-install install script returns true', async () => {
    const subPkg = JSON.stringify({ name: 'foo', version: '1.0.0', scripts: { install: 'prebuild-install || node-gyp rebuild' } })
    const tarball = await createTestTarball({
      name: '@test/prebuild', version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/package.json', content: subPkg }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('prebuilds directory anywhere in node_modules returns true', async () => {
    const tarball = await createTestTarball({
      name: '@test/prebuilds', version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/prebuilds/linux-x64/foo.node', content: 'BINARY' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('top-level binding.gyp NOT in node_modules does not trigger', async () => {
    // The plugin package itself rarely ships a binding.gyp at top level;
    // when it does, it's metadata about the plugin's own build (not a dep
    // to rebuild). Detection scopes to node_modules/** to avoid false
    // positives on plugins that bundle native helpers as source.
    const tarball = await createTestTarball({
      name: '@test/topgyp', version: '1.0.0',
      extraEntries: [{ name: 'package/binding.gyp', content: '{}' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm run test -- tests/artefacts-operations.unit.spec.ts
```

Expected: All seven new tests fail because `extractManifest` returns a plain `Manifest`, not `{ manifest, hasNativeModules }`.

- [ ] **Step 4: Implement detection in extractManifest**

Edit `api/src/artefacts/operations.ts`. Replace the existing `extractManifest` with a version that:
- No longer aborts the pipeline on `ManifestFoundError` — walks all entries.
- Collects a `hasNativeModules` boolean during the walk.
- Returns `{ manifest, hasNativeModules }`.

Replace `export interface Manifest { ... }` and the body of `extractManifest` with:

```typescript
export interface Manifest {
  name: string
  version: string
  licence?: string
}

export interface ExtractManifestResult {
  manifest: Manifest
  hasNativeModules: boolean
}

const NATIVE_SCRIPT_PATTERNS = ['node-gyp', 'prebuild-install', 'node-gyp-build', 'node-pre-gyp']

// Walk a `package/node_modules/<pkg>/package.json` entry's parsed JSON and
// decide whether any install lifecycle script references a known native-
// module build tool. The list of patterns is closed (not regex-loose) so we
// don't false-positive on user-defined scripts that happen to mention gyp.
const scriptIndicatesNative = (pkg: unknown): boolean => {
  if (!pkg || typeof pkg !== 'object') return false
  const scripts = (pkg as { scripts?: unknown }).scripts
  if (!scripts || typeof scripts !== 'object') return false
  for (const hook of ['install', 'preinstall', 'postinstall'] as const) {
    const cmd = (scripts as Record<string, unknown>)[hook]
    if (typeof cmd !== 'string') continue
    if (NATIVE_SCRIPT_PATTERNS.some(p => cmd.includes(p))) return true
  }
  return false
}

const NODE_MODULES_PREFIX = 'package/node_modules/'
const isInNodeModules = (path: string) => path.startsWith(NODE_MODULES_PREFIX)

export const extractManifest = async (
  stream: Readable,
  opts: ExtractManifestOpts = {}
): Promise<ExtractManifestResult> => {
  const maxDecompressedBytes = opts.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES
  const maxTarEntries = opts.maxTarEntries ?? MAX_TAR_ENTRIES
  const extract = tar.extract()
  let manifest: Manifest | null = null
  let manifestError: Error | null = null
  let entryCount = 0
  let hasNativeModules = false

  extract.on('entry', (header, entryStream, next) => {
    entryCount++
    if (entryCount > maxTarEntries) {
      const err = httpError(413, `tarball exceeds ${maxTarEntries} entries`)
      entryStream.on('end', () => next(err))
      entryStream.resume()
      return
    }

    const name = header.name

    // Signal 1: compiled binary inside node_modules
    if (isInNodeModules(name) && name.endsWith('.node')) hasNativeModules = true
    // Signal 2: binding.gyp inside node_modules
    if (isInNodeModules(name) && name.endsWith('/binding.gyp')) hasNativeModules = true
    // Signal 4: prebuilds dir inside node_modules
    if (isInNodeModules(name) && name.includes('/prebuilds/')) hasNativeModules = true

    if (name === 'package/package.json') {
      // top-level manifest — parse and keep, but DO NOT abort. We need to
      // finish walking to collect native-module signals.
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
            licence: pkg.licence || pkg.license
          }
          next()
        } catch (err) {
          manifestError = httpError(400, `invalid package.json: ${(err as Error).message}`)
          next(manifestError)
        }
      })
      entryStream.on('error', next)
      return
    }

    // Signal 3: subpackage package.json with native script
    if (isInNodeModules(name) && name.endsWith('/package.json')) {
      // Bound the read at MAX_MANIFEST_BYTES — subpackage manifests are tiny.
      let size = 0
      const chunks: Buffer[] = []
      entryStream.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_MANIFEST_BYTES) {
          entryStream.destroy()
          return
        }
        chunks.push(chunk)
      })
      entryStream.on('end', () => {
        try {
          const pkg = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          if (scriptIndicatesNative(pkg)) hasNativeModules = true
        } catch {
          // ignore malformed subpackage package.json — not our problem here
        }
        next()
      })
      entryStream.on('error', next)
      return
    }

    entryStream.on('end', next)
    entryStream.resume()
  })

  await pipeline(
    stream,
    countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
    createGunzip(),
    countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
    extract
  )

  if (manifestError) throw manifestError
  if (!manifest) throw httpError(400, 'package.json not found in tarball')
  const result = manifest as Manifest
  if (!result.name) throw httpError(400, 'missing name in package.json')
  if (!result.version) throw httpError(400, 'missing version in package.json')
  if (!semver.valid(result.version)) throw httpError(400, `invalid semver: ${result.version}`)

  return { manifest: result, hasNativeModules }
}
```

Also remove the now-unused `class ManifestFoundError extends Error {}` declaration.

- [ ] **Step 5: Update extractStagedManifest in service.ts to use the new return shape**

Edit `api/src/artefacts/service.ts`:

Change `export type { Manifest } from './operations.ts'` (stays).

Change the existing `extractStagedManifest`:

```typescript
export const extractStagedManifest = async (
  stagingPath: string
): Promise<{ manifest: Manifest, hasNativeModules: boolean }> => {
  const { body } = await filesStorage.readStream(stagingPath)
  return extractManifest(body, {
    maxDecompressedBytes: config.maxDecompressedBytes,
    maxTarEntries: config.maxTarEntries
  })
}
```

Update the import:
```typescript
import { extractManifest, type Manifest } from './operations.ts'
```
(Already there; nothing to add.)

- [ ] **Step 6: Update router.ts callers of extractStagedManifest**

Edit `api/src/artefacts/router.ts`. Currently the upload handlers call:

```typescript
const manifest = await extractStagedManifest(stagingPath)
```

Replace with (in both the npm and the spa handler if both still exist — verify by re-reading the file):

```typescript
const { manifest, hasNativeModules } = await extractStagedManifest(stagingPath)
```

(Pass `hasNativeModules` through to `commitNpmUpload` in Task 3 — we'll add it to that params type then.)

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm run test -- tests/artefacts-operations.unit.spec.ts
```

Expected: All seven detection tests pass, plus any existing operations tests still pass.

- [ ] **Step 8: Commit**

```bash
git add api/src/artefacts/operations.ts api/src/artefacts/service.ts api/src/artefacts/router.ts tests/support/test-tarball.ts tests/artefacts-operations.unit.spec.ts
git commit -m "feat(artefacts): detect native modules during manifest extraction

extractManifest now walks the full tarball (no early abort) and returns
{ manifest, hasNativeModules }. Detection covers .node binaries,
binding.gyp, prebuilds/ dirs, and install/preinstall/postinstall
scripts that reference node-gyp/prebuild-install/node-gyp-build/
node-pre-gyp inside node_modules/."
```

---

## Task 3 — Rewrite npm + file upload to flat schema

**Files:**
- Modify: `api/src/artefacts/service.ts`

- [ ] **Step 1: Rewrite commitNpmUpload to flat shape**

In `api/src/artefacts/service.ts`, replace `commitNpmUpload` with:

```typescript
export const commitNpmUpload = async (params: {
  id: string
  stagingPath: string
  manifest: Manifest
  hasNativeModules: boolean
  category: Artefact['category']
  uploadedBy: UploadedBy
  existing: Artefact | null
}): Promise<Artefact> => {
  const { id, stagingPath, manifest, hasNativeModules, category, uploadedBy, existing } = params
  // Namespace new writes with a random suffix so a failed delete of the
  // old tarball doesn't clobber the fresh one.
  const path = `npm/${id}/${randomUUID()}.tgz`
  await filesStorage.move(stagingPath, path)
  try {
    const { size } = await filesStorage.stats(path)
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: id },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          ...(manifest.licence ? { licence: manifest.licence } : {}),
          category,
          path,
          size,
          hasNativeModules,
          uploadedBy,
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
  } catch (err) {
    await filesStorage.delete(path).catch(() => {})
    throw err
  }

  if (existing?.path && existing.path !== path) {
    await filesStorage.delete(existing.path).catch(() => {})
  }

  return (await mongo.artefacts.findOne({ _id: id }))!
}
```

Removed: the `arch` parameter, the `tarballs.<arch>` $set key, the per-arch previous-occupant cleanup. Added: top-level `path`, `hasNativeModules`.

- [ ] **Step 2: Rewrite commitFileUpload to use `path` instead of `filePath`**

In the same file, in `commitFileUpload`, rename the local `filePath` variable and the `$set.filePath` key to `path`:

```typescript
export const commitFileUpload = async (params: {
  artefactId: string
  name: string
  fileName: string
  stagingPath: string
  category: Artefact['category']
  title?: Artefact['title']
  description?: Artefact['description']
  uploadedBy: UploadedBy
}): Promise<Artefact> => {
  const { artefactId, name, fileName, stagingPath, category, title, description, uploadedBy } = params
  const existing = await mongo.artefacts.findOne({ _id: artefactId })
  const path = `files/${name}/${randomUUID()}-${fileName}`
  await filesStorage.move(stagingPath, path)
  try {
    const { size } = await filesStorage.stats(path)
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          path,
          fileName,
          size,
          category,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          uploadedBy,
          updatedAt: now,
          dataUpdatedAt: now
        },
        $setOnInsert: {
          _id: artefactId,
          name,
          format: 'file' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )
  } catch (err) {
    await filesStorage.delete(path).catch(() => {})
    throw err
  }

  if (existing?.path && existing.path !== path) {
    await filesStorage.delete(existing.path).catch(() => {})
  }

  return (await mongo.artefacts.findOne({ _id: artefactId }))!
}
```

- [ ] **Step 3: Rewrite deleteArtefact to use `path` for both npm and file**

Replace the existing `deleteArtefact` body:

```typescript
export const deleteArtefact = async (artefact: Artefact) => {
  // Delete DB state first so concurrent GETs fail cleanly with 404,
  // then best-effort remove files.
  await mongo.artefacts.deleteOne({ _id: artefact._id })
  if (artefact.format === 'file' || artefact.format === 'npm') {
    if (artefact.path) await filesStorage.delete(artefact.path).catch(() => {})
  } else if (artefact.format === 'spa') {
    if (artefact.tarballPath) await filesStorage.delete(artefact.tarballPath).catch(() => {})
    if (artefact.extractedPath) await filesStorage.deleteDir(artefact.extractedPath).catch(() => {})
  }
  await mongo.thumbnails.deleteMany({ artefactId: artefact._id })
}
```

(SPA arm preserved — spa format unchanged.)

- [ ] **Step 4: Run type-check to catch downstream breakage**

```bash
npm run check-types
```

Expected: errors point to `api/src/artefacts/router.ts` (still references `arch`, `tarballs`, `filePath`), `api/src/remote-registries/sync.ts` (`tarballs`, `filePath`), and any other readers. These get fixed in Tasks 4 and 5.

- [ ] **Step 5: Commit (WIP — types fail, fixed next two tasks)**

```bash
git add api/src/artefacts/service.ts
git commit -m "refactor(artefacts): flatten npm + file upload to single 'path' field

Drops per-arch tarballs map; promotes path/size to artefact root.
hasNativeModules is now persisted from upload-time detection.
deleteArtefact handles both npm and file via the unified path field."
```

---

## Task 4 — Update artefact router to single-tarball

**Files:**
- Modify: `api/src/artefacts/router.ts`

- [ ] **Step 1: Drop the `architecture` field from streamTarballUpload return type and body**

In `api/src/artefacts/router.ts`, change `streamTarballUpload` to no longer collect `architecture`. Update its signature and field-handling:

```typescript
function streamTarballUpload (
  req: import('express').Request,
  writer: StreamWriter
): Promise<{ category?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (err: Error | null, result?: { category?: string }) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(result!)
    }

    let category: string | undefined
    let fileSeen = false
    let pendingWrite: Promise<void> | null = null

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 20,
        fieldSize: 64 * 1024,
        fieldNameSize: 200
      }
    })

    busboy.on('field', (name, val) => {
      if (name === 'category') category = val
    })

    busboy.on('file', (_name, stream) => {
      if (fileSeen) {
        stream.resume()
        return
      }
      fileSeen = true

      stream.on('limit', () => {
        stream.destroy(httpError(413, `upload exceeds ${MAX_UPLOAD_BYTES} bytes`))
        req.unpipe(busboy)
      })

      pendingWrite = writer(stream).catch((err) => {
        settle(err)
      })
    })

    busboy.on('error', (err) => settle(err as Error))
    busboy.on('finish', async () => {
      if (!fileSeen) return settle(httpError(400, 'no file provided in upload'))
      try {
        if (pendingWrite) await pendingWrite
      } catch (err) {
        return settle(err as Error)
      }
      if (settled) return
      settle(null, { category })
    })

    req.on('aborted', () => settle(httpError(400, 'upload aborted')))
    req.pipe(busboy)
  })
}
```

- [ ] **Step 2: Update the npm upload handler to use the flat shape**

Replace the body of the `router.post('/npm/:id', ...)` handler. The key changes: no `arch`, calls the updated `commitNpmUpload`, threads `hasNativeModules`:

```typescript
router.post('/npm/:id', async (req, res, next) => {
  const stagingPath = `_staging/${randomUUID()}.tgz`
  let stagingStored = false
  try {
    const isInternal = tryInternalSecret(req)
    let apiKey: Awaited<ReturnType<typeof authenticateApiKey>> | null = null
    if (!isInternal) {
      apiKey = await authenticateApiKey(req)
      if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload npm artefacts')
    }

    const id = safeDecode(req.params.id)
    if (apiKey?.allowedNamePrefix && !id.startsWith(apiKey.allowedNamePrefix)) {
      throw httpError(403, `this API key is not allowed to upload "${id}"`)
    }

    const existing = await getArtefactById(id)
    if (existing?.origin) {
      throw httpError(409, 'this artefact is managed by a remote registry')
    }
    if (existing && existing.format !== 'npm') {
      throw httpError(409, `this artefact already exists as a "${existing.format}" artefact`)
    }

    const { category: uploadCategory } = await streamTarballUpload(req, (stream) => filesStorage.writeStream(stream, stagingPath))
    stagingStored = true

    const { manifest, hasNativeModules } = await extractStagedManifest(stagingPath)

    if (existing?.packageName && existing.packageName !== manifest.name) {
      throw httpError(409, `package name mismatch: existing artefact tracks "${existing.packageName}", upload manifest says "${manifest.name}"`)
    }

    const category = pickCategory(uploadCategory, npmCategories)
    if (apiKey?.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    const artefact = await commitNpmUpload({
      id,
      stagingPath,
      manifest,
      hasNativeModules,
      category,
      uploadedBy: apiKey
        ? { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId }
        : { internal: true },
      existing
    })
    stagingStored = false
    res.status(201).json({ artefact })
  } catch (err) {
    if (stagingStored) await filesStorage.delete(stagingPath).catch(() => {})
    next(err)
  }
})
```

- [ ] **Step 3: Update the npm tarball download handler**

Replace the body of `router.get('/:id/tarball', ...)`:

```typescript
router.get('/:id/tarball', async (req, res, next) => {
  try {
    const caller = await resolveCaller(req)
    const filter = artefactAccessFilter(caller)
    const artefact = await getArtefact(req.params.id, filter)
    if (!artefact) throw httpError(404, 'artefact not found')
    if (artefact.format !== 'npm') throw httpError(400, 'this artefact is not an npm-format artefact')
    await assertDownloadAccess(caller, artefact)
    if (!artefact.path) throw httpError(404, 'no tarball uploaded for this artefact')

    const filename = `${artefact.name}-${artefact.version || 'tarball'}.tgz`
    const download = await resolveDownload(artefact.path, filename, req.get('If-Modified-Since'))
    if ('redirectUrl' in download) {
      res.redirect(302, download.redirectUrl)
      return
    }

    res.set('Content-Type', 'application/gzip')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    res.set('Last-Modified', download.lastModified.toUTCString())
    res.set('Content-Length', String(download.size))
    await pipeline(download.body, res).catch((err) => {
      if (!res.headersSent) next(err)
    })
  } catch (err) { next(err) }
})
```

Note: `?architecture=` query is silently ignored — the new handler doesn't read it.

- [ ] **Step 4: Update the file download handler to read `path`**

Replace the relevant bits of `router.get('/:id/download', ...)` to use `artefact.path` instead of `artefact.filePath`:

```typescript
    if (artefact.format !== 'file') throw httpError(400, 'this artefact is not a file-format artefact')
    if (!artefact.path) throw httpError(404, 'no file uploaded for this artefact')

    const filename = artefact.fileName || artefact.name
    const download = await resolveDownload(artefact.path, filename, req.get('If-Modified-Since'))
```

- [ ] **Step 5: Run type-check + run the existing api tests**

```bash
npm run check-types
npm run test -- tests/artefacts.api.spec.ts
```

Expected: type-check now passes for router.ts. The artefact API tests will still fail because they assert the old shape — that gets fixed in Task 9. Don't worry about those failures yet.

- [ ] **Step 6: Commit**

```bash
git add api/src/artefacts/router.ts
git commit -m "refactor(artefacts/router): drop architecture form/query, single tarball

Upload handler no longer reads the architecture form field. Tarball
download no longer keys by ?architecture=; falls back to artefact.path
verbatim. File download reads artefact.path instead of artefact.filePath."
```

---

## Task 5 — Update remote-registries/sync.ts to flat shape

**Files:**
- Modify: `api/src/remote-registries/sync.ts`

- [ ] **Step 1: Rewrite syncNpmArtefact for single-tarball model**

Replace the whole `syncNpmArtefact` function body with:

```typescript
const syncNpmArtefact = async (ax: AxiosInstance, remoteUrl: string, artefactId: string) => {
  const encodedId = encodeURIComponent(artefactId)
  const remoteRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const remoteArtefact = remoteRes.data

  const local = await mongo.artefacts.findOne({ _id: artefactId })

  // Fast path: same uploadedAt means no fresh upload upstream — keep local as-is.
  // (uploadedBy carries no uploadedAt on the artefact root; we compare on
  // remoteArtefact.dataUpdatedAt, which the registry bumps on every upload.)
  if (local?.path && local.dataUpdatedAt === remoteArtefact.dataUpdatedAt) {
    return
  }

  // Download fresh tarball.
  const localPath = `npm/${artefactId}/${randomUUID()}.tgz`
  const dlRes = await ax.get(
    `/api/v1/artefacts/${encodedId}/tarball`,
    { responseType: 'stream' }
  )
  await filesStorage.writeStream(dlRes.data, localPath)

  const now = new Date().toISOString()
  const oldPath = local?.path
  await mongo.artefacts.updateOne(
    { _id: artefactId },
    {
      $set: {
        packageName: remoteArtefact.packageName,
        version: remoteArtefact.version,
        licence: remoteArtefact.licence,
        category: remoteArtefact.category,
        deprecated: !!remoteArtefact.deprecated,
        hasNativeModules: !!remoteArtefact.hasNativeModules,
        ...(remoteArtefact.title ? { title: remoteArtefact.title } : {}),
        ...(remoteArtefact.description ? { description: remoteArtefact.description } : {}),
        ...(remoteArtefact.group ? { group: remoteArtefact.group } : {}),
        ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
        path: localPath,
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

  if (oldPath && oldPath !== localPath) {
    await filesStorage.delete(oldPath).catch(() => {})
  }
}
```

- [ ] **Step 2: Rewrite syncFileArtefact's references to use `path`**

In the same file, in `syncFileArtefact`, rename the local `filePath` to `path` and update the `$set` key:

Find the line:
```typescript
const filePath = `files/${remoteArtefact.name}/${randomUUID()}-${fileName}`
```
Rename `filePath` to `localPath`. Update `await filesStorage.writeStream(dlRes.data, filePath)` accordingly.

Find the `$set: { filePath, ... }` and change to `$set: { path: localPath, ... }`.

Find the `const oldFilePath = local?.filePath` and change to `const oldPath = local?.path`.

Find `if (oldFilePath && oldFilePath !== filePath)` and update to `if (oldPath && oldPath !== localPath)`.

- [ ] **Step 3: Run type-check**

```bash
npm run check-types
```

Expected: clean for sync.ts.

- [ ] **Step 4: Commit**

```bash
git add api/src/remote-registries/sync.ts
git commit -m "refactor(sync): adapt mirror to flat tarball/path schema"
```

---

## Task 6 — Boot-time `filePath → path` rename

**Files:**
- Create: `api/src/boot-rename-file-path.ts`
- Modify: `api/src/server.ts`

- [ ] **Step 1: Create the rename helper**

Create `api/src/boot-rename-file-path.ts`:

```typescript
import type { Db } from 'mongodb'

// One-time idempotent migration: file-format artefacts used to carry
// `filePath`; the new schema uses `path` everywhere. We $rename, so on
// re-runs the matcher returns zero docs and the call is a no-op.
//
// TODO(0.5.0): remove this once all environments are past 0.4.0.
export const renameFilePathToPath = async (db: Db): Promise<void> => {
  const res = await db.collection('artefacts').updateMany(
    { filePath: { $exists: true } },
    { $rename: { filePath: 'path' } }
  )
  if (res.modifiedCount > 0) {
    console.log(`[boot-rename] migrated ${res.modifiedCount} artefact(s): filePath -> path`)
  }
}
```

- [ ] **Step 2: Wire it into server start, after mongo.init**

Edit `api/src/server.ts`. Add the import near the existing ones:

```typescript
import { renameFilePathToPath } from './boot-rename-file-path.ts'
```

In the `start` function, between `await mongo.init()` and `await locks.start(mongo.db)`:

```typescript
  await mongo.init()
  await renameFilePathToPath(mongo.db)
  await locks.start(mongo.db)
```

- [ ] **Step 3: Run type-check**

```bash
npm run check-types
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add api/src/boot-rename-file-path.ts api/src/server.ts
git commit -m "feat(server): one-time boot rename of file-format filePath to path

Idempotent \$rename; only ever modifies docs that still carry the old
field. Marked for removal in 0.5.0 once all environments are past 0.4.0."
```

---

## Task 7 — lib-node: drop `architecture`, add `build`, change cache key

**Files:**
- Modify: `lib-node/index.ts`

- [ ] **Step 1: Update the options interface**

In `lib-node/index.ts`, replace `EnsureArtefactOpts`:

```typescript
export interface EnsureArtefactOpts {
  registryUrl: string
  secretKey: string
  artefactId: string
  cacheDir: string
  account?: Account
  /**
   * When true and the artefact's `hasNativeModules` is true, run `npm rebuild`
   * against the extracted node_modules. No-op when the artefact has no
   * native modules. The cache key incorporates Node major + libc, so a
   * runtime upgrade naturally invalidates the cache and forces a rebuild.
   */
  build?: boolean
}
```

(Removed: `architecture?: string` and its JSDoc.)

- [ ] **Step 2: Add runtime-tuple helpers**

Add near the top of the file, after imports:

```typescript
const nodeMajor = (): string => process.versions.node.split('.')[0]

const detectLibc = (): 'glibc' | 'musl' => {
  // process.report.getReport().header.glibcVersionRuntime is a non-empty
  // string on glibc, undefined or '' on musl (and on non-Linux). For our
  // purposes, "no glibc" means musl; the consumer is presumed Linux.
  try {
    const header = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header
    return header?.glibcVersionRuntime ? 'glibc' : 'musl'
  } catch {
    return 'musl'
  }
}
```

- [ ] **Step 3: Change the cache-key composition**

In `ensureArtefact`, replace the existing two lines that derive the cache key:

```typescript
  const architecture = opts.architecture === undefined ? defaultArch : (opts.architecture || undefined)
  // ...
  const cacheKey = architecture ? `${architecture}` : 'noarch'
  const extractDir = join(artefactDir, cacheKey)
```

with:

```typescript
  const buildTuple = opts.build ? `${nodeMajor()}-${detectLibc()}` : 'js'
  const extractDir = join(artefactDir, buildTuple)
```

Also remove the now-unused `import { arch as defaultArch } from 'node:process'`.

- [ ] **Step 4: Drop the `?architecture=` query in the tarball GET**

Replace:

```typescript
  const params = architecture ? { architecture } : undefined
  const tarballRes = await ax.get(`/api/v1/artefacts/${encodedId}/tarball`, {
    responseType: 'stream',
    params
  })
```

with:

```typescript
  const tarballRes = await ax.get(`/api/v1/artefacts/${encodedId}/tarball`, {
    responseType: 'stream'
  })
```

- [ ] **Step 5: Commit (WIP — rebuild added in next task)**

```bash
git add lib-node/index.ts
git commit -m "refactor(lib-node): replace architecture option with build option

Cache key keyed by Node major + libc when build:true; single 'js' slot
otherwise. Drops the ?architecture= query — the registry no longer reads
it."
```

---

## Task 8 — lib-node: implement `npm rebuild` step

**Files:**
- Modify: `lib-node/index.ts`
- Modify: `tests/lib-node.api.spec.ts` (failing test first)

- [ ] **Step 1: Write a failing test for `build: true` on a native-flagged artefact**

In `tests/lib-node.api.spec.ts`, add a new test inside the existing `test.describe('lib-node-registry', ...)` block:

```typescript
  test('build:true runs postinstall when hasNativeModules is true', async () => {
    // Upload a tarball that has a node_modules subpackage with a
    // postinstall that writes a sentinel file. The detector flags
    // it as hasNativeModules; with build:true lib-node runs `npm rebuild`
    // which executes that postinstall.
    const subPkg = JSON.stringify({
      name: 'sentinel',
      version: '1.0.0',
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(__dirname + \'/SENTINEL\', \'ok\')"' }
    })
    const tarball = await createTestTarball({
      name: '@test/with-postinstall',
      version: '1.0.0',
      extraEntries: [
        { name: 'package/node_modules/sentinel/package.json', content: subPkg }
      ]
    })
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/with-postinstall@1'), form, { headers: form.getHeaders() })

    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/with-postinstall@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl, secretKey,
      artefactId: '@test/with-postinstall@1',
      cacheDir,
      build: true
    })
    expect(result.downloaded).toBe(true)
    // The detector should have flagged the artefact; lib-node should have
    // run `npm rebuild` which executes the sentinel postinstall.
    const sentinel = join(result.path, 'node_modules', 'sentinel', 'SENTINEL')
    const fs = await import('node:fs/promises')
    await expect(fs.readFile(sentinel, 'utf-8')).resolves.toBe('ok')
  })

  test('build:false skips rebuild even when hasNativeModules is true', async () => {
    const subPkg = JSON.stringify({
      name: 'sentinel',
      version: '1.0.0',
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(__dirname + \'/SENTINEL\', \'ok\')"' }
    })
    const tarball = await createTestTarball({
      name: '@test/no-build',
      version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/sentinel/package.json', content: subPkg }]
    })
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/no-build@1'), form, { headers: form.getHeaders() })

    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/no-build@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl, secretKey,
      artefactId: '@test/no-build@1',
      cacheDir
      // build omitted -> false
    })
    const sentinel = join(result.path, 'node_modules', 'sentinel', 'SENTINEL')
    const fs = await import('node:fs/promises')
    await expect(fs.access(sentinel)).rejects.toBeTruthy()
  })
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npm run test -- tests/lib-node.api.spec.ts
```

Expected: both new tests fail (the first because no rebuild runs and the sentinel doesn't get written; the second incidentally passes if the implementation defaults to no rebuild — but check the first fails as proof the implementation is missing).

- [ ] **Step 3: Implement the rebuild step in lib-node**

In `lib-node/index.ts`, add a helper near the bottom of the file (after `extractTarball`):

```typescript
import { spawn } from 'node:child_process'

const rebuildNativeModules = (dir: string): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn('npm', ['rebuild'], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      // Strip anything that would let npm reach the network for new packages.
      npm_config_proxy: '',
      npm_config_https_proxy: '',
      NODE_AUTH_TOKEN: ''
    }
  })
  const stderrChunks: Buffer[] = []
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
  // Drain stdout to avoid back-pressure stalls; we don't surface it.
  child.stdout?.on('data', () => {})
  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) {
      resolve()
    } else {
      const stderr = Buffer.concat(stderrChunks).toString('utf-8').slice(0, 4000)
      reject(new Error(`npm rebuild exited with code ${code}: ${stderr}`))
    }
  })
})
```

In `ensureArtefact`, between the existing `await writeFile(join(tmpDir, '.meta.json'), ...)` and the `await rm(extractDir, { recursive: true, force: true })`, add:

```typescript
    if (opts.build && artefact.hasNativeModules) {
      await rebuildNativeModules(tmpDir)
    }
```

The whole try-block in `ensureArtefact` looks like:

```typescript
  try {
    await extractTarball(tarballRes.data as Readable, tmpDir)
    await writeFile(join(tmpDir, '.meta.json'), JSON.stringify({ dataUpdatedAt } satisfies CacheMeta))
    if (opts.build && artefact.hasNativeModules) {
      await rebuildNativeModules(tmpDir)
    }
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true })
    throw err
  }
```

If rebuild fails, the tmpDir cleanup runs and the prior `extractDir` (if any) survives untouched.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test -- tests/lib-node.api.spec.ts
```

Expected: the build:true test passes (sentinel exists), the build:false test passes (sentinel absent).

- [ ] **Step 5: Commit**

```bash
git add lib-node/index.ts tests/lib-node.api.spec.ts
git commit -m "feat(lib-node): npm rebuild step gated by build:true + hasNativeModules

Spawns 'npm rebuild' with offline/no-audit/no-fund env so install
scripts (node-gyp / prebuild-install) run without network. Failure
removes the staged tmpDir before rejecting, leaving the prior cache
intact."
```

---

## Task 9 — Update artefact API tests for flat shape

**Files:**
- Modify: `tests/artefacts.api.spec.ts`
- Modify: `tests/artefacts-file.api.spec.ts`

- [ ] **Step 1: Rewrite the "Unified npm upload" describe block**

Open `tests/artefacts.api.spec.ts`. Find the `test.describe('Unified npm upload', ...)` block. Replace its tests with:

```typescript
  test.describe('Unified npm upload', () => {
    test.beforeEach(async () => {
      await clean()
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
      uploadApiKey = keyRes.data.key
    })

    test('upload happy path creates an npm artefact with a single tarball', async () => {
      const tarball = await createTestTarball({
        name: '@data-fair/processing-gpkg',
        version: '1.2.3',
        licence: 'MIT'
      })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      form.append('category', 'processing')

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
      expect(typeof res.data.artefact.path).toBe('string')
      expect(typeof res.data.artefact.size).toBe('number')
      expect(res.data.artefact.size).toBeGreaterThan(0)
      expect(res.data.artefact.hasNativeModules).toBe(false)
      expect(res.data.artefact.uploadedBy.apiKeyName).toBe('test-upload')
    })

    test('upload of tarball with .node binary flags hasNativeModules=true', async () => {
      const tarball = await createTestTarball({
        name: '@test/native', version: '1.0.0',
        extraEntries: [{ name: 'package/node_modules/foo/build/Release/foo.node', content: 'BINARY' }]
      })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      const ax = axiosWithApiKey(uploadApiKey)
      const res = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/native@1'),
        form,
        { headers: form.getHeaders() }
      )
      expect(res.data.artefact.hasNativeModules).toBe(true)
    })

    test('re-upload to same id swaps the tarball and bumps dataUpdatedAt', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form1 = new FormData()
      form1.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      const first = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form1,
        { headers: form1.getHeaders() }
      )
      const firstPath = first.data.artefact.path
      const firstDataAt = first.data.artefact.dataUpdatedAt

      await new Promise(resolve => setTimeout(resolve, 10))

      const form2 = new FormData()
      form2.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.1' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      const second = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form2,
        { headers: form2.getHeaders() }
      )
      expect(second.data.artefact.path).not.toBe(firstPath)
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

(Removed: arch-specific tests, defaults-to-noarch test, per-arch update test.)

- [ ] **Step 2: Rewrite the "Unified npm download" describe block**

Replace it with:

```typescript
  test.describe('Unified npm download', () => {
    test.beforeEach(async () => {
      await clean()
      const admin = await superAdmin
      const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
      uploadApiKey = keyRes.data.key

      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form,
        { headers: form.getHeaders() }
      )
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    })

    test('GET /tarball returns the artefact tarball', async () => {
      const admin = await superAdmin
      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/tarball',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect([200, 302]).toContain(res.status)
    })

    test('GET /tarball ignores legacy ?architecture= query', async () => {
      const admin = await superAdmin
      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/tarball?architecture=x64',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect([200, 302]).toContain(res.status)
    })
  })
```

- [ ] **Step 3: Update artefacts-file.api.spec.ts to read `path` instead of `filePath`**

Open `tests/artefacts-file.api.spec.ts`. Search for any reference to `filePath` in expectations and replace with `path`. (If there are none, skip this step.)

```bash
grep -n "filePath" tests/artefacts-file.api.spec.ts
```

For each match, replace `filePath` with `path` in the assertion.

- [ ] **Step 4: Run the API tests**

```bash
npm run test -- tests/artefacts.api.spec.ts tests/artefacts-file.api.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/artefacts.api.spec.ts tests/artefacts-file.api.spec.ts
git commit -m "test(artefacts): align api tests with flat tarball/path shape

Removed per-arch describe blocks; replaced with single-tarball happy
path + hasNativeModules round-trip. ?architecture= legacy query is
verified to be silently ignored."
```

---

## Task 10 — Update lib-node tests for build option

**Files:**
- Modify: `tests/lib-node.api.spec.ts`

- [ ] **Step 1: Update existing tests that pass `architecture`**

Currently the file has tests like `architecture: ''` and uses `uploadNpm(..., architecture)`. Rewrite the helper and existing tests to drop the architecture parameter entirely:

```typescript
const uploadNpm = async (id: string, manifest: { name: string, version: string }) => {
  const ax = axiosWithApiKey(uploadApiKey)
  const tarball = await createTestTarball(manifest)
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  return ax.post('/api/v1/artefacts/npm/' + encodeURIComponent(id), form, { headers: form.getHeaders() })
}
```

In each test that did `architecture: ''` or `architecture: 'x64'` in the `ensureArtefact({...})` call, remove that line.

In each test that called `uploadNpm(..., 'x64')` or similar, drop the second argument.

The "downloads and extracts on first call (noarch)" test becomes:

```typescript
  test('downloads and extracts on first call', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/pkg@1',
      cacheDir
    })
    expect(result.downloaded).toBe(true)
    expect(result.version).toBe('1.0.0')
    const pkg = JSON.parse(await readFile(join(result.path, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('@test/pkg')
  })
```

(Repeat for other tests in the same file — they all need the architecture references dropped.)

- [ ] **Step 2: Add a cache-key-by-runtime test**

After the existing "returns cached result on second call" test, add:

```typescript
  test('cache slot lives under nodeMajor-libc when build:true', async () => {
    const subPkg = JSON.stringify({ name: 'sentinel', version: '1.0.0', scripts: {} })
    const tarball = await createTestTarball({
      name: '@test/cache-key', version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/sentinel/package.json', content: subPkg }]
    })
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/cache-key@1'), form, { headers: form.getHeaders() })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/cache-key@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl, secretKey,
      artefactId: '@test/cache-key@1',
      cacheDir,
      build: true
    })
    // Path looks like <cacheDir>/<artefactId>/<major>-<libc>
    const segments = result.path.split('/').filter(Boolean)
    const slot = segments[segments.length - 1]
    expect(slot).toMatch(/^\d+-(glibc|musl)$/)
  })
```

- [ ] **Step 3: Run the lib-node tests**

```bash
npm run test -- tests/lib-node.api.spec.ts
```

Expected: all pass (existing + new cache-key test + the two from Task 8).

- [ ] **Step 4: Commit**

```bash
git add tests/lib-node.api.spec.ts
git commit -m "test(lib-node): drop architecture param, assert cache key by node-major-libc"
```

---

## Task 11 — Update UI to read `path` and surface `hasNativeModules`

**Files:**
- Modify: `ui/src/pages/artefacts/[id].vue`

- [ ] **Step 1: Read the current UI block to understand the layout**

```bash
sed -n '20,160p' ui/src/pages/artefacts/[id].vue
```

Note: the file references `artefact.filePath`, `artefact.tarballs`, iterates per-arch with `v-for="(entry, arch) in artefact.tarballs"`, and uses `?architecture=` in the download href.

- [ ] **Step 2: Replace the per-arch tarball table with a single-tarball row**

Locate this region (around lines 78-115):
```html
        {{ t('tarballs') }}
        <span class="text-medium-emphasis text-body-2 ml-2">({{ Object.keys(artefact.tarballs ?? {}).length }})</span>
        ...
              v-for="(entry, arch) in artefact.tarballs ?? {}"
              ...
                  :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/tarball?architecture=${arch}`"
```

Replace the whole "tarballs" card section (the surrounding `<v-card>` containing the table) with a simpler single-tarball block:

```html
    <v-card v-if="artefact.format === 'npm' && artefact.path" class="mt-4">
      <v-card-title>
        {{ t('tarball') }}
        <v-chip v-if="artefact.hasNativeModules" color="warning" size="small" class="ml-2">
          {{ t('hasNativeModules') }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <v-table>
          <thead>
            <tr>
              <th>{{ t('size') }}</th>
              <th>{{ t('uploadedAt') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ artefact.size }}</td>
              <td>{{ artefact.dataUpdatedAt }}</td>
              <td>
                <v-btn
                  v-if="hasGrant"
                  icon="mdi-download"
                  variant="text"
                  :href="`${$apiPath}/v1/artefacts/${encodeURIComponent(artefactId)}/tarball`"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
```

- [ ] **Step 3: Update the file-format reference**

Find `v-if="hasGrant && artefact.format === 'file' && artefact.filePath"` and change to:
```html
v-if="hasGrant && artefact.format === 'file' && artefact.path"
```

- [ ] **Step 4: Update i18n strings**

In the same file's i18n block (the bottom YAML/JSON), remove `tarballs`/`architecture` keys and add:

```yaml
en:
  tarball: Tarball
  hasNativeModules: Has native modules
  size: Size
  uploadedAt: Uploaded at
fr:
  tarball: Tarball
  hasNativeModules: Modules natifs
  size: Taille
  uploadedAt: Téléversé le
```

(Keep any keys still used; the i18n block may have other entries.)

- [ ] **Step 5: UI smoke check**

Spec-mandated: dev server is already running per CLAUDE.md (managed by the user). Open the artefacts page in a browser, upload a test tarball (via the API or admin form), and verify the new single-tarball row + the `hasNativeModules` chip render for a tarball that has a `.node` file.

Manual verification only — no automated UI test for this section.

- [ ] **Step 6: Run lint**

```bash
npm run lint-fix
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/artefacts/[id].vue
git commit -m "feat(ui): single-tarball view + hasNativeModules badge

Replaces the per-arch tarballs table with a single row; reads
artefact.path for file format. Adds a warning chip when the npm
artefact's hasNativeModules flag is set."
```

---

## Task 12 — Reusable composite CI action

**Files:**
- Create: `.github/actions/publish-plugin/action.yml`

- [ ] **Step 1: Create the action**

Create `.github/actions/publish-plugin/action.yml`:

```yaml
name: 'Publish plugin to data-fair registry'
description: 'Package the current Node project with its production node_modules and upload it to a data-fair registry as an npm-format artefact.'
inputs:
  registry-url:
    description: 'Base URL of the registry, e.g. https://koumoul.com/registry'
    required: true
  category:
    description: 'Artefact category (processing, catalog, application, ...)'
    required: true
  artefact-id:
    description: 'Override the computed artefact id. Default: <name-with-slashes-as-dashes>-<ref-suffix>'
    required: false
  ref-suffix:
    description: 'Override the suffix appended to the artefact id. Default: major version on tag pushes; branch name on branch pushes.'
    required: false
  api-key:
    description: 'Registry upload API key (pass via ${{ secrets.REGISTRY_API_KEY }})'
    required: true
runs:
  using: 'composite'
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc

    - name: Build artefact with bundled node_modules
      shell: bash
      run: |
        set -euo pipefail
        # 1. Source layer via `npm pack` — respects package.json#files.
        npm pack
        TARBALL=$(ls ./*.tgz)
        # 2. Extract to ./build/package/ (npm tarball's top-level prefix).
        mkdir build
        tar xzf "$TARBALL" -C build
        # 3. `npm pack` excludes package-lock.json; copy it in for a
        # reproducible `npm ci`.
        cp package-lock.json build/package/
        # 4. Install prod deps on the runner. No alpine docker run —
        # the consumer will `npm rebuild` against its own runtime if
        # the registry's detection flags hasNativeModules.
        ( cd build/package && npm ci --omit=dev --omit=optional --no-audit --no-fund )
        # 5. Repack, preserving the `package/` prefix the registry expects.
        tar czf with-deps.tgz -C build package

    - name: Compute artefact id and upload
      shell: bash
      env:
        REGISTRY_URL: ${{ inputs.registry-url }}
        REGISTRY_API_KEY: ${{ inputs.api-key }}
        CATEGORY: ${{ inputs.category }}
        ARTEFACT_ID_OVERRIDE: ${{ inputs.artefact-id }}
        REF_SUFFIX_OVERRIDE: ${{ inputs.ref-suffix }}
      run: |
        set -euo pipefail
        PACKAGE_NAME=$(node -p "require('./package.json').name")
        PACKAGE_VERSION=$(node -p "require('./package.json').version")

        if [ -n "$ARTEFACT_ID_OVERRIDE" ]; then
          ARTEFACT_ID="$ARTEFACT_ID_OVERRIDE"
        else
          if [ -n "$REF_SUFFIX_OVERRIDE" ]; then
            SUFFIX="$REF_SUFFIX_OVERRIDE"
          elif [ "$GITHUB_REF_TYPE" = "tag" ]; then
            # Tag must match package.json version.
            TAG_VERSION="${GITHUB_REF_NAME#v}"
            if [ "$TAG_VERSION" != "$PACKAGE_VERSION" ]; then
              echo "::error::tag $GITHUB_REF_NAME does not match package.json version $PACKAGE_VERSION"
              exit 1
            fi
            SUFFIX=$(echo "$PACKAGE_VERSION" | cut -d. -f1)
          else
            SUFFIX="$GITHUB_REF_NAME"
          fi
          BASE_ID="${PACKAGE_NAME//\//-}"
          ARTEFACT_ID="${BASE_ID}-${SUFFIX}"
        fi

        ENCODED_ID=$(node -p "encodeURIComponent(process.env.ARTEFACT_ID)" ARTEFACT_ID="$ARTEFACT_ID")
        echo "Uploading $ARTEFACT_ID to $REGISTRY_URL"
        curl -sS --fail-with-body -X POST \
          "${REGISTRY_URL}/api/v1/artefacts/npm/${ENCODED_ID}" \
          -H "x-api-key: ${REGISTRY_API_KEY}" \
          -F "category=${CATEGORY}" \
          -F "file=@with-deps.tgz"
```

- [ ] **Step 2: Lint the YAML manually**

The action is committed verbatim and verified by being called from processing-gpkg in the next task. No separate yaml lint step.

- [ ] **Step 3: Commit**

```bash
git add .github/actions/publish-plugin/action.yml
git commit -m "feat(ci): reusable composite action 'publish-plugin'

Packs the current Node project with its production node_modules and
uploads to a data-fair registry. Drops the alpine docker run; the
consumer rebuilds natively if the registry detects native modules."
```

---

## Task 13 — processing-gpkg: switch workflows to composite action

**Repo:** `data-fair/processing-gpkg` (separate working tree at `/home/alban/data-fair/processing-gpkg`)

**Files:**
- Modify: `.github/workflows/publish-main.yml`
- Modify: `.github/workflows/publish.yml`

- [ ] **Step 1: Rewrite publish-main.yml**

Replace `/home/alban/data-fair/processing-gpkg/.github/workflows/publish-main.yml` with:

```yaml
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
    steps:
      - uses: actions/checkout@v4
      - uses: data-fair/registry/.github/actions/publish-plugin@main
        with:
          registry-url: https://staging-koumoul.com/registry
          category: processing
          api-key: ${{ secrets.REGISTRY_API_KEY }}
```

- [ ] **Step 2: Rewrite publish.yml**

Replace `/home/alban/data-fair/processing-gpkg/.github/workflows/publish.yml` with:

```yaml
name: Publish to Registry
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    if: github.ref_type == 'tag' && github.event_name == 'push'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: data-fair/registry/.github/actions/publish-plugin@v0.4.0
        with:
          registry-url: https://koumoul.com/registry
          category: processing
          api-key: ${{ secrets.REGISTRY_API_KEY }}
```

(The tag-vs-version check now lives in the action.)

- [ ] **Step 3: Commit in the processing-gpkg repo**

```bash
cd /home/alban/data-fair/processing-gpkg
git add .github/workflows/publish.yml .github/workflows/publish-main.yml
git commit -m "ci: delegate publish workflows to registry composite action

Drops the inline alpine docker run; the data-fair processings worker
now rebuilds native modules itself after download."
```

Return to the registry repo for subsequent tasks:
```bash
cd /home/alban/data-fair/registry
```

---

## Task 14 — processings: drop architecture from v5.2.0 migration

**Repo:** `data-fair/processings` (separate working tree at `/home/alban/data-fair/processings`)

**Files:**
- Modify: `upgrade/5.2.0/01-publish-plugins-to-registry.ts`

- [ ] **Step 1: Drop the `hostArch` import**

In `/home/alban/data-fair/processings/upgrade/5.2.0/01-publish-plugins-to-registry.ts`, find:

```typescript
import { arch as hostArch } from 'node:process'
```

Delete this line.

- [ ] **Step 2: Update the probe to use the flat path field**

Find this block in `publishToRegistry`:

```typescript
  // Probe: skip if (artefactId, arch) already in registry. The registry
  // stores per-arch tarball slots inside `tarballs` on the artefact doc.
  const probe = await ax.get(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`, {
    validateStatus: s => s === 200 || s === 404
  })
  if (probe.status === 200 && probe.data?.tarballs?.[hostArch]) {
    debug(`${dir}: ${artefactId} (${hostArch}) already published, skipping`)
    return
  }
```

Replace with:

```typescript
  // Probe: skip if the artefact already has a tarball uploaded. The
  // registry uses a single flat `path` per npm artefact.
  const probe = await ax.get(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`, {
    validateStatus: s => s === 200 || s === 404
  })
  if (probe.status === 200 && probe.data?.path) {
    debug(`${dir}: ${artefactId} already published, skipping`)
    return
  }
```

- [ ] **Step 3: Remove the architecture form field**

Find this block in `publishToRegistry`:

```typescript
    const form = new FormData()
    form.append('architecture', hostArch)
    // Backfill the artefact category for legacy plugin tarballs whose
    // package.json predates the `registry.category` convention.
    form.append('category', 'processing')
    form.append('file', new Blob([await readFile(tarballPath)]), 'package.tgz')

    debug(`${dir}: uploading ${name}@${version} as ${artefactId} (${hostArch}) to registry`)
```

Replace with:

```typescript
    const form = new FormData()
    // Backfill the artefact category for legacy plugin tarballs whose
    // package.json predates the `registry.category` convention.
    form.append('category', 'processing')
    form.append('file', new Blob([await readFile(tarballPath)]), 'package.tgz')

    debug(`${dir}: uploading ${name}@${version} as ${artefactId} to registry`)
```

- [ ] **Step 4: Commit in the processings repo**

```bash
cd /home/alban/data-fair/processings
git add upgrade/5.2.0/01-publish-plugins-to-registry.ts
git commit -m "fix(upgrade): drop architecture form field on registry uploads

Registry now stores a single tarball per artefact and detects native
modules itself. Probe checks for artefact.path."
```

---

## Task 15 — processings: pass `build: true` + Dockerfile toolchain

**Repo:** `data-fair/processings`

**Files:**
- Modify: `worker/src/task/task.ts`
- Modify: `api/src/processings/router.ts`
- Modify: `Dockerfile`

- [ ] **Step 1: Pass build:true in worker/src/task/task.ts**

Open `/home/alban/data-fair/processings/worker/src/task/task.ts`. Locate the `ensureArtefact({ ... })` call (around line 101). Add `build: true` to the options object. If the call previously had `architecture: hostArch` (or similar), remove it.

Example (read the actual call first via `sed -n '95,115p' worker/src/task/task.ts`, then edit). Resulting call shape:

```typescript
    ensured = await ensureArtefact({
      registryUrl: config.privateRegistryUrl,
      secretKey: config.secretKeys.registry,
      artefactId: processing.plugin,
      cacheDir: config.dataDir + '/plugins-cache',
      account: { type: processing.owner.type, id: processing.owner.id },
      build: true
    })
```

(Field names will follow whatever is already there; the additions are `build: true` and the removal of any `architecture` key.)

- [ ] **Step 2: Pass build:true in api/src/processings/router.ts**

Same change in `/home/alban/data-fair/processings/api/src/processings/router.ts` around line 53.

- [ ] **Step 3: Add the build toolchain to the runtime stage of the Dockerfile**

Open `/home/alban/data-fair/processings/Dockerfile`. The base is `node:24.11.1-alpine3.22`.

Find the **runtime stage** (the final `FROM ... AS <stagename>` or unnamed `FROM` that produces the image). Add:

```dockerfile
RUN apk add --no-cache python3 make g++
```

If the worker has a separate runtime stage from the API, add to the worker stage. (Verify by reading the file end-to-end: `cat Dockerfile`.)

- [ ] **Step 4: Commit in the processings repo**

```bash
cd /home/alban/data-fair/processings
git add worker/src/task/task.ts api/src/processings/router.ts Dockerfile
git commit -m "feat(consumer): build:true on ensureArtefact + Dockerfile toolchain

Plugins flagged hasNativeModules by the registry now get 'npm rebuild'
on extraction. python3/make/g++ added to the worker image for the few
plugins that need to compile from source."
```

---

## Task 16 — Bump registry version to 0.4.0 and final quality gate

**Files:**
- Modify: `package.json` (registry root, and any workspace package.json that mirrors the root version — check first)

- [ ] **Step 1: Bump version**

Check the current root version:
```bash
node -p "require('./package.json').version"
```

Edit `/home/alban/data-fair/registry/package.json`:

Change `"version": "0.3.1"` to `"version": "0.4.0"`.

If `lib-node/package.json` mirrors the same version, bump it there too.

- [ ] **Step 2: Run the full quality gate**

```bash
npm run quality
```

Expected: lint, type-check, and tests all pass.

- [ ] **Step 3: Commit**

```bash
git add package.json lib-node/package.json
git commit -m "0.4.0"
```

---

## Self-Review

**Spec coverage check** (one task per spec section):
- ✅ Schema changes — Task 1 (npm + file rename) + Task 6 (boot-time mongo rename)
- ✅ Native-module detection — Task 2
- ✅ lib-node build option — Task 7 + Task 8
- ✅ Reusable composite CI action — Task 12
- ✅ processing-gpkg simplification — Task 13
- ✅ processings consumer (call-site + migration + Dockerfile) — Tasks 14 + 15
- ✅ Registry-side downstream adaptation (sync.ts, UI, tests) — Tasks 5, 9, 10, 11
- ✅ Deploy order — Tasks 1–11 land in registry (0.4.0), then Tasks 13–15 land in plugin/consumer repos (any order).

**Placeholder scan:** No "TBD", "implement later" or "similar to Task N" entries; each task carries its actual code.

**Type consistency:** `path: string`, `hasNativeModules: boolean`, `build?: boolean` used uniformly across Tasks 1, 3, 4, 5, 7, 8, 9, 10. The detection helper returns `{ manifest, hasNativeModules }` everywhere it's referenced (Tasks 2, 3).

**Spec-only items that warrant a note rather than a task:**
- The "manual smoke test" of the composite action against staging is described in Task 13 implicitly (the workflow runs on push); no separate task.
- Removal of the boot-time rename in 0.5.0 is captured as a `TODO(0.5.0)` comment in the helper (Task 6 step 1).
