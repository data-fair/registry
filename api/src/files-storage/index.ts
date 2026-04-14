import type { Readable } from 'node:stream'
import config from '#config'
import { FsBackend } from './fs.ts'
import { S3Backend } from './s3.ts'
import type { FileBackend } from './types.ts'

export const filesStorage: FileBackend = config.filesStorage === 's3' ? new S3Backend() : new FsBackend()

export const writeFile = (stream: Readable, path: string) => filesStorage.writeStream(stream, path)
export const readFile = (path: string, ifModifiedSince?: string) => filesStorage.readStream(path, ifModifiedSince)
export const deleteFile = (path: string) => filesStorage.delete(path)
export const fileExists = (path: string) => filesStorage.exists(path)
export const cleanFiles = () => filesStorage.clean()
