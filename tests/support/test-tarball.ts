import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
import * as tar from 'tar-stream'

export interface SpaTarballOptions {
  name: string
  version: string
  // Files relative to the SPA root. When omitted, a small default SPA is used.
  files?: Record<string, string>
}

// Build an npm-pack-style tarball for a built SPA: package.json plus the SPA
// files, all nested under `package/`.
export const createSpaTarball = async (options: SpaTarballOptions): Promise<Buffer> => {
  const pack = tar.pack()
  pack.entry(
    { name: 'package/package.json' },
    JSON.stringify({ name: options.name, version: options.version }, null, 2)
  )
  const files = options.files ?? {
    'index.html': '<!doctype html><html><head><title>app</title></head><body>%APPLICATION%</body></html>',
    'assets/app.js': 'console.log("spa")',
    'config-schema.json': '{"type":"object"}'
  }
  for (const [path, content] of Object.entries(files)) {
    pack.entry({ name: 'package/' + path }, content)
  }
  pack.finalize()

  const chunks: Buffer[] = []
  await pipeline(
    pack,
    createGzip(),
    new Writable({
      write (chunk, _encoding, callback) {
        chunks.push(chunk as Buffer)
        callback()
      }
    })
  )
  return Buffer.concat(chunks)
}

export interface TarballOptions {
  name: string
  version: string
  licence?: string
}

export const createTestTarball = async (options: TarballOptions): Promise<Buffer> => {
  const pack = tar.pack()
  const pkg = {
    name: options.name,
    version: options.version,
    ...(options.licence ? { licence: options.licence } : {})
  }

  const content = JSON.stringify(pkg, null, 2)
  pack.entry({ name: 'package/package.json' }, content)
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
