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

export interface ExtractManifestResult {
  manifest: Manifest
  hasNativeModules: boolean
}

// Default caps protecting against tar bombs and malformed archives.
// Decompressed output is bounded regardless of the compressed input size.
// extractManifest accepts overrides via its opts arg (the service layer
// wires them from config so deployments with chunky pre-installed
// node_modules can raise the ceilings without patching).
export const MAX_DECOMPRESSED_BYTES = 1024 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
export const MAX_TAR_ENTRIES = 100_000

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

const NATIVE_SCRIPT_PATTERNS = ['node-gyp', 'prebuild-install', 'node-gyp-build', 'node-pre-gyp']

// Walk a `package/node_modules/<pkg>/package.json` entry's parsed JSON and
// decide whether any install lifecycle script references a known native-
// module build tool. The list of patterns is closed (not regex-loose) so we
// don't false-positive on user-defined scripts that happen to mention gyp.
const scriptIndicatesNative = (pkg: unknown): boolean => {
  if (!pkg || typeof pkg !== 'object') return false
  const scripts = (pkg as { scripts?: unknown }).scripts
  if (!scripts || typeof scripts !== 'object') return false
  for (const hook of ['install', 'preinstall', 'postinstall'] as const) {
    const cmd = (scripts as Record<string, unknown>)[hook]
    if (typeof cmd !== 'string') continue
    if (NATIVE_SCRIPT_PATTERNS.some(p => cmd.includes(p))) return true
  }
  return false
}

const NODE_MODULES_PREFIX = 'package/node_modules/'
const isInNodeModules = (path: string) => path.startsWith(NODE_MODULES_PREFIX)

export const extractManifest = async (
  stream: Readable,
  opts: ExtractManifestOpts = {}
): Promise<ExtractManifestResult> => {
  const maxDecompressedBytes = opts.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES
  const maxTarEntries = opts.maxTarEntries ?? MAX_TAR_ENTRIES
  const extract = tar.extract()
  let manifest: Manifest | null = null
  let entryCount = 0
  let hasNativeModules = false

  extract.on('entry', (header, entryStream, next) => {
    entryCount++
    if (entryCount > maxTarEntries) {
      const err = httpError(413, `tarball exceeds ${maxTarEntries} entries`)
      entryStream.on('end', () => next(err))
      entryStream.resume()
      return
    }

    const name = header.name

    // Signal 1: compiled binary inside node_modules
    if (isInNodeModules(name) && name.endsWith('.node')) hasNativeModules = true
    // Signal 2: binding.gyp inside node_modules
    if (isInNodeModules(name) && name.endsWith('/binding.gyp')) hasNativeModules = true
    // Signal 3: prebuilds dir inside node_modules
    if (isInNodeModules(name) && name.includes('/prebuilds/')) hasNativeModules = true

    if (name === 'package/package.json') {
      // top-level manifest — parse and keep, but DO NOT abort. We need to
      // finish walking to collect native-module signals.
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
          next()
        } catch (err) {
          next(httpError(400, `invalid package.json: ${(err as Error).message}`))
        }
      })
      entryStream.on('error', next)
      return
    }

    // Signal 4: subpackage package.json with native script
    if (isInNodeModules(name) && name.endsWith('/package.json')) {
      // Bound the read at MAX_MANIFEST_BYTES — subpackage manifests are tiny.
      let size = 0
      let tooLarge = false
      const chunks: Buffer[] = []
      entryStream.on('data', (chunk: Buffer) => {
        if (tooLarge) return
        size += chunk.length
        if (size > MAX_MANIFEST_BYTES) {
          tooLarge = true
          return
        }
        chunks.push(chunk)
      })
      entryStream.on('end', () => {
        if (tooLarge) {
          next()
          return
        }
        try {
          const pkg = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          if (scriptIndicatesNative(pkg)) hasNativeModules = true
        } catch {
          // ignore malformed subpackage package.json — not our problem here
        }
        next()
      })
      entryStream.on('error', next)
      return
    }

    entryStream.on('end', next)
    entryStream.resume()
  })

  await pipeline(
    stream,
    countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
    createGunzip(),
    countingPassthrough(maxDecompressedBytes, 'decompressed tarball'),
    extract
  )

  if (!manifest) throw httpError(400, 'package.json not found in tarball')
  const result = manifest as Manifest
  if (!result.name) throw httpError(400, 'missing name in package.json')
  if (!result.version) throw httpError(400, 'missing version in package.json')
  if (!semver.valid(result.version)) throw httpError(400, `invalid semver: ${result.version}`)

  return { manifest: result, hasNativeModules }
}

// Sanitize a SPA tar entry path: strip the leading `package/` prefix used by
// npm packs and reject anything that would escape the destination directory
// (absolute paths, `..` segments). Returns the safe relative path, or null
// to skip the entry.
export const sanitizeSpaEntryPath = (rawPath: string): string | null => {
  // npm pack wraps everything in a `package/` dir
  const stripped = rawPath.startsWith('package/') ? rawPath.slice('package/'.length) : rawPath
  // Reject absolute paths and anything containing ..
  if (stripped.startsWith('/') || stripped.includes('..')) return null
  // Reject empty paths (e.g. the `package/` directory entry itself)
  if (!stripped || stripped.endsWith('/')) return null
  return stripped
}
