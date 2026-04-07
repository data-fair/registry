import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, unlink, stat, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import resolvePath from 'resolve-path'
import config from '#config'
import type { FileBackend } from './types.ts'

const basePath = () => (config.dataDir ?? '/data') + '/tarballs'

export class FsBackend implements FileBackend {
  async writeStream (stream: Readable, path: string) {
    const fullPath = resolvePath(basePath(), path)
    await mkdir(dirname(fullPath), { recursive: true })
    await pipeline(stream, createWriteStream(fullPath))
  }

  async readStream (path: string) {
    return createReadStream(resolvePath(basePath(), path))
  }

  async delete (path: string) {
    await unlink(resolvePath(basePath(), path)).catch(() => {})
  }

  async exists (path: string) {
    try {
      await stat(resolvePath(basePath(), path))
      return true
    } catch {
      return false
    }
  }

  async clean () {
    await rm(basePath(), { recursive: true, force: true })
  }
}
