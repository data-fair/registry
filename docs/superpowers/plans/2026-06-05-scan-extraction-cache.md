# Scan Extraction Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the vulnerability scanner from re-downloading and re-extracting npm artefacts that haven't changed, by maintaining an on-disk extracted mirror in a configured temp directory.

**Architecture:** A new `tmpDir` config (k8s `emptyDir`) holds `<tmpDir>/scan-cache/<encodeURIComponent(artefactId)>/`, one slot per artefact with a `.meta.json` marker. A config-free `cache.ts` module exposes `ensureExtracted` (reuse when `artefact.path` matches the cached slot, else atomic re-extract via `.tmp.<pid>`→rename) and `pruneExtracted` (drop slots for deleted artefacts, run during `rescanAll`). `runScanNow` reuses the cached dir instead of `mkdtemp`+delete.

**Tech Stack:** Node 24, TypeScript, the existing `api/src/scanning/extract.ts` (node-tar), Playwright unit tests, the `config` npm package (JSON-schema-generated types via `npm run build-types`).

**Reference spec:** `docs/superpowers/specs/2026-06-05-scan-extraction-cache-design.md`

---

## File Structure

**Created:**
- `api/src/scanning/cache.ts` — extracted-mirror cache: `ensureExtracted` + `pruneExtracted`. No `#config`/`filesStorage` imports (deps passed in) so it is unit-testable in-process.
- `tests/scanning-cache.unit.spec.ts` — unit tests for the cache.

**Modified:**
- `api/config/type/schema.json` — add `tmpDir` property.
- `api/config/default.js` — add `tmpDir: undefined`.
- `api/config/custom-environment-variables.js` — add `tmpDir: 'TMP_DIR'`.
- `api/src/config.ts` — export a resolved `tmpDir` constant.
- `api/src/scanning/service.ts` — wire the cache into `runScanNow` (reuse, no delete) and `rescanAll` (prune).
- `AGENTS.md` — one line noting the extraction cache.

---

## Task 1: Add the `tmpDir` config and resolved export

**Files:**
- Modify: `api/config/type/schema.json`
- Modify: `api/config/default.js`
- Modify: `api/config/custom-environment-variables.js`
- Modify: `api/src/config.ts`

- [ ] **Step 1: Add `tmpDir` to the config JSON schema**

In `api/config/type/schema.json`, add this property inside `properties` (e.g. right after the `dataDir` property):
```json
    "tmpDir": {
      "type": "string",
      "description": "Working directory for ephemeral scan extractions (the scan cache lives at <tmpDir>/scan-cache). Defaults to <dataDir>/tmp, or an OS temp dir. Mount as an emptyDir in k8s."
    },
```

- [ ] **Step 2: Add the default**

In `api/config/default.js`, add after the `dataDir: '/data',` line:
```js
  tmpDir: undefined,
```

- [ ] **Step 3: Add the env var binding**

In `api/config/custom-environment-variables.js`, add after the `dataDir: 'DATA_DIR',` line:
```js
  tmpDir: 'TMP_DIR',
```

- [ ] **Step 4: Regenerate config types**

Run: `npm run build-types`
Expected: success; `api/config/type/.type/index.d.ts` now has an optional `tmpDir?: string` on the config type.

- [ ] **Step 5: Export a resolved `tmpDir` from config.ts**

Replace the entire contents of `api/src/config.ts` with:
```ts
import type { ApiConfig } from '../config/type/index.ts'
import { assertValid } from '../config/type/index.ts'
import config from 'config'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

assertValid(config, { lang: 'en', name: 'config', internal: true })

const typedConfig = config as ApiConfig

// Resolved working temp dir (mirrors the processings convention): an explicit
// tmpDir, else <dataDir>/tmp, else an OS temp fallback. The scan cache lives
// under <tmpDir>/scan-cache. Mount tmpDir as an emptyDir in k8s.
export const tmpDir = typedConfig.tmpDir ??
  (typedConfig.dataDir ? join(typedConfig.dataDir, 'tmp') : join(tmpdir(), 'data-fair-registry'))

export default typedConfig
```

- [ ] **Step 6: Verify types compile**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/config api/src/config.ts
git commit -m "feat(config): add tmpDir for the scan extraction cache"
```
Append this trailer to the commit body:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
A git pre-commit hook runs eslint automatically; that's expected.

---

## Task 2: Cache module (`ensureExtracted` + `pruneExtracted`), TDD

**Files:**
- Create: `api/src/scanning/cache.ts`
- Test: `tests/scanning-cache.unit.spec.ts`

This module must NOT import `#config` or `filesStorage` (so the unit test runs in-process without loading full config). All dependencies are passed as arguments.

- [ ] **Step 1: Write the failing test**

Create `tests/scanning-cache.unit.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { Readable } from 'node:stream'
import { mkdtemp, rm, readFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestTarball } from './support/test-tarball.ts'
import { ensureExtracted, pruneExtracted } from '../api/src/scanning/cache.ts'

test.describe('scanning cache', () => {
  test('cold miss extracts + writes meta; same path is a hit (openTarball not re-called)', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'scan-cache-'))
    try {
      const buf = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      let opens = 0
      const openTarball = async () => { opens++; return Readable.from(buf) }
      const ref = { artefactId: '@test/pkg@1', path: 'npm/@test/pkg@1/aaa.tgz', dataUpdatedAt: 'D1' }

      const dir1 = await ensureExtracted(ref, cacheDir, openTarball, 1000)
      expect(opens).toBe(1)
      const top = JSON.parse(await readFile(join(dir1, 'package', 'package.json'), 'utf-8'))
      expect(top.name).toBe('@test/pkg')
      const meta = JSON.parse(await readFile(join(dir1, '.meta.json'), 'utf-8'))
      expect(meta.path).toBe(ref.path)

      const dir2 = await ensureExtracted(ref, cacheDir, openTarball, 1000)
      expect(dir2).toBe(dir1)
      expect(opens).toBe(1) // HIT: tarball not re-opened
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  test('changed path re-extracts the new content', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'scan-cache-'))
    try {
      let opens = 0
      const open1 = async () => { opens++; return Readable.from(await createTestTarball({ name: '@test/pkg', version: '1.0.0' })) }
      const open2 = async () => { opens++; return Readable.from(await createTestTarball({ name: '@test/pkg', version: '2.0.0' })) }
      await ensureExtracted({ artefactId: '@test/pkg@1', path: 'p/aaa.tgz' }, cacheDir, open1, 1000)
      const dir = await ensureExtracted({ artefactId: '@test/pkg@1', path: 'p/bbb.tgz' }, cacheDir, open2, 1000)
      expect(opens).toBe(2)
      const top = JSON.parse(await readFile(join(dir, 'package', 'package.json'), 'utf-8'))
      expect(top.version).toBe('2.0.0')
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  test('pruneExtracted removes stale slots, keeps valid, ignores .tmp. dirs', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'scan-cache-'))
    try {
      const keep = encodeURIComponent('@test/keep@1')
      const stale = encodeURIComponent('@test/stale@1')
      await mkdir(join(cacheDir, keep), { recursive: true })
      await mkdir(join(cacheDir, stale), { recursive: true })
      await mkdir(join(cacheDir, `${keep}.tmp.123`), { recursive: true })

      await pruneExtracted(cacheDir, new Set(['@test/keep@1']))

      const left = await readdir(cacheDir)
      expect(left).toContain(keep)
      expect(left).not.toContain(stale)
      expect(left).toContain(`${keep}.tmp.123`) // in-flight dirs are left alone
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  test('pruneExtracted on a missing cache dir is a no-op', async () => {
    await expect(
      pruneExtracted(join(tmpdir(), 'scan-cache-does-not-exist-xyz'), new Set())
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test tests/scanning-cache.unit.spec.ts`
Expected: FAIL — cannot resolve `../api/src/scanning/cache.ts`. (A trailing "No tests found" line from a non-matching project is benign.)

- [ ] **Step 3: Implement the cache module**

Create `api/src/scanning/cache.ts`:
```ts
import { readFile, writeFile, mkdir, rm, rename, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { extractTarballToDir } from './extract.ts'

export type CacheMeta = { path: string, dataUpdatedAt?: string }
export type ArtefactRef = { artefactId: string, path: string, dataUpdatedAt?: string }
export type OpenTarball = (path: string) => Promise<Readable>

const slotDir = (cacheDir: string, artefactId: string) =>
  join(cacheDir, encodeURIComponent(artefactId))

// Return the extracted directory for an artefact, (re)extracting only when the
// stored bytes differ from the cached slot. Change is detected via the
// artefact's storage `path`, which carries a fresh randomUUID on every upload.
export const ensureExtracted = async (
  ref: ArtefactRef,
  cacheDir: string,
  openTarball: OpenTarball,
  maxEntries: number
): Promise<string> => {
  const extractDir = slotDir(cacheDir, ref.artefactId)
  const metaPath = join(extractDir, '.meta.json')

  // Cache hit: the cached slot was built from the same stored bytes.
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as CacheMeta
    if (meta.path === ref.path) return extractDir
  } catch { /* missing/corrupt meta → treat as a miss */ }

  // Miss/changed: extract into a per-pid temp dir, then atomically swap it in.
  const tmp = `${extractDir}.tmp.${process.pid}`
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  try {
    await extractTarballToDir(await openTarball(ref.path), tmp, { maxEntries })
    const meta: CacheMeta = { path: ref.path, dataUpdatedAt: ref.dataUpdatedAt }
    await writeFile(join(tmp, '.meta.json'), JSON.stringify(meta))
  } catch (err) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
    throw err
  }
  // Drop the stale slot only once the new one is fully built.
  await rm(extractDir, { recursive: true, force: true })
  await rename(tmp, extractDir)
  return extractDir
}

// Remove cache slots whose artefact id is no longer present. Skips in-flight
// `*.tmp.*` extraction dirs (deleting one could break a concurrent
// ensureExtracted; orphans are reclaimed when the emptyDir resets on restart).
export const pruneExtracted = async (cacheDir: string, validIds: Set<string>): Promise<void> => {
  let entries: string[]
  try {
    entries = await readdir(cacheDir)
  } catch {
    return // cache dir doesn't exist yet → nothing to prune
  }
  for (const entry of entries) {
    if (entry.includes('.tmp.')) continue
    let id: string
    try { id = decodeURIComponent(entry) } catch { continue }
    if (!validIds.has(id)) {
      await rm(join(cacheDir, entry), { recursive: true, force: true }).catch(() => {})
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test tests/scanning-cache.unit.spec.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Verify types and lint**

Run: `npm run check-types && npm run lint-fix`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/scanning/cache.ts tests/scanning-cache.unit.spec.ts
git commit -m "feat(scanning): extracted-mirror cache (ensureExtracted + pruneExtracted)"
```
Append this trailer to the commit body:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
A git pre-commit hook runs eslint automatically; that's expected.

---

## Task 3: Wire the cache into the scanning service

**Files:**
- Modify: `api/src/scanning/service.ts`
- Modify: `AGENTS.md`

Context — the current `api/src/scanning/service.ts` head imports:
```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import locks from '@data-fair/lib-node/locks.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import mongo from '#mongo'
import config from '#config'
import { filesStorage } from '../files-storage/index.ts'
import { extractTarballToDir } from './extract.ts'
import { osvScanner, type Scanner } from './runner.ts'
```

- [ ] **Step 1: Update imports and add cache-dir/openTarball helpers**

Replace the import block above with:
```ts
import { join } from 'node:path'
import locks from '@data-fair/lib-node/locks.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import mongo from '#mongo'
import config, { tmpDir } from '#config'
import { filesStorage } from '../files-storage/index.ts'
import { ensureExtracted, pruneExtracted } from './cache.ts'
import { osvScanner, type Scanner } from './runner.ts'
```
(`mkdtemp`, `rm`, `tmpdir`, and `extractTarballToDir` are no longer used here.)

Then, immediately after the `__setScanner` line (`export const __setScanner = (s: Scanner) => { scanner = s }`), add:
```ts
// The extracted-mirror cache lives under the configured temp dir.
const scanCacheDir = join(tmpDir, 'scan-cache')
const openTarball = (path: string) => filesStorage.readStream(path).then(r => r.body)
```

- [ ] **Step 2: Use the cache in `runScanNow` and stop deleting the dir**

In `runScanNow`, replace this block:
```ts
  let dir: string | undefined
  try {
    const artefact = await mongo.artefacts.findOne({ _id: id })
    if (!artefact || artefact.format !== 'npm' || !artefact.path) return

    await setStatus(id, { ...artefact.scan, status: 'running', startedAt: new Date().toISOString() })
    if (opts.refreshDb) await scanner.refreshDb()

    const { body } = await filesStorage.readStream(artefact.path)
    dir = await mkdtemp(join(tmpdir(), 'osv-scan-'))
    await extractTarballToDir(body, dir, { maxEntries: config.maxTarEntries ?? 100000 })

    const result = await scanner.scanDir(dir)
```
with:
```ts
  try {
    const artefact = await mongo.artefacts.findOne({ _id: id })
    if (!artefact || artefact.format !== 'npm' || !artefact.path) return

    await setStatus(id, { ...artefact.scan, status: 'running', startedAt: new Date().toISOString() })
    if (opts.refreshDb) await scanner.refreshDb()

    // Reuse the cached extraction when the stored bytes are unchanged.
    const dir = await ensureExtracted(
      { artefactId: id, path: artefact.path, dataUpdatedAt: artefact.dataUpdatedAt },
      scanCacheDir,
      openTarball,
      config.maxTarEntries ?? 100000
    )

    const result = await scanner.scanDir(dir)
```

Then replace the `finally` block:
```ts
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
    releaseSlot()
    await locks.release(lockId)
  }
```
with (the cached dir is persistent, so it is NOT deleted here):
```ts
  } finally {
    releaseSlot()
    await locks.release(lockId)
  }
```

- [ ] **Step 3: Prune the cache during `rescanAll`**

In `rescanAll`, the current loop is:
```ts
  const ids = await mongo.artefacts.find({ format: 'npm' }, { projection: { _id: 1 } }).toArray()
  for (const { _id } of ids) {
    await runScanNow(_id).catch(err => internalError('scan', err))
  }
```
Insert a prune call between the `find(...)` line and the `for` loop:
```ts
  const ids = await mongo.artefacts.find({ format: 'npm' }, { projection: { _id: 1 } }).toArray()
  // Drop cached extractions for artefacts that no longer exist (runs on every
  // pod, so each self-prunes its own emptyDir).
  await pruneExtracted(scanCacheDir, new Set(ids.map(a => a._id))).catch(err => internalError('scan-prune', err))
  for (const { _id } of ids) {
    await runScanNow(_id).catch(err => internalError('scan', err))
  }
```

- [ ] **Step 4: Verify types and lint**

Run: `npm run check-types && npm run lint-fix`
Expected: both PASS. (If lint flags an unused import, ensure the Step 1 import block was applied exactly — `mkdtemp`/`rm`/`tmpdir`/`extractTarballToDir` must be gone.)

- [ ] **Step 5: Run the full test suite (no regression)**

Run: `npm run test`
Expected: all projects PASS (unit + api + e2e). Scanning is disabled by default in dev, so `runScanNow`/`rescanAll` early-return before touching the cache — the wiring change must not alter any existing behavior. Quote the pass counts.

- [ ] **Step 6: Note the cache in AGENTS.md**

In `AGENTS.md`, in the "## Vulnerability scanning" section, add this bullet to the existing list:
```markdown
- Extracted artefacts are cached as a mirror under `<tmpDir>/scan-cache/` (config `tmpDir`, env `TMP_DIR`; mount as a k8s `emptyDir`). A scan reuses the cached extraction when the artefact's bytes are unchanged (keyed on `artefact.path`); `rescanAll` prunes slots for deleted artefacts.
```

- [ ] **Step 7: Commit**

```bash
git add api/src/scanning/service.ts AGENTS.md
git commit -m "feat(scanning): reuse cached extractions; prune on rescan"
```
Append this trailer to the commit body:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
A git pre-commit hook runs eslint automatically; that's expected.

---

## Self-Review notes (addressed)

- **Spec coverage:** `tmpDir` config + derivation (Task 1); `<tmpDir>/scan-cache` + `ensureExtracted` keyed on `path` + atomic `.tmp.<pid>`→rename + `.meta.json` (Task 2); `pruneExtracted` skipping `.tmp.` dirs and tolerating a missing dir (Task 2); wiring into `runScanNow` (reuse, no delete) and `rescanAll` (prune) (Task 3); `removeExtracted` intentionally absent (per spec). Unit tests for hit/miss/prune/missing-dir (Task 2); regression suite (Task 3).
- **Type consistency:** `ArtefactRef`/`OpenTarball`/`CacheMeta` defined in Task 2 and consumed unchanged in Task 3; `ensureExtracted(ref, cacheDir, openTarball, maxEntries)` and `pruneExtracted(cacheDir, validIds)` signatures match between definition, tests, and the service wiring; the resolved `tmpDir` export (Task 1) is the named import used in Task 3.
- **No placeholders:** every code step shows complete code; commands have expected output.
- **Known low-risk note:** the live cache-hit path (two real scans reusing one extraction) only runs when `scanning.enabled` is true, so it is exercised by the base feature's manual e2e (Task 11), not by the default-disabled api suite; Task 2's unit tests cover the cache logic directly.
