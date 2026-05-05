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
  version: string
  cacheDir: string
  /**
   * Architecture to request (e.g. 'arm64', 'x64'). Defaults to the running
   * Node process arch (`process.arch`). Pass an empty string to opt out and
   * leave selection up to the registry (legacy behaviour).
   *
   * Registry resolution semantics: an arch-tagged tarball is preferred; if no
   * tarball matches the requested arch, the registry falls back to a tarball
   * uploaded with no architecture (noarch). If neither exists, the call
   * returns 404.
   */
  architecture?: string
  /**
   * When set, the registry validates that this account has access to the
   * artefact (public OR explicit privateAccess grant). Combined with
   * `secretKey`, this lets internal services act on behalf of an account
   * without bypassing access control.
   */
  account?: Account
}

export interface EnsureArtefactResult {
  path: string
  version: string
  downloaded: boolean
}

interface CacheMeta {
  version: string
  architecture?: string
}

export async function ensureArtefact (opts: EnsureArtefactOpts): Promise<EnsureArtefactResult> {
  const architecture = opts.architecture === undefined ? defaultArch : (opts.architecture || undefined)
  const headers: Record<string, string> = { 'x-secret-key': opts.secretKey }
  if (opts.account) headers['x-account'] = JSON.stringify(opts.account)
  const ax = axiosBuilder({ baseURL: opts.registryUrl, headers })

  const encodedId = encodeURIComponent(opts.artefactId)
  const params = architecture ? { architecture } : undefined
  const versionRes = await ax.get(`/api/v1/artefacts/${encodedId}/versions/${opts.version}`, { params })
  const resolvedVersion: string = versionRes.data.version
  // The registry may have served a noarch fallback if no exact-arch match existed.
  const resolvedArch: string | undefined = versionRes.data.architecture

  const artefactDir = join(opts.cacheDir, opts.artefactId)
  const metaPath = join(artefactDir, '.current-version.json')
  // Cache key includes arch suffix so two pods on different arches don't clobber each other.
  const cacheKey = `${resolvedVersion}${resolvedArch ? '_' + resolvedArch : ''}`
  const extractDir = join(artefactDir, cacheKey)

  // Check cache
  try {
    const raw = await readFile(metaPath, 'utf-8')
    const meta: CacheMeta = JSON.parse(raw)
    if (meta.version === resolvedVersion && (meta.architecture ?? undefined) === resolvedArch) {
      return { path: extractDir, version: resolvedVersion, downloaded: false }
    }
  } catch {
    // no cache or invalid metadata
  }

  // Download tarball — same arch query so the registry serves the same variant we just resolved
  const tarballRes = await ax.get(
    `/api/v1/artefacts/${encodedId}/versions/${resolvedVersion}/tarball`,
    { responseType: 'stream', params }
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
    const oldKey = `${oldMeta.version}${oldMeta.architecture ? '_' + oldMeta.architecture : ''}`
    if (oldKey !== cacheKey) {
      await rm(join(artefactDir, oldKey), { recursive: true, force: true })
    }
  } catch {
    // no old version to clean
  }

  // Write cache metadata
  const meta: CacheMeta = { version: resolvedVersion, ...(resolvedArch ? { architecture: resolvedArch } : {}) }
  await writeFile(metaPath, JSON.stringify(meta))

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
