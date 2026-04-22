import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  paginateListObjectsV2,
  type S3ClientConfig
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { HttpAgent, HttpsAgent } from 'agentkeepalive'
import type { Readable } from 'node:stream'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import type { FileBackend } from './types.ts'

export class S3Backend implements FileBackend {
  private dataClient: S3Client
  private metadataClient: S3Client

  constructor () {
    const s3Config = config.s3 as S3ClientConfig
    this.dataClient = new S3Client({
      ...s3Config,
      requestHandler: new NodeHttpHandler({
        httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50, timeout: 60000 }),
        httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50, timeout: 60000 })
      })
    })
    this.metadataClient = new S3Client({
      ...s3Config,
      requestHandler: new NodeHttpHandler({
        httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50 }),
        httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50 })
      })
    })
  }

  async writeStream (stream: Readable, path: string) {
    const upload = new Upload({
      client: this.dataClient,
      params: {
        Bucket: config.s3!.bucket,
        Key: path,
        Body: stream
      }
    })
    await upload.done()
  }

  async readStream (path: string, ifModifiedSince?: string) {
    const ifModifiedSinceDate = ifModifiedSince ? new Date(ifModifiedSince) : undefined
    const bucketParams = {
      Bucket: config.s3!.bucket,
      Key: path,
      IfModifiedSince: ifModifiedSinceDate
    }
    try {
      const head = await this.metadataClient.send(new HeadObjectCommand(bucketParams))
      if (ifModifiedSinceDate && head.LastModified &&
          Math.floor(head.LastModified.getTime() / 1000) <= Math.floor(ifModifiedSinceDate.getTime() / 1000)) {
        throw httpError(304)
      }
      const response = await this.dataClient.send(new GetObjectCommand(bucketParams))
      return {
        body: response.Body as Readable,
        size: response.ContentLength!,
        lastModified: response.LastModified!
      }
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 304 || err?.name === 'NotModified') {
        throw httpError(304)
      }
      throw err
    }
  }

  async getDownloadUrl (path: string, opts: { filename: string }) {
    const safeFilename = opts.filename.replace(/[\\"\r\n]/g, '_')
    const asciiFilename = safeFilename.replace(/[^\x20-\x7e]/g, '_')
    const encodedFilename = encodeURIComponent(safeFilename)
    const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
    const command = new GetObjectCommand({
      Bucket: config.s3!.bucket,
      Key: path,
      ResponseContentDisposition: contentDisposition
    })
    return getSignedUrl(this.dataClient, command, { expiresIn: config.s3?.downloadUrlExpirySeconds ?? 900 })
  }

  async delete (path: string) {
    await this.metadataClient.send(new DeleteObjectCommand({
      Bucket: config.s3!.bucket,
      Key: path
    }))
  }

  async exists (path: string) {
    try {
      await this.metadataClient.send(new HeadObjectCommand({
        Bucket: config.s3!.bucket,
        Key: path
      }))
      return true
    } catch {
      return false
    }
  }

  async move (srcPath: string, dstPath: string) {
    await this.dataClient.send(new CopyObjectCommand({
      Bucket: config.s3!.bucket,
      CopySource: `${config.s3!.bucket}/${encodeURI(srcPath)}`,
      Key: dstPath
    }))
    await this.metadataClient.send(new DeleteObjectCommand({
      Bucket: config.s3!.bucket,
      Key: srcPath
    }))
  }

  async clean () {
    const pages = paginateListObjectsV2(
      { client: this.metadataClient, pageSize: 100 },
      { Bucket: config.s3!.bucket }
    )
    for await (const page of pages) {
      if (!page.Contents) continue
      await Promise.all(page.Contents.map((obj) =>
        this.metadataClient.send(new DeleteObjectCommand({ Bucket: config.s3!.bucket, Key: obj.Key }))
      ))
    }
  }
}
