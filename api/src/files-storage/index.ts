import type { Readable } from 'node:stream'
import config from '#config'
import { FsBackend } from './fs.ts'
import { S3Backend } from './s3.ts'
import type { FileBackend } from './types.ts'

export const filesStorage: FileBackend = config.filesStorage === 's3' ? new S3Backend() : new FsBackend()

export const writeFile = (stream: Readable, path: string) => filesStorage.writeStream(stream, path)
export const readFile = (path: string, ifModifiedSince?: string) => filesStorage.readStream(path, ifModifiedSince)
export const getDownloadUrl = (path: string, opts: { filename: string }) => filesStorage.getDownloadUrl(path, opts)
export const deleteFile = (path: string) => filesStorage.delete(path)
export const fileExists = (path: string) => filesStorage.exists(path)
export const fileStats = (path: string) => filesStorage.stats(path)
export const moveFile = (src: string, dst: string) => filesStorage.move(src, dst)
export const cleanFiles = () => filesStorage.clean()
