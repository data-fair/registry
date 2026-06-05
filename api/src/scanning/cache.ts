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

// Matches the `.tmp.<pid>` suffix that ensureExtracted appends to a slot name.
// Anchored to a trailing numeric pid so it can't be confused with a slot whose
// (encoded) id merely contains ".tmp." somewhere in the middle.
const TMP_DIR_SUFFIX = /\.tmp\.\d+$/

// Remove cache slots whose artefact id is no longer present. Skips in-flight
// `.tmp.<pid>` extraction dirs (deleting one could break a concurrent
// ensureExtracted; orphans are reclaimed when the emptyDir resets on restart).
export const pruneExtracted = async (cacheDir: string, validIds: Set<string>): Promise<void> => {
  let entries: string[]
  try {
    entries = await readdir(cacheDir)
  } catch {
    return // cache dir doesn't exist yet → nothing to prune
  }
  for (const entry of entries) {
    if (TMP_DIR_SUFFIX.test(entry)) continue
    let id: string
    try { id = decodeURIComponent(entry) } catch { continue }
    if (!validIds.has(id)) {
      await rm(join(cacheDir, entry), { recursive: true, force: true }).catch(() => {})
    }
  }
}
