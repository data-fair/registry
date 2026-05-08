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
}

// Default caps protecting against tar bombs and malformed archives.
// Decompressed output is bounded regardless of the compressed input size.
// extractManifest accepts overrides via its opts arg (router wires them
// from config so deployments with chunky pre-installed node_modules can
// raise the entry count and decompressed-size ceilings without patching).
export const MAX_DECOMPRESSED_BYTES = 1024 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
export const MAX_TAR_ENTRIES = 100_000

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

export interface ExtractManifestOpts {
  maxDecompressedBytes?: number
  maxTarEntries?: number
}

export const extractManifest = async (stream: Readable, opts: ExtractManifestOpts = {}): Promise<Manifest> => {
  const maxDecompressedBytes = opts.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES
  const maxTarEntries = opts.maxTarEntries ?? MAX_TAR_ENTRIES
  const extract = tar.extract()
  let manifest: Manifest | null = null
  let manifestError: Error | null = null
  let entryCount = 0

  extract.on('entry', (header, entryStream, next) => {
    entryCount++
    if (entryCount > maxTarEntries) {
      const err = httpError(413, `tarball exceeds ${maxTarEntries} entries`)
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
            category: pkg.registry?.category || 'other'
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
      countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
      createGunzip(),
      countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
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

export const resolveVersionQuery = (
  artefactId: string,
  versionParam: string,
  architecture?: string
): { filter: Filter<Version>, fallbackFilter?: Filter<Version>, sort: Record<string, 1 | -1> } => {
  const sort: Record<string, 1 | -1> = { semverMajor: -1, semverMinor: -1, semverPatch: -1 }
  const baseFilter: Filter<Version> = { artefactId }

  // Check if it's a prerelease request (contains -)
  if (versionParam.includes('-')) {
    // Exact version match for prereleases
    baseFilter.version = versionParam
  } else {
    const parts = versionParam.split('.')
    const asInt = (s: string) => {
      const n = parseInt(s, 10)
      if (!Number.isFinite(n) || String(n) !== s) throw httpError(400, `invalid version selector: ${versionParam}`)
      return n
    }
    if (parts.length === 3) {
      // Exact match: 1.2.3
      baseFilter.version = versionParam
    } else if (parts.length === 2) {
      // Minor-level: 1.2 → latest 1.2.x (stable only)
      baseFilter.semverMajor = asInt(parts[0])
      baseFilter.semverMinor = asInt(parts[1])
      baseFilter.semverPrerelease = { $exists: false }
    } else if (parts.length === 1) {
      // Major-level: 1 → latest 1.x.y (stable only)
      baseFilter.semverMajor = asInt(parts[0])
      baseFilter.semverPrerelease = { $exists: false }
    }
  }

  if (architecture) {
    return {
      filter: { ...baseFilter, architecture },
      // noarch fallback: a tarball uploaded without an architecture serves any arch.
      fallbackFilter: { ...baseFilter, architecture: { $exists: false } },
      sort
    }
  }
  return { filter: baseFilter, sort }
}

/**
 * Retention computation across a full artefact's versions (prereleases
 * excluded by the caller). Returns the docs that should be deleted.
 *
 * Rules:
 *  - For each older major (anything below the latest major present): keep
 *    only the latest version (highest minor.patch). Older patches/minors
 *    of those majors are pruned.
 *  - For the latest major: keep the 2 most recent versions (by minor then
 *    patch).
 *
 * Architecture handling: a "version" in the rules above is a (major, minor,
 * patch) tuple. Every architecture variant of a kept tuple is retained;
 * every architecture variant of a pruned tuple is deleted.
 */
export const computePruneSet = <T extends { semverMajor: number, semverMinor: number, semverPatch: number }>(versions: T[]): T[] => {
  if (versions.length === 0) return []

  const tupleKey = (v: T) => `${v.semverMajor}.${v.semverMinor}.${v.semverPatch}`
  const cmpDesc = (a: T, b: T) =>
    b.semverMajor - a.semverMajor ||
    b.semverMinor - a.semverMinor ||
    b.semverPatch - a.semverPatch

  const sorted = [...versions].sort(cmpDesc)
  const latestMajor = sorted[0].semverMajor

  // Group by major while preserving descending order within each group.
  const byMajor = new Map<number, T[]>()
  for (const v of sorted) {
    const bucket = byMajor.get(v.semverMajor)
    if (bucket) bucket.push(v)
    else byMajor.set(v.semverMajor, [v])
  }

  const kept = new Set<string>()
  for (const [major, vs] of byMajor) {
    // Distinct (minor, patch) tuples within this major, latest first.
    const dedupedTuples = Array.from(new Map(vs.map(v => [tupleKey(v), v])).values())
    const keepCount = major === latestMajor ? 2 : 1
    for (const v of dedupedTuples.slice(0, keepCount)) kept.add(tupleKey(v))
  }

  return versions.filter(v => !kept.has(tupleKey(v)))
}
