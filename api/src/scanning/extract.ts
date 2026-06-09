import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as tar from 'tar'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

export type ExtractOpts = { maxEntries: number }

// Extract a gzipped npm tarball stream into `dir`. node-tar handles gunzip and
// guards against path traversal (it strips `..` and refuses absolute paths by
// default). An entry counter caps the file count to mirror upload-time limits.
//
// Implementation note: node-tar swallows throws from the `filter` callback, so
// instead of throwing we count in `filter` and return false once the cap is
// exceeded — that stops further entries from being written to disk — then
// reject after the pipeline drains. This bounds on-disk output to the cap
// rather than extracting everything and only complaining afterwards.
export const extractTarballToDir = async (stream: Readable, dir: string, opts: ExtractOpts): Promise<void> => {
  let count = 0
  let capError: Error | null = null
  const extract = tar.x({
    cwd: dir,
    gzip: true,
    filter: (path: string) => {
      count++
      if (count > opts.maxEntries) {
        capError ??= httpError(413, `tarball exceeds ${opts.maxEntries} entries`)
        return false // skip this and every subsequent entry
      }
      // Reject anything outside cwd; node-tar already strips '..' but be explicit.
      return !path.includes('..')
    }
  })
  await pipeline(stream, extract)
  if (capError) throw capError
}
