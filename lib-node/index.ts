import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import * as tar from 'tar-stream'
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

async function extractTarball (stream: Readable, destDir: string): Promise<void> {
  const extract = tar.extract()

  const entries: Promise<void>[] = []

  extract.on('entry', (header, entryStream, next) => {
    // npm tarballs prefix entries with "package/"
    const entryPath = header.name.replace(/^package\//, '')

    if (header.type === 'directory') {
      entries.push(mkdir(join(destDir, entryPath), { recursive: true }).then(() => {}))
      entryStream.resume()
      entryStream.on('end', next)
    } else if (header.type === 'file') {
      const fullPath = join(destDir, entryPath)
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
