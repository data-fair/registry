import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rm, rename, stat, utimes } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import * as tar from 'tar-stream'
import resolvePath from 'resolve-path'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import type { Readable } from 'node:stream'

export interface EnsureArtefactOpts {
  registryUrl: string
  secretKey: string
  artefactId: string
  version: string
  cacheDir: string
}

export interface EnsureArtefactResult {
  path: string
  version: string
  downloaded: boolean
}

interface CacheMeta {
  version: string
}

export async function ensureArtefact (opts: EnsureArtefactOpts): Promise<EnsureArtefactResult> {
  const ax = axiosBuilder({
    baseURL: opts.registryUrl,
    headers: { 'x-secret-key': opts.secretKey }
  })

  const encodedId = encodeURIComponent(opts.artefactId)
  const versionRes = await ax.get(`/api/v1/artefacts/${encodedId}/versions/${opts.version}`)
  const resolvedVersion: string = versionRes.data.version

  const artefactDir = join(opts.cacheDir, opts.artefactId)
  const metaPath = join(artefactDir, '.current-version.json')
  const extractDir = join(artefactDir, resolvedVersion)

  // Check cache
  try {
    const raw = await readFile(metaPath, 'utf-8')
    const meta: CacheMeta = JSON.parse(raw)
    if (meta.version === resolvedVersion) {
      return { path: extractDir, version: resolvedVersion, downloaded: false }
    }
  } catch {
    // no cache or invalid metadata
  }

  // Download tarball
  const tarballRes = await ax.get(
    `/api/v1/artefacts/${encodedId}/versions/${resolvedVersion}/tarball`,
    { responseType: 'stream' }
  )

  // Extract to temp dir then atomic rename
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

  // Clean up old version
  try {
    const raw = await readFile(metaPath, 'utf-8')
    const oldMeta: CacheMeta = JSON.parse(raw)
    if (oldMeta.version !== resolvedVersion) {
      await rm(join(artefactDir, oldMeta.version), { recursive: true, force: true })
    }
  } catch {
    // no old version to clean
  }

  // Write cache metadata
  await writeFile(metaPath, JSON.stringify({ version: resolvedVersion } satisfies CacheMeta))

  return { path: extractDir, version: resolvedVersion, downloaded: true }
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
