import type { Readable } from 'node:stream'
import config from '#config'
import { FsBackend } from './fs.ts'
import { S3Backend } from './s3.ts'
import type { FileBackend } from './types.ts'

export const filesStorage: FileBackend = config.filesStorage === 's3' ? new S3Backend() : new FsBackend()

export const writeTarball = (stream: Readable, path: string) => filesStorage.writeStream(stream, path)
export const readTarball = async (path: string) => filesStorage.readStream(path)
export const deleteTarball = (path: string) => filesStorage.delete(path)
export const tarballExists = (path: string) => filesStorage.exists(path)
export const cleanTarballs = () => filesStorage.clean()
