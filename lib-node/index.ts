import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rm, rename, stat, utimes } from 'node:fs/promises'
import { join, dirname } from 'node:path'
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

interface CacheMeta {
  dataUpdatedAt: string
}

export async function ensureArtefact (opts: EnsureArtefactOpts): Promise<EnsureArtefactResult> {
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
  const buildTuple = opts.build ? `${nodeMajor()}-${detectLibc()}` : 'js'
  const extractDir = join(artefactDir, buildTuple)
  const metaPath = join(extractDir, '.meta.json')

  try {
    const raw = await readFile(metaPath, 'utf-8')
    const meta: CacheMeta = JSON.parse(raw)
    if (meta.dataUpdatedAt === dataUpdatedAt) {
      return { path: extractDir, version, dataUpdatedAt, downloaded: false }
    }
  } catch {
    // cold cache or invalid metadata
  }

  const tarballRes = await ax.get(`/api/v1/artefacts/${encodedId}/tarball`, {
    responseType: 'stream'
  })

  const tmpDir = `${extractDir}.tmp.${process.pid}`
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  try {
    await extractTarball(tarballRes.data as Readable, tmpDir)
    // Write meta inside tmpDir so it survives the rename atomically.
    await writeFile(join(tmpDir, '.meta.json'), JSON.stringify({ dataUpdatedAt } satisfies CacheMeta))
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true })
    throw err
  }
  await rm(extractDir, { recursive: true, force: true })
  await rename(tmpDir, extractDir)

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
