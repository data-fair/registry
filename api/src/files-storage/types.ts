import type { Readable } from 'node:stream'

export interface ReadStreamResult {
  body: Readable
  size: number
  lastModified: Date
}

export interface FileBackend {
  writeStream (stream: Readable, path: string): Promise<void>
  readStream (path: string, ifModifiedSince?: string): Promise<ReadStreamResult>
  getDownloadUrl (path: string, opts: { filename: string }): Promise<string | null>
  delete (path: string): Promise<void>
  exists (path: string): Promise<boolean>
  clean (): Promise<void>
}
