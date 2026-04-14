import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { PassThrough, type Readable } from 'node:stream'
import * as tar from 'tar-stream'
import * as semver from 'semver'
import type { Filter } from 'mongodb'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { Version } from '#types/version/index.ts'

export interface Manifest {
  name: string
  version: string
  licence?: string
  category?: string
  processingConfigSchema?: Record<string, unknown>
  applicationConfigSchema?: Record<string, unknown>
}

// Hard caps protecting against tar bombs and malformed archives.
// Decompressed output is bounded regardless of the compressed input size.
export const MAX_DECOMPRESSED_BYTES = 200 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
export const MAX_TAR_ENTRIES = 10_000

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

export const extractManifest = async (stream: Readable): Promise<Manifest> => {
  const extract = tar.extract()
  let manifest: Manifest | null = null
  let manifestError: Error | null = null
  let entryCount = 0

  extract.on('entry', (header, entryStream, next) => {
    entryCount++
    if (entryCount > MAX_TAR_ENTRIES) {
      const err = httpError(413, `tarball exceeds ${MAX_TAR_ENTRIES} entries`)
      entryStream.on('end', () => next(err))
      entryStream.resume()
      return
    }
    // npm tarballs always put package.json at `package/package.json`.
    // Accept only that exact path to avoid attacker-controlled overrides
    // from deeper entries clobbering the real manifest.
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
            category: pkg.registry?.category || 'other',
            processingConfigSchema: pkg.registry?.processingConfigSchema,
            applicationConfigSchema: pkg.registry?.applicationConfigSchema
          }
          // Abort the pipeline early; we've got what we need and don't want
          // to keep processing a potentially malicious tarball.
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
      countingPassthrough(MAX_DECOMPRESSED_BYTES, 'decompressed tarball'),
      createGunzip(),
      countingPassthrough(MAX_DECOMPRESSED_BYTES, 'decompressed tarball'),
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

export const parseSemver = (version: string) => {
  const parsed = semver.parse(version)
  if (!parsed) throw httpError(400, `invalid semver: ${version}`)
  return {
    semverMajor: parsed.major,
    semverMinor: parsed.minor,
    semverPatch: parsed.patch,
    semverPrerelease: parsed.prerelease.length > 0 ? parsed.prerelease.join('.') : undefined
  }
}

export const resolveVersionQuery = (artefactId: string, versionParam: string): { filter: Filter<Version>, sort: Record<string, 1 | -1> } => {
  const sort: Record<string, 1 | -1> = { semverMajor: -1, semverMinor: -1, semverPatch: -1 }
  const filter: Filter<Version> = { artefactId }

  // Check if it's a prerelease request (contains -)
  if (versionParam.includes('-')) {
    // Exact version match for prereleases
    filter.version = versionParam
    return { filter, sort }
  }

  const parts = versionParam.split('.')
  const asInt = (s: string) => {
    const n = parseInt(s, 10)
    if (!Number.isFinite(n) || String(n) !== s) throw httpError(400, `invalid version selector: ${versionParam}`)
    return n
  }
  if (parts.length === 3) {
    // Exact match: 1.2.3
    filter.version = versionParam
  } else if (parts.length === 2) {
    // Minor-level: 1.2 → latest 1.2.x (stable only)
    filter.semverMajor = asInt(parts[0])
    filter.semverMinor = asInt(parts[1])
    filter.semverPrerelease = { $exists: false }
  } else if (parts.length === 1) {
    // Major-level: 1 → latest 1.x.y (stable only)
    filter.semverMajor = asInt(parts[0])
    filter.semverPrerelease = { $exists: false }
  }

  return { filter, sort }
}

/**
 * 2-deep retention computation: given a sorted list of versions for a
 * minor branch (descending by semverPatch), return the subset whose docs
 * should be deleted. Keeps the 2 most recent *distinct* patch values;
 * all arch variants for a kept patch are retained, all variants for a
 * pruned patch are deleted.
 */
export const computePruneSet = <T extends { semverPatch: number }>(versions: T[]): T[] => {
  const distinctPatches: number[] = []
  for (const v of versions) {
    if (!distinctPatches.includes(v.semverPatch)) distinctPatches.push(v.semverPatch)
  }
  if (distinctPatches.length <= 2) return []
  const patchesToDelete = new Set(distinctPatches.slice(2))
  return versions.filter(v => patchesToDelete.has(v.semverPatch))
}
