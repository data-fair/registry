import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'
import * as tar from 'tar-stream'

export interface TarballOptions {
  name: string
  version: string
  licence?: string
  category?: string
  processingConfigSchema?: object
  applicationConfigSchema?: object
}

export const createTestTarball = async (options: TarballOptions): Promise<Buffer> => {
  const pack = tar.pack()
  const pkg = {
    name: options.name,
    version: options.version,
    ...(options.licence ? { licence: options.licence } : {}),
    registry: {
      category: options.category || 'other',
      ...(options.processingConfigSchema ? { processingConfigSchema: options.processingConfigSchema } : {}),
      ...(options.applicationConfigSchema ? { applicationConfigSchema: options.applicationConfigSchema } : {})
    }
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
