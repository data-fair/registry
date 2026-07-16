# Scan extraction cache — design

Date: 2026-06-05
Status: approved for planning
Builds on: `docs/superpowers/specs/2026-06-04-npm-vulnerability-scanning-design.md`

## Goal

Optimize the vulnerability scanner so it stops re-downloading and re-extracting
artefacts that haven't changed. Maintain an on-disk **extracted mirror** of npm
artefacts in a configured temp directory; on each scan, reuse the existing
extraction when the artefact's bytes are unchanged, and only re-extract when it
changed.

Modeled on the `processings` service's plugin cache (which uses
`@data-fair/lib-node-registry`'s `ensureArtefact`): a `tmpDir`-rooted cache,
one slot per artefact, a `.meta.json` change-detection marker, and an atomic
`.tmp.<pid>` → rename swap.

## Why

The periodic rescan (`rescanAll`) re-scans **every** npm artefact, because the
*reason* to rescan is that the OSV vulnerability DB advanced — not that the
artefact changed. Today each rescan re-runs `filesStorage.readStream` +
tar-extraction for every artefact into a fresh `mkdtemp`, then deletes it. For
the S3 backend that is a full re-download per artefact per cycle; for large
bundled `node_modules` the extraction itself is non-trivial. Caching the
extraction removes that redundant work.

**What the cache does NOT save:** the osv-scanner subprocess still runs on every
scan (it must, to match against the freshened DB). The cache only removes the
download + extraction when the artefact is byte-for-byte unchanged.

## Scope

### In scope
- A configured `tmpDir` (k8s `emptyDir`) and a derived `<tmpDir>/scan-cache/`.
- An extracted-mirror cache: one slot per artefact, reused when unchanged.
- `pruneExtracted` to drop slots for artefacts no longer present, run during
  `rescanAll`.
- Wiring the cache into `runScanNow` (reuse instead of mkdtemp+delete).

### Out of scope
- `removeExtracted` on artefact delete. Rejected: it would only clear the cache
  on the pod that handled the delete; other pods (each with their own
  `emptyDir`) would keep a stale slot. `pruneExtracted` runs inside `rescanAll`
  on every pod and covers deletions uniformly on the next cycle.
- Any in-code size cap / LRU eviction. Disk is bounded by the catalog's
  extracted size and reset by `emptyDir` on pod restart, consistent with
  processings. (k8s `emptyDir.sizeLimit` is the operator's lever.)
- Caching the osv-scanner result itself, or skipping the scan for unchanged
  artefacts (the DB changes, so scans must re-run).
- Moving the osv DB (`scanning.dbDir`) or the refresh dummy dir under `tmpDir`.

## Change-detection key

Key on the artefact's **`path`**. `commitNpmUpload` always writes a fresh
`npm/<id>/<randomUUID>.tgz` path on every upload, so `path` changes if and only
if the stored bytes changed — with no second-precision aliasing risk that a
timestamp would carry. `.meta.json` stores `{ path, dataUpdatedAt }` (the latter
for readability/debugging); the freshness comparison is on `path`.

## Config

Add a top-level optional **`tmpDir`** (mirrors processings):
- Schema: `"tmpDir": { "type": "string" }` in `api/config/type/schema.json`.
- Env binding: `TMP_DIR` in `custom-environment-variables.js`.
- `default.js`: `tmpDir: undefined`.
- Derivation (code, since the default depends on `dataDir`): export a resolved
  `tmpDir` from `api/src/config.ts`:
  `config.tmpDir ?? (config.dataDir ? join(config.dataDir, 'tmp') : join(os.tmpdir(), 'data-fair-registry'))`.
- The scan cache directory is `join(<resolved tmpDir>, 'scan-cache')`.

In k8s, mount `tmpDir` as an `emptyDir` volume.

## Module: `api/src/scanning/cache.ts`

Deliberately free of `#config` and `filesStorage` imports so it is
unit-testable in-process without loading/validating full config (the existing
unit specs avoid `#config`). All dependencies are passed in.

```ts
export type CacheMeta = { path: string, dataUpdatedAt?: string }
export type ArtefactRef = { artefactId: string, path: string, dataUpdatedAt?: string }
export type OpenTarball = (path: string) => Promise<Readable>

// Returns the extracted directory for the artefact, (re)extracting only when
// the stored bytes (artefact.path) differ from the cached slot.
export const ensureExtracted = async (
  ref: ArtefactRef,
  cacheDir: string,
  openTarball: OpenTarball,
  maxEntries: number
): Promise<string>

// Remove cache slots whose artefact id is not in validIds.
export const pruneExtracted = async (
  cacheDir: string,
  validIds: Set<string>
): Promise<void>
```

`ensureExtracted` behavior:
- `extractDir = join(cacheDir, encodeURIComponent(ref.artefactId))`
  (`encodeURIComponent` turns an npm id like `@scope/name@1` into a safe single
  path segment).
- Read `<extractDir>/.meta.json`. If it parses and `meta.path === ref.path` →
  **hit**: return `extractDir` without any read or extraction.
- Otherwise **miss/changed**:
  1. `tmp = ${extractDir}.tmp.${process.pid}`; `rm -rf tmp`; `mkdir -p tmp`.
  2. `await extractTarballToDir(await openTarball(ref.path), tmp, { maxEntries })`
     (reuses the existing `extract.ts`).
  3. Write `<tmp>/.meta.json` = `{ path: ref.path, dataUpdatedAt: ref.dataUpdatedAt }`.
  4. `rm -rf extractDir`; `rename(tmp, extractDir)`.
  5. Return `extractDir`.
  - On any failure: `rm -rf tmp` and rethrow. The previous `extractDir` (if any)
    is only removed immediately before the rename, so a failed re-extraction
    leaves the prior good slot intact, and the next scan retries (its
    `meta.path` won't match the new `ref.path`).

`pruneExtracted` behavior:
- `readdir(cacheDir)` (tolerate ENOENT → no-op). For each entry:
  - **Skip** any entry containing `.tmp.` — these are in-flight (or orphaned)
    extraction dirs; deleting one could break a concurrent `ensureExtracted`
    (the per-artefact lock does not serialize across *different* artefacts), and
    its decoded name would never match a real id anyway. Orphaned tmp dirs from
    a crashed extraction are reclaimed on pod restart (`emptyDir`).
  - Otherwise, if `decodeURIComponent(entry)` is not in `validIds`, `rm -rf` it.
- Best-effort: log and continue on individual failures.

`encodeURIComponent`/`decodeURIComponent` are inverse, so prune's membership
test round-trips cleanly against the artefact ids.

## Wiring: `api/src/scanning/service.ts`

- Compute the cache dir once: `import { tmpDir } from '#config'` (the resolved
  export) → `const scanCacheDir = join(tmpDir, 'scan-cache')`. Define an
  `openTarball` adapter: `(path) => filesStorage.readStream(path).then(r => r.body)`.
- `runScanNow`: replace the `mkdtemp` + `readStream` + `extractTarballToDir`
  block with:
  `const dir = await ensureExtracted({ artefactId: id, path: artefact.path, dataUpdatedAt: artefact.dataUpdatedAt }, scanCacheDir, openTarball, config.maxTarEntries ?? 100000)`.
  Then `await scanner.scanDir(dir)` as before.
  - **Remove** the `finally` `rm(dir, …)` — `dir` is the persistent cache slot,
    not a throwaway. `finally` now only `releaseSlot()` + `locks.release()`.
  - osv-scanner scans `dir` (the `.meta.json` sibling of `package/` is ignored
    by the package.json extractor); `hasInstallScripts` still reads
    `dir/package/package.json`.
- `rescanAll`: after listing npm ids, before the scan loop, call
  `await pruneExtracted(scanCacheDir, new Set(ids))` (best-effort; wrap so a
  prune failure doesn't abort the rescan).

## Safety / concurrency

- The existing per-artefact distributed lock (`scan-${id}`) serializes scans of
  the same artefact within a pod; the `.tmp.<pid>` atomic rename guards against
  partial/observed-mid-extraction state.
- `emptyDir` is per-pod, so different pods never share a cache directory — no
  cross-pod write races on the same slot.
- One slot per artefact id, overwritten on change, so re-uploads don't
  accumulate slots; `pruneExtracted` reclaims slots for deleted artefacts.

## Error handling

- Extraction/openTarball failure → `ensureExtracted` cleans its `.tmp.<pid>` and
  throws; `runScanNow`'s existing `catch` records `scan.status = 'error'`. Prior
  good slot (if any) remains for the next attempt.
- Corrupt/unreadable `.meta.json` → treated as a miss (re-extract).
- `pruneExtracted` failures are logged and swallowed; never fail a rescan.

## Testing

- **Unit** `tests/scanning-cache.unit.spec.ts` (in-process; no `#config`):
  - cold miss extracts and writes `.meta.json` (assert `package/package.json`
    present on disk);
  - second `ensureExtracted` with the same `path` is a **hit** — `openTarball`
    is NOT called (assert via a call-count spy);
  - a changed `path` re-extracts (spy called again; new content present);
  - `pruneExtracted` removes slots not in `validIds`, keeps valid ones, and
    leaves `*.tmp.*` dirs untouched;
  - uses a temp `cacheDir` (`mkdtemp`) and a fake `openTarball` built from
    `createTestTarball`.
- **Regression**: existing unit + api + e2e suites stay green. (API behavior is
  unchanged; the cache is an internal optimization.)
- The full live path (cache hit across two real scans) is covered by the
  existing manual e2e (Task 11 of the base feature) once scanning is enabled.

## Open follow-ups (not blocking)
- Optional `emptyDir.sizeLimit` guidance in deployment docs.
- If a catalog ever outgrows node ephemeral storage, revisit an in-code LRU cap.
