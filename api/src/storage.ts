import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, unlink, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import config from '#config'

const basePath = () => join(config.dataDir ?? '/data', 'tarballs')

export const writeTarball = async (stream: Readable, relativePath: string) => {
  const fullPath = join(basePath(), relativePath)
  await mkdir(dirname(fullPath), { recursive: true })
  await pipeline(stream, createWriteStream(fullPath))
}

export const readTarball = (relativePath: string) => {
  return createReadStream(join(basePath(), relativePath))
}

export const deleteTarball = async (relativePath: string) => {
  await unlink(join(basePath(), relativePath)).catch(() => {})
}

export const tarballExists = async (relativePath: string) => {
  try {
    await stat(join(basePath(), relativePath))
    return true
  } catch {
    return false
  }
}

export const cleanTarballs = async () => {
  const { rm } = await import('node:fs/promises')
  await rm(basePath(), { recursive: true, force: true })
}
