import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { PassThrough, type Readable } from 'node:stream'
import * as tar from 'tar-stream'
import * as semver from 'semver'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

export interface Manifest {
  name: string
  version: string
  licence?: string
}

// Default caps protecting against tar bombs and malformed archives.
// Decompressed output is bounded regardless of the compressed input size.
// extractManifest accepts overrides via its opts arg (the service layer
// wires them from config so deployments with chunky pre-installed
// node_modules can raise the ceilings without patching).
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
            licence: pkg.licence || pkg.license
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
