import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rm, rename, stat, utimes, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import * as tar from 'tar-stream'
import resolvePath from 'resolve-path'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import type { Readable } from 'node:stream'

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
  account?: Account
  /**
   * When true and the artefact's `hasNativeModules` is true, run `npm rebuild`
   * against the extracted node_modules. No-op when the artefact has no
   * native modules. The cache key incorporates Node major + libc, so a
   * runtime upgrade naturally invalidates the cache and forces a rebuild.
   */
  build?: boolean
}

export interface EnsureArtefactResult {
  path: string
  /** Manifest-extracted version from the artefact doc; display-only. */
  version: string
  /** `dataUpdatedAt` of the artefact doc when this download happened. */
  dataUpdatedAt: string
  downloaded: boolean
}

// Stable per-buildTuple pointer file. It survives across versions and drives
// the conditional GET; its `dir` points at the version-keyed extraction dir
// (relative to artefactDir) currently in use for this buildTuple.
interface CachePointer {
  dataUpdatedAt: string
  version: string
  /** `<version>+<hash>/<buildTuple>`, relative to the artefact dir. */
  dir: string
}

// Filesystem-safe discriminator: dataUpdatedAt as an epoch-SECONDS integer.
// Second precision is deliberate — it matches the conditional-GET criterion
// exactly: both the registry's If-Modified-Since check and the Last-Modified
// header it derives from work at `Math.floor(getTime() / 1000)`. Keying the
// path on the same granularity guarantees two dataUpdatedAt values the server
// treats as identical (→ 304) map to the same dir, and any value it treats as
// changed (→ 200) maps to a new one. (The raw ISO string can't be used
// directly: colons are invalid path chars on some filesystems.)
const discriminator = (dataUpdatedAt: string): string =>
  String(Math.floor(new Date(dataUpdatedAt).getTime() / 1000))

// Top-level version-dir segment (`<version>+<epochSeconds>`) of a relative pointer dir.
const versionDirOf = (relDir: string): string => relDir.split(/[\\/]/)[0]

// Remove version dirs no longer referenced by any buildTuple pointer. Lazy and
// best-effort: anything already imported lives in memory, so dropping its
// on-disk dir is safe; an old dir held by a concurrent in-flight run is the
// only edge, hence we swallow errors rather than fail the call.
const pruneOldVersionDirs = async (artefactDir: string): Promise<void> => {
  let entries
  try {
    entries = await readdir(artefactDir, { withFileTypes: true })
  } catch {
    return
  }
  const keep = new Set<string>()
  for (const e of entries) {
    if (e.isFile() && e.name.startsWith('.pointer-') && e.name.endsWith('.json')) {
      try {
        const p = JSON.parse(await readFile(join(artefactDir, e.name), 'utf-8')) as Partial<CachePointer>
        if (typeof p.dir === 'string') keep.add(versionDirOf(p.dir))
      } catch { /* ignore unreadable pointer */ }
    }
  }
  for (const e of entries) {
    if (!e.isDirectory() || keep.has(e.name)) continue
    await rm(join(artefactDir, e.name), { recursive: true, force: true }).catch(() => {})
  }
}

export async function ensureArtefact (opts: EnsureArtefactOpts): Promise<EnsureArtefactResult> {
  const headers: Record<string, string> = { 'x-secret-key': opts.secretKey }
  if (opts.account) headers['x-account'] = JSON.stringify(opts.account)
  const ax = axiosBuilder({ baseURL: opts.registryUrl, headers })

  const encodedId = encodeURIComponent(opts.artefactId)
  const artefactDir = join(opts.cacheDir, opts.artefactId)
  const buildTuple = opts.build ? `${nodeMajor()}-${detectLibc()}` : 'js'
  const pointerPath = join(artefactDir, `.pointer-${buildTuple}.json`)

  // Read the existing pointer (if any) to drive the conditional GET. A missing
  // or legacy cache is treated as cold — the server returns 200, we extract to
  // a fresh version dir, and the new pointer supersedes whatever was there.
  let pointer: CachePointer | null = null
  try {
    const raw = await readFile(pointerPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<CachePointer>
    if (parsed.dataUpdatedAt && parsed.version !== undefined && parsed.dir) {
      pointer = parsed as CachePointer
    }
  } catch {
    // cold cache or invalid/legacy metadata
  }

  const reqHeaders: Record<string, string> = {}
  if (pointer) {
    reqHeaders['if-modified-since'] = new Date(pointer.dataUpdatedAt).toUTCString()
  }

  const res = await ax.get(`/api/v1/artefacts/${encodedId}/download`, {
    responseType: 'stream',
    headers: reqHeaders,
    validateStatus: s => s === 200 || s === 304
  })

  if (res.status === 304) {
    ;(res.data as Readable).destroy()
    return {
      path: join(artefactDir, pointer!.dir),
      version: pointer!.version,
      dataUpdatedAt: pointer!.dataUpdatedAt,
      downloaded: false
    }
  }

  // 200 — read fresh metadata from response headers.
  const version = String(res.headers['x-artefact-version'] ?? '')
  const hasNativeModules = res.headers['x-artefact-has-native-modules'] === 'true'
  const lastModified = res.headers['last-modified']
  const dataUpdatedAt = lastModified
    ? new Date(lastModified).toISOString()
    : new Date().toISOString()

  // Extract into a content-versioned dir so a changed artefact resolves to a
  // brand-new absolute path — forcing Node's ESM module registry to reload the
  // entire graph (entry + siblings + bundled deps), not just the query-busted
  // entry. `version` is kept in the name for readability only; the seconds
  // suffix is what guarantees uniqueness (version can repeat or be empty).
  const relDir = join(`${version || '0.0.0'}+${discriminator(dataUpdatedAt)}`, buildTuple)
  const extractDir = join(artefactDir, relDir)

  const tmpDir = `${extractDir}.tmp.${process.pid}`
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  try {
    await extractTarball(res.data as Readable, tmpDir)
    if (opts.build && hasNativeModules) {
      await rebuildNativeModules(tmpDir)
    }
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true })
    throw err
  }
  await rm(extractDir, { recursive: true, force: true })
  await rename(tmpDir, extractDir)

  // Atomically repoint the stable pointer at the new dir, then prune the dirs
  // no pointer references anymore.
  const tmpPointer = `${pointerPath}.tmp.${process.pid}`
  await writeFile(tmpPointer, JSON.stringify({ dataUpdatedAt, version, dir: relDir } satisfies CachePointer))
  await rename(tmpPointer, pointerPath)
  await pruneOldVersionDirs(artefactDir)

  return { path: extractDir, version, dataUpdatedAt, downloaded: true }
}

export interface EnsureArtefactFileOpts {
  registryUrl: string
  secretKey: string
  artefactId: string
  cacheDir: string
  /** defaults to artefactId */
  fileName?: string
}

export interface EnsureArtefactFileResult {
  path: string
  downloaded: boolean
}

export async function ensureArtefactFile (opts: EnsureArtefactFileOpts): Promise<EnsureArtefactFileResult> {
  const ax = axiosBuilder({
    baseURL: opts.registryUrl,
    headers: { 'x-secret-key': opts.secretKey }
  })

  const destPath = join(opts.cacheDir, opts.fileName ?? opts.artefactId)

  let prevMtime: Date | undefined
  try {
    const st = await stat(destPath)
    prevMtime = st.mtime
  } catch { /* cold cache */ }

  const headers: Record<string, string> = {}
  if (prevMtime) headers['if-modified-since'] = prevMtime.toUTCString()

  const res = await ax.get(
    `/api/v1/artefacts/${encodeURIComponent(opts.artefactId)}/download`,
    { responseType: 'stream', headers, validateStatus: s => s === 200 || s === 304 }
  )

  if (res.status === 304) {
    ;(res.data as Readable).destroy()
    return { path: destPath, downloaded: false }
  }

  await mkdir(dirname(destPath), { recursive: true })
  const tmpPath = `${destPath}.tmp.${process.pid}`
  await rm(tmpPath, { force: true })
  try {
    await pipeline(res.data as Readable, createWriteStream(tmpPath))
  } catch (err) {
    await rm(tmpPath, { force: true })
    throw err
  }
  await rename(tmpPath, destPath)

  const lastModified = res.headers['last-modified']
  if (lastModified) {
    const mtime = new Date(lastModified)
    if (!isNaN(mtime.getTime())) {
      await utimes(destPath, new Date(), mtime)
    }
  }

  return { path: destPath, downloaded: true }
}

const rebuildNativeModules = (dir: string): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn('npm', ['rebuild'], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_proxy: '',
      npm_config_https_proxy: '',
      NODE_AUTH_TOKEN: ''
    }
  })
  const stderrChunks: Buffer[] = []
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
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

export async function extractTarball (stream: Readable, destDir: string): Promise<void> {
  const extract = tar.extract()

  const entries: Promise<void>[] = []

  extract.on('entry', (header, entryStream, next) => {
    // npm tarballs prefix entries with "package/"
    const entryPath = header.name.replace(/^package\//, '')

    if (header.type === 'directory') {
      entries.push(mkdir(resolvePath(destDir, entryPath), { recursive: true }).then(() => {}))
      entryStream.resume()
      entryStream.on('end', next)
    } else if (header.type === 'file') {
      const fullPath = resolvePath(destDir, entryPath)
      const p = mkdir(dirname(fullPath), { recursive: true }).then(() => {
        return new Promise<void>((resolve, reject) => {
          const ws = createWriteStream(fullPath)
          entryStream.pipe(ws)
          ws.on('finish', resolve)
          ws.on('error', reject)
        })
      })
      entries.push(p)
      entryStream.on('end', next)
    } else {
      entryStream.resume()
      entryStream.on('end', next)
    }
  })

  await pipeline(stream, createGunzip(), extract)
  await Promise.all(entries)
}
