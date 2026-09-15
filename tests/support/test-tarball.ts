import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
import * as tar from 'tar-stream'

export interface TarballEntry {
  /** Full tar path including the `package/` prefix, e.g. `package/node_modules/foo/binding.gyp` */
  name: string
  content: string | Buffer
}

export interface TarballOptions {
  name: string
  version: string
  licence?: string
  /** Additional entries appended after package/package.json. Useful for native-module signal tests. */
  extraEntries?: TarballEntry[]
}

export const createTestTarball = async (options: TarballOptions): Promise<Buffer> => {
  const pack = tar.pack()
  const pkg = {
    name: options.name,
    version: options.version,
    ...(options.licence ? { licence: options.licence } : {})
  }
  pack.entry({ name: 'package/package.json' }, JSON.stringify(pkg, null, 2))
  for (const entry of options.extraEntries ?? []) {
    pack.entry({ name: entry.name }, entry.content)
  }
  pack.finalize()

  const chunks: Buffer[] = []
  const gzip = createGzip()
  await pipeline(
    pack,
    gzip,
    new Writable({
      write (chunk, _encoding, callback) {
        chunks.push(chunk as Buffer)
        callback()
      }
    })
  )
  return Buffer.concat(chunks)
}
