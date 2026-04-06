import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import * as tar from 'tar-stream'
import * as semver from 'semver'
import type { Filter } from 'mongodb'
import type { Version } from '#types/version/index.ts'

export interface Manifest {
  name: string
  version: string
  licence?: string
  category?: string
  processingConfigSchema?: Record<string, unknown>
  applicationConfigSchema?: Record<string, unknown>
}

export const extractManifest = async (stream: Readable): Promise<Manifest> => {
  const extract = tar.extract()
  let manifest: Manifest | null = null

  extract.on('entry', (header, entryStream, next) => {
    // npm tarballs have contents under package/ prefix
    if (header.name === 'package.json' || header.name.endsWith('/package.json')) {
      const chunks: Buffer[] = []
      entryStream.on('data', (chunk: Buffer) => chunks.push(chunk))
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
        } catch {
          // skip invalid JSON
        }
        next()
      })
    } else {
      entryStream.on('end', next)
      entryStream.resume()
    }
  })

  await pipeline(stream, createGunzip(), extract)

  if (!manifest) throw new Error('package.json not found in tarball')
  const result = manifest as Manifest
  if (!result.name) throw new Error('missing name in package.json')
  if (!result.version) throw new Error('missing version in package.json')
  if (!semver.valid(result.version)) throw new Error(`invalid semver: ${result.version}`)

  return result
}

export const parseSemver = (version: string) => {
  const parsed = semver.parse(version)
  if (!parsed) throw new Error(`invalid semver: ${version}`)
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
  if (parts.length === 3) {
    // Exact match: 1.2.3
    filter.version = versionParam
  } else if (parts.length === 2) {
    // Minor-level: 1.2 → latest 1.2.x (stable only)
    filter.semverMajor = parseInt(parts[0])
    filter.semverMinor = parseInt(parts[1])
    filter.semverPrerelease = { $exists: false }
  } else if (parts.length === 1) {
    // Major-level: 1 → latest 1.x.y (stable only)
    filter.semverMajor = parseInt(parts[0])
    filter.semverPrerelease = { $exists: false }
  }

  return { filter, sort }
}
