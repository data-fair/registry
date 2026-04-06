import type { Readable } from 'node:stream'

export interface FileBackend {
  writeStream (stream: Readable, path: string): Promise<void>
  readStream (path: string): Promise<Readable>
  delete (path: string): Promise<void>
  exists (path: string): Promise<boolean>
  clean (): Promise<void>
}
